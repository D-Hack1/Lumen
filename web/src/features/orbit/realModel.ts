// Owner: Abhinav
// The Orbit page model backed by the real engine data (ephemeris, DSN series, terrain masks) instead of the design's synthetic
// numbers. Same shape as orbitModel's `model` / `horizon`, so every page reads it unchanged. Only used when VITE_LUMEN_DATA=real
// (see orbitModel.ts); until `loadRealModel()` resolves nothing here may be called.
import { DEFAULT_DEFINITIONS, stateAt, type Definitions } from '../../engine/core/evaluate';
import { makeSite, type Site as EngineSite } from '../../engine/core/geometry';
import { evaluateVerdict } from '../../engine/core/verdict';
import { horizonFromMask } from '../../engine/core/terrainHorizon';
import { Horizon } from '../../engine/core/visibility';
import { loadCatalog } from '../../engine/data/catalog';
import { loadDsnOrNull, type DsnSeries } from '../../engine/data/dsn';
import { loadEphem, type Ephemeris } from '../../engine/data/ephem';
import { loadMaskOrNull, type Mask } from '../../engine/data/masks';
import { dataMode } from '../../engine/data/source';
import type { SiteRecord } from '../../engine/types';
import { setRealEphemeris } from './realEphem';
import { SITES, type Site, type Snapshot } from './orbitModel';
import { windowStats } from '../pages/pagesModel';
import { getBaseUtc } from './windowStart';

/** Hours-since-epoch of the design's t = 0 (2027-02-08 00:00 UTC); duplicated from orbitModel to avoid a runtime import cycle. */


/** Short labels for the site tabs (catalog ids). Unknown ids fall back to the catalog name. */
const SHORT: Record<string, string> = { im2_athena: 'IM-2', shackleton_ridge: 'Ridge', cy3_shiv_shakti: 'CY-3', blue_ghost_m1: 'Blue Ghost' };
const GROUP: Record<string, string> = { historical_landing: 'Historical landing', published_target: 'Published target' };

/** The pages' site list, read from the real catalog (landing coordinates drive computation; see sites.yaml). */
function siteFromRecord(r: SiteRecord): Site {
  return {
    id: r.id,
    name: r.name,
    short: SHORT[r.id] ?? r.name,
    group: [GROUP[r.category] ?? r.category, r.agency].filter(Boolean).join(' · '),
    lat: r.landingCoords.lat,
    lon: r.landingCoords.lon,
    seed: 0,
    lift: 0,
  };
}

const DEFS: Definitions = { ...DEFAULT_DEFINITIONS, dsnMaskDeg: 10 };

interface Loaded {
  eph: Ephemeris;
  dsn: DsnSeries | null;
  records: Map<string, SiteRecord>;
  masks: Map<string, Mask>;
}

let loaded: Loaded | null = null;
let loading: Promise<void> | null = null;

/** True while the pages show the design's sample numbers (mock data mode), false when they show the real data files. */
export const showsSampleValues = (): boolean => dataMode() !== 'real';

export const realModelReady = (): boolean => loaded !== null;

/** Is this page site id one of the real catalog's sites (the pages' site list is the catalog once real data has loaded)? */
export const isCatalogSite = (id: string): boolean => loaded?.records.has(id) ?? false;

export function loadRealModel(): Promise<void> {
  if (!loading) {
    loading = (async () => {
      const [eph, dsn, cat] = await Promise.all([loadEphem(), loadDsnOrNull(), loadCatalog()]);
      const records = new Map(cat.sites.map((s) => [s.id, s]));
      const masks = new Map<string, Mask>();
      for (const id of records.keys()) {
        const m = await loadMaskOrNull(id);
        if (m) masks.set(id, m);
      }
      loaded = { eph, dsn, records, masks };
      setRealEphemeris(eph);
      // Replace the design's sample list in place (the pages read SITES), keeping the catalog's order.
      (SITES as Site[]).splice(0, SITES.length, ...cat.sites.map(siteFromRecord));
    })();
    loading.catch(() => (loading = null));
  }
  return loading;
}

interface Prepared {
  site: EngineSite;
  horizon: Horizon;
  /** true when the horizon is the real terrain mask, false for the smooth-sphere estimate. */
  terrain: boolean;
}

const prepared = new Map<string, Prepared>();

