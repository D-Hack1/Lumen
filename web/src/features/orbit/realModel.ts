// Owner: Abhinav
// The Orbit page model backed by the real engine data (ephemeris, DSN series, terrain masks) instead of the design's synthetic
// numbers. Same shape as orbitModel's `model` / `horizon`, so every page reads it unchanged. Only used when VITE_LUMEN_DATA=real
// (see orbitModel.ts); until `loadRealModel()` resolves nothing here may be called.
import { DEFAULT_DEFINITIONS, stateAt, type Definitions } from '../../engine/core/evaluate';
import { makeSite, type Site as EngineSite } from '../../engine/core/geometry';
import { horizonFromMask } from '../../engine/core/terrainHorizon';
import { Horizon } from '../../engine/core/visibility';
import { loadCatalog } from '../../engine/data/catalog';
import { loadDsnOrNull, type DsnSeries } from '../../engine/data/dsn';
import { loadEphem, type Ephemeris } from '../../engine/data/ephem';
import { loadMaskOrNull, type Mask } from '../../engine/data/masks';
import { dataMode } from '../../engine/data/source';
import type { SiteRecord } from '../../engine/types';
import type { Site, Snapshot } from './orbitModel';

/** Hours-since-epoch of the design's t = 0 (2027-02-08 00:00 UTC); duplicated from orbitModel to avoid a runtime import cycle. */
const BASE_UTC = Date.UTC(2027, 1, 8, 0, 0, 0);

/** Orbit-page site id -> catalog / terrain id. Sites not listed have no published terrain and use the smooth-Moon horizon. */
const TERRAIN_ID: Record<string, string> = { im2: 'im2_athena', shack: 'shackleton_ridge' };

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

export function loadRealModel(): Promise<void> {
  if (!loading) {
    loading = (async () => {
      const [eph, dsn, cat] = await Promise.all([loadEphem(), loadDsnOrNull(), loadCatalog()]);
      const records = new Map(cat.sites.map((s) => [s.id, s]));
      const masks = new Map<string, Mask>();
      for (const id of Object.values(TERRAIN_ID)) {
        const m = await loadMaskOrNull(id);
        if (m) masks.set(id, m);
      }
      loaded = { eph, dsn, records, masks };
    })();
    loading.catch(() => (loading = null));
  }
  return loading;
}

interface Prepared {
  site: EngineSite;
  horizon: Horizon;
  /** true when the horizon is the real terrain mask, false for the smooth-Moon bound. */
  terrain: boolean;
}

const prepared = new Map<string, Prepared>();

function prepare(site: Site, mast: number): Prepared {
  const key = `${site.id}|${site.lat}|${site.lon}|${mast}`;
  let p = prepared.get(key);
  if (!p) {
    const L = loaded as Loaded;
    const tid = TERRAIN_ID[site.id];
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

/** Whether this site / array height is evaluated on a real terrain mask (otherwise the smooth-Moon, optimistic bound). */
export const usesTerrain = (site: Site, mast: number): boolean => (loaded ? prepare(site, mast).terrain : false);

export function realSnapshot(t: number, site: Site, mast: number): Snapshot {
  const L = loaded as Loaded;
  const p = prepare(site, mast);
  const s = stateAt(L.eph, p.site, p.horizon, DEFS, BASE_UTC + t * 3_600_000, L.dsn);
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
