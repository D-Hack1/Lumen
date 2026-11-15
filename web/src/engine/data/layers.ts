// Owner: Nived
// Loaders: terrain/layers.json (+ PNGs in terrain/layers/) and terrain/regions.json (data_terrain_misc.md §5, §6).
// Projection parameters are DRAFT (contract 5.4: not frozen); the loader reads whatever each layer entry declares.
import { dataUrl, fetchJson } from './source';
import type { LayerExtent, LayersResult, MapExtent } from '../types';

const VERSIONS = ['0.1.0'];
const EXTENT: Record<'80_90S' | '85_90S', MapExtent> = { '80_90S': '80S', '85_90S': '85S' };

interface RawProjection {
  size_px?: [number, number];
  centre_px?: [number, number];
  lat_limit_deg?: number;
  half_extent_km?: number;
  metres_per_px?: number;
}
interface RawLayers {
  layers: Array<{
    layer_id: string;
    name: string;
    extent: '80_90S' | '85_90S';
    filename?: string | null;
    available?: boolean;
    projection?: RawProjection | null;
    legend_stops?: Array<{ value: number; label: string; hex: string }>;
    source_citation?: string | null;
    derived?: boolean;
  }>;
}
interface RawRegions {
  regions: Array<{ region_id: string; name: string; centroid_lat_deg: number; centroid_lon_deg: number; svg_path: string }>;
}

let cached: Promise<Omit<LayersResult, 'loading' | 'error'>> | null = null;

export function resetLayersCache(): void {
  cached = null;
}

export function loadLayers(): Promise<Omit<LayersResult, 'loading' | 'error'>> {
  if (!cached) {
    cached = Promise.all([fetchJson<RawLayers>('terrain/layers.json', VERSIONS), fetchJson<RawRegions>('terrain/regions.json', VERSIONS)]).then(
      ([l, r]) => {
        const extents: Partial<Record<MapExtent, LayerExtent>> = {};
        const availableLayers: Array<{
          id: string;
          label: string;
          extent: MapExtent;
          url: string;
          legendStops: Array<{ value: number; label: string; color: string }>;
          source: string;
          derived: boolean;
        }> = [];

        for (const e of l.layers) {
          if (e.available === false) continue;
          if (!e.filename) continue;
          const p = e.projection;
          if (
            !p ||
            !p.size_px ||
            !p.centre_px ||
            p.lat_limit_deg === undefined ||
            p.half_extent_km === undefined ||
            p.metres_per_px === undefined
          ) {
            continue;
          }

          const mapExt = EXTENT[e.extent];
          extents[mapExt] ??= {
            latLimitDeg: p.lat_limit_deg,
            halfExtentKm: p.half_extent_km,
            centrePx: p.centre_px,
            metresPerPx: p.metres_per_px,
          };

          availableLayers.push({
            id: e.layer_id,
            label: e.name,
            extent: mapExt,
            url: dataUrl(`terrain/layers/${e.filename}`),
            legendStops: (e.legend_stops ?? []).map((g) => ({ value: g.value, label: g.label, color: g.hex })),
            source: e.source_citation ?? '',
            derived: e.derived === true,
          });
        }

        const firstAvailableProj = l.layers.find((e) => {
          if (e.available === false || !e.filename || !e.projection) return false;
          const p = e.projection;
          return p.size_px && p.centre_px && p.lat_limit_deg !== undefined && p.half_extent_km !== undefined && p.metres_per_px !== undefined;
        })?.projection;

        return {
          sizePx: firstAvailableProj?.size_px ?? null,
          extents: Object.keys(extents).length > 0 ? (extents as LayersResult['extents']) : null,
          layers: availableLayers,
          regions: r.regions.map((g) => ({ id: g.region_id, name: g.name, centroid: { lat: g.centroid_lat_deg, lon: g.centroid_lon_deg }, svgPath: g.svg_path })),
        };
      },
    );
    cached.catch(() => (cached = null));
  }
  return cached;
}
