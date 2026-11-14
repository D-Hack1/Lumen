// Owner: Nived
// Loader: ephem/ephem.{bin,json} (data_ephemeris.md). Per node (every `cadenceS`), 12 float32:
// sun_position_km[3], sun_velocity_km_s[3], earth_position_km[3], earth_velocity_km_s[3]; Moon-centred, MOON_ME frame.
// Never hard-code the cadence: real data is 3600 s, the mock is longer. Interpolation lives in core/interp.ts (N-5).
import { loadBinArray, positiveExtra, utcExtra } from './binArray';
import { DataError } from './source';

export const EPHEM_STRIDE = 12;
/** Offsets inside one record. */
export const EPHEM = { sunPos: 0, sunVel: 3, earthPos: 6, earthVel: 9 } as const;

export interface Ephemeris {
  startMs: number;
  cadenceMs: number;
  count: number;
  endMs: number; // time of the last node
  /** (count, 12) row-major float32. Read values into float64 maths; never accumulate in float32. */
  data: Float32Array;
  frame: string;
  mock: boolean;
}

let cached: Promise<Ephemeris> | null = null;

export function loadEphem(): Promise<Ephemeris> {
  if (!cached) {
    cached = doLoad();
    cached.catch(() => (cached = null));
  }
  return cached;
}

async function doLoad(): Promise<Ephemeris> {
  const { sidecar: s, data } = await loadBinArray('ephem/ephem', ['1', 1]);
  if (s.dtype !== 'float32' || s.shape.length !== 2 || s.shape[1] !== EPHEM_STRIDE) {
    throw new DataError(`ephem: expected float32 shape [n, ${EPHEM_STRIDE}], got ${s.dtype} [${s.shape.join(', ')}]`);
  }
  if (s.fields.length !== EPHEM_STRIDE) throw new DataError(`ephem: expected ${EPHEM_STRIDE} fields, got ${s.fields.length}`);
  if (s.shape[0] < 2) throw new DataError('ephem: need at least 2 nodes for interpolation');
  if (s.frame !== 'MOON_ME') throw new DataError(`ephem: unexpected frame ${String(s.frame)} (expected MOON_ME)`);
  const startMs = utcExtra('ephem', s, 'start_utc');
  const cadenceMs = positiveExtra('ephem', s, 'cadence_s') * 1000;
  const count = s.shape[0];
  return { startMs, cadenceMs, count, endMs: startMs + (count - 1) * cadenceMs, data: data as Float32Array, frame: s.frame as string, mock: s.mock === true };
}
