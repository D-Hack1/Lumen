// Owner: Nived
// Loader: catalog/sites.json + catalog/sparklines.{json,bin}.
import { fetchBuffer, fetchJson } from './source';
import type { SiteRecord, Sparkline } from '../types';

const VERSIONS = [1];

interface RawCoords {
  latitude_deg: number;
  longitude_deg_east: number;
  source: string;
}

const coords = (c: RawCoords) => ({ lat: c.latitude_deg, lon: c.longitude_deg_east, source: c.source });

interface RawSite {
  id: string;
  name: string;
  category: SiteRecord['category'];
  agency: string | null;
  date: string | null;
  as_published_date: string | null;
  latitude_deg: number;
  longitude_deg_east: number;
  landing_coords: RawCoords;
  target_coords: RawCoords | null;
  coord_note: string | null;
  touchdown_utc: string | null;
  touchdown_precision: 'minute' | 'second' | null;
  last_contact_utc: string | null;
  tier: SiteRecord['tier'];
  near_field_res_m: number | null;
  sigma: { source: string; default_deg: number | null };
  pad: { slope_deg: number } | null;
  psr: { distance_km: number; bearing_deg: number; nearest_psr_area_km2: number; source: 'published' | 'derived' } | null;
  sparkline_index: number;
  source_url: string | null;
  verification_status: string;
  provenance_notes: string | null;
}

export interface Catalog {
  sites: SiteRecord[];
  sparklines: Record<string, Sparkline>;
}

let cached: Promise<Catalog> | null = null;

export function loadCatalog(): Promise<Catalog> {
  if (!cached) {
    cached = doLoad();
    cached.catch(() => (cached = null));
  }
  return cached;
}

async function doLoad(): Promise<Catalog> {
  const raw = await fetchJson<{ mock?: boolean; sites: RawSite[] }>('catalog/sites.json', VERSIONS);
  const sites: SiteRecord[] = raw.sites.map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category,
    agency: s.agency,
    date: s.date,
    asPublishedDate: s.as_published_date,
    lat: s.latitude_deg,
    lon: s.longitude_deg_east,
    landingCoords: coords(s.landing_coords),
    targetCoords: s.target_coords ? coords(s.target_coords) : null,
    coordNote: s.coord_note,
    touchdownUtc: s.touchdown_utc ? Date.parse(s.touchdown_utc) : null,
    touchdownPrecision: s.touchdown_precision,
    lastContactUtc: s.last_contact_utc ? Date.parse(s.last_contact_utc) : null,
    tier: s.tier,
    nearFieldResM: s.near_field_res_m,
    sigmaSource: s.sigma.source,
    sigmaDefaultDeg: s.sigma.default_deg,
    padSlopeDeg: s.pad?.slope_deg ?? null,
    psr: s.psr
      ? { distanceKm: s.psr.distance_km, bearingDeg: s.psr.bearing_deg, areaKm2: s.psr.nearest_psr_area_km2, source: s.psr.source }
      : null,
    sparklineIndex: s.sparkline_index,
    sourceUrl: s.source_url,
    verificationStatus: s.verification_status,
    provenanceNotes: s.provenance_notes,
    mock: raw.mock === true,
  }));
  return { sites, sparklines: await loadSparklines() };
}

async function loadSparklines(): Promise<Record<string, Sparkline>> {
  const [h, buf] = await Promise.all([
    fetchJson<{ start_unix_s: number; days: number; sites: string[] }>('catalog/sparklines.json', VERSIONS),
    fetchBuffer('catalog/sparklines.bin'),
  ]);
  const u8 = new Uint8Array(buf);
  const out: Record<string, Sparkline> = {};
  h.sites.forEach((id, i) => {
    const o = i * 2 * h.days;
    out[id] = {
      startUtc: h.start_unix_s * 1000,
      sunlitPct: u8.subarray(o, o + h.days),
      linkPct: u8.subarray(o + h.days, o + 2 * h.days),
    };
  });
  return out;
}