function prepare(site: Site, mast: number): Prepared {
  const key = `${site.id}|${site.lat}|${site.lon}|${mast}`;
  let p = prepared.get(key);
  if (!p) {
    const L = loaded as Loaded;
    const tid = L.records.has(site.id) ? site.id : undefined;
    const rec = tid ? L.records.get(tid) : undefined;
    const rotation = rec?.rotationMatrix ?? undefined;
    const terrainHorizon = tid ? horizonFromMask(L.masks.get(tid), mast) : null;
    // A terrain mask is only valid at the point it was computed for (the catalog coordinates), so evaluate there when it applies.
    const at = terrainHorizon && rec ? { lat: rec.lat, lon: rec.lon } : { lat: site.lat, lon: site.lon };
    const engineSite = makeSite(at.lat, at.lon, mast, rotation);
    p = { site: engineSite, horizon: terrainHorizon ?? new Horizon({ observerHeightM: mast }), terrain: terrainHorizon !== null };
    prepared.set(key, p);
  }
  return p;
}

/** Whether this site / array height is evaluated on a real terrain mask (otherwise the smooth-sphere estimate). */
export const usesTerrain = (site: Site, mast: number): boolean => (loaded ? prepare(site, mast).terrain : false);

export function realSnapshot(t: number, site: Site, mast: number): Snapshot {
  const L = loaded as Loaded;
  const p = prepare(site, mast);
  const s = stateAt(L.eph, p.site, p.horizon, DEFS, getBaseUtc() + t * 3_600_000, L.dsn);
  return {
    sunAz: s.sun.azimuthDeg,
    sunEl: s.sun.elevationDeg,
    frac: s.sun.diskFraction,
    earthAz: s.earth.azimuthDeg,
    earthEl: s.earth.elevationDeg,
    earthUp: s.earth.up,
    dsn: s.linkUp,
  };
}

export function realHorizon(az: number, site: Site, mast: number): number {
  return prepare(site, mast).horizon.effectiveAt(az);
}

// ---- Verdict tags (the curated-site list) ----------------------------------------------------------------------------------
// The engine's own go / no-go rule (core/verdict.ts) on the same 14-day window Compare shows, against the Mission Profile in the
// scenario store (so it follows the profile rather than a copy of it).
// No terrain uncertainty (sigma) exists yet, so geometry requirements remain unconfirmed.
import { getScenario } from '../../state/scenarioStore';
import type { Verdict } from '../../engine/types';

const WINDOW_H = 336;

export interface SiteTag {
  verdict: Verdict;
  label: string;
  tone: 'good' | 'warn' | 'bad' | 'mut';
  /** First reason the engine gave, for a tooltip. */
  reason: string;
}

const TAG: Record<Verdict, { label: string; tone: SiteTag['tone'] }> = {
  GO: { label: 'Go', tone: 'good' },
  MARGINAL: { label: 'Marginal', tone: 'warn' },
  'NO-GO': { label: 'No-go', tone: 'bad' },
  PENDING: { label: 'Unconfirmed', tone: 'mut' },
};

const tagCache = new Map<string, SiteTag>();

export function realSiteTag(site: Site, mast: number): SiteTag {
  const key = `${site.id}|${site.lat}|${site.lon}|${mast}|${JSON.stringify([getScenario().profile, getScenario().weights])}`;
  let tag = tagCache.get(key);
  if (!tag) {
    const L = loaded as Loaded;
    const w = windowStats(site, mast);
    const slope = L.records.get(site.id)?.padSlopeDeg ?? null;
    const b = (v: number | null) => ({ value: v, lo: null, hi: null });
    const r = evaluateVerdict({
      metrics: { sunlitPct: b(w.sun), linkPct: b(w.dsn), longestNightH: b(w.dark), padSlopeDeg: slope === null ? null : b(slope) } as never,
      windowHours: WINDOW_H,
      profile: getScenario().profile,
      weights: getScenario().weights,
      boundsKind: 'insufficient',
      basis: prepare(site, mast).terrain ? 'mask' : 'smooth-moon',
      verifiedRequirements: slope === null ? [] : ['slope'],
    });
    tag = { ...TAG[r.verdict], verdict: r.verdict, reason: r.reasons[0] ?? '' };
    tagCache.set(key, tag);
  }
  return tag;
}
