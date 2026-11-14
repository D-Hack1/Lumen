// Owner: Nived
// Loaders: terrain/layers.json (+ PNGs in terrain/layers/) and terrain/regions.json (data_terrain_misc.md §5, §6).
// Projection parameters are DRAFT (contract 5.4: not frozen); the loader reads whatever each layer entry declares.
import { dataUrl, fetchJson } from './source';
import type { LayerExtent, LayersResult, MapExtent } from '../types';

const VERSIONS = ['0.1.0'];
const EXTENT: Record<'80_90S' | '85_90S', MapExtent> = { '80_90S': '80S', '85_90S': '85S' };

interface RawProjection {
  size_px: [number, number];
  centre_px: [number, number];
  lat_limit_deg: number;
  half_extent_km: number;
  metres_per_px: number;
}
interface RawLayers {
  layers: Array<{
    layer_id: string;
    name: string;
    extent: '80_90S' | '85_90S';
    filename: string;
    projection: RawProjection;
    legend_stops: Array<{ value: number; label: string; hex: string }>;
    source_citation: string;
    derived?: boolean;
  }>;
}
interface RawRegions {
  regions: Array<{ region_id: string; name: string; centroid_lat_deg: number; centroid_lon_deg: number; svg_path: string }>;
}

let cached: Promise<Omit<LayersResult, 'loading' | 'error'>> | null = null;

export function loadLayers(): Promise<Omit<LayersResult, 'loading' | 'error'>> {
  if (!cached) {
    cached = Promise.all([fetchJson<RawLayers>('terrain/layers.json', VERSIONS), fetchJson<RawRegions>('terrain/regions.json', VERSIONS)]).then(
      ([l, r]) => {
        const extents: Partial<Record<MapExtent, LayerExtent>> = {};
        for (const e of l.layers) {
          const p = e.projection;
          extents[EXTENT[e.extent]] ??= { latLimitDeg: p.lat_limit_deg, halfExtentKm: p.half_extent_km, centrePx: p.centre_px, metresPerPx: p.metres_per_px };
        }
        return {
          sizePx: l.layers[0]?.projection.size_px ?? null,
          extents: extents as LayersResult['extents'],
          layers: l.layers.map((x) => ({
            id: x.layer_id, label: x.name, extent: EXTENT[x.extent], url: dataUrl(`terrain/layers/${x.filename}`),
            legendStops: x.legend_stops.map((g) => ({ value: g.value, label: g.label, color: g.hex })), source: x.source_citation, derived: x.derived === true,
          })),
          regions: r.regions.map((g) => ({ id: g.region_id, name: g.name, centroid: { lat: g.centroid_lat_deg, lon: g.centroid_lon_deg }, svgPath: g.svg_path })),
        };
      },
    );
    cached.catch(() => (cached = null));
  }
  return cached;
}
