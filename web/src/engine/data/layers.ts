// Owner: Nived
// Loader: terrain/layers/layers.json + terrain/regions/regions.json.
import { dataUrl, fetchJson } from './source';
import type { LayersResult } from '../types';

const VERSIONS = [1];

interface RawLayers {
  size_px: [number, number];
  extents: Record<'80S' | '85S', { lat_limit_deg: number; half_extent_km: number; centre_px: [number, number]; metres_per_px: number }>;
  layers: Array<{ id: string; label: string; extent: '80S' | '85S'; file: string; legend_stops: Array<[number, string]>; source: string; derived: boolean }>;
}
interface RawRegions {
  file: string;
  regions: Array<{ id: string; name: string; centroid: { lat: number; lon: number }; approximate_centre: boolean }>;
}

let cached: Promise<Omit<LayersResult, 'loading' | 'error'>> | null = null;

export function loadLayers(): Promise<Omit<LayersResult, 'loading' | 'error'>> {
  if (!cached) {
    cached = Promise.all([
      fetchJson<RawLayers>('terrain/layers/layers.json', VERSIONS),
      fetchJson<RawRegions>('terrain/regions/regions.json', VERSIONS),
    ]).then(([l, r]) => ({
      sizePx: l.size_px,
      extents: {
        '80S': toExtent(l.extents['80S']),
        '85S': toExtent(l.extents['85S']),
      },
      layers: l.layers.map((x) => ({
        id: x.id,
        label: x.label,
        extent: x.extent,
        url: dataUrl(`terrain/layers/${x.file}`),
        legendStops: x.legend_stops,
        source: x.source,
        derived: x.derived,
      })),
      regions: r.regions.map((g) => ({ id: g.id, name: g.name, centroid: g.centroid, approximateCentre: g.approximate_centre })),
      regionsSvgUrl: dataUrl(`terrain/regions/${r.file}`),
    }));
    cached.catch(() => (cached = null));
  }
  return cached;
}

function toExtent(e: RawLayers['extents']['80S']) {
  return { latLimitDeg: e.lat_limit_deg, halfExtentKm: e.half_extent_km, centrePx: e.centre_px, metresPerPx: e.metres_per_px };
}
