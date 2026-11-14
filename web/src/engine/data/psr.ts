// Owner: Nived
// Loader: terrain/psr/psr_distance.{json,bin}. DRAFT: the raster header is unresolved (data_terrain_misc.md §4.2).
// Assumed (matches the mock): uint16 little-endian, distance km = value * unit_km, row-major, top-left origin,
// pixel centre i at x = -half + (i + 0.5) * pixel, y = +half - (j + 0.5) * pixel (polar stereographic, km).
import { DataError, fetchBuffer, fetchJson } from './source';

export interface PsrRaster {
  sizePx: [number, number];
  halfExtentKm: number;
  pixelKm: number;
  derived: boolean;
  /** Ground distance to the nearest qualifying PSR (km) at projected (xKm, yKm); NaN outside the raster. */
  distanceKm(xKm: number, yKm: number): number;
}

interface Raw {
  version: string;
  size_px: [number, number];
  pixel_m: number;
  half_extent_km: number;
  dtype: string;
  unit_km: number;
  source: 'published' | 'derived';
}

let cached: Promise<PsrRaster> | null = null;

export function loadPsr(): Promise<PsrRaster> {
  if (!cached) {
    cached = Promise.all([fetchJson<Raw>('terrain/psr/psr_distance.json'), fetchBuffer('terrain/psr/psr_distance.bin')]).then(([j, buf]) => {
      const [w, h] = j.size_px;
      if (j.dtype !== 'uint16' || buf.byteLength !== w * h * 2) throw new DataError(`psr: expected ${w}x${h} uint16, got ${buf.byteLength} bytes`);
      const dv = new DataView(buf);
      const px = j.pixel_m / 1000;
      return {
        sizePx: j.size_px, halfExtentKm: j.half_extent_km, pixelKm: px, derived: j.source === 'derived',
        distanceKm: (x: number, y: number) => {
          const i = Math.floor((x + j.half_extent_km) / px);
          const k = Math.floor((j.half_extent_km - y) / px);
          return i < 0 || k < 0 || i >= w || k >= h ? NaN : dv.getUint16((k * w + i) * 2, true) * j.unit_km;
        },
      };
    });
    cached.catch(() => (cached = null));
  }
  return cached;
}
