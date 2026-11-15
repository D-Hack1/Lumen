// Owner: Nived
// Builds the engine Horizon from a published terrain mask (data_masks.md v1.0.0). Pure: no fetching, so it runs identically in the worker and in tests.
// Returns null (=> the caller keeps the smooth-Moon bound and says so) whenever the mask cannot be trusted for this request:
//   * mock masks (fake terrain must never leak into real answers),
//   * an observer height the mask was not built for (it holds 1/2/5/10 m only; we never interpolate or snap heights),
//   * any unavailable (NaN) bin in that height's row (the engine has no defined behaviour for a partial horizon).
import type { Mask } from '../data/masks';
import { Horizon } from './visibility';

export function horizonFromMask(mask: Mask | null | undefined, heightM: number): Horizon | null {
  if (!mask || mask.meta.mock) return null;
  const k = mask.heightsM.indexOf(heightM);
  if (k < 0) return null;
  const row = mask.elevDeg.subarray(k * mask.azimuthCount, (k + 1) * mask.azimuthCount);
  for (let i = 0; i < row.length; i++) if (!Number.isFinite(row[i])) return null;
  const m = mask.meta;
  // R3 D-9 near-zone plane: applies only when all three inputs exist (Horizon enforces this too).
  return new Horizon({ elevationsDeg: row, binWidthDeg: mask.binWidthDeg, slopeDeg: m.slopeDeg, uphillAzimuthDeg: m.uphillAzimuthDeg, dMinM: m.dMinM, observerHeightM: heightM });
}
