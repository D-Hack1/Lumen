// Owner: Nived
// R3 horizon interpolation, near-zone occluder and disk visibility (Python twin: reference/visibility.py).
// Same function names and the same sampling rules as the Python, so the two agree to float precision.
import { AU_KM, DEG, EARTH_RADIUS_KM, LUNAR_RADIUS_KM, SUN_ANGULAR_RADIUS_DEG_AT_1_AU } from './constants';
import type { BodyId } from './interp';

export interface HorizonInit {
  /** One height's elevation profile (bin centres at (i + 0.5) * binWidthDeg). Omit for the smooth-Moon (Tier C) horizon. */
  elevationsDeg?: ArrayLike<number> | null;
  binWidthDeg?: number;
  /** R3 D-9 near-zone occluder inputs; all three must be set for it to apply. */
  slopeDeg?: number | null;
  uphillAzimuthDeg?: number | null;
  dMinM?: number | null;
  observerHeightM?: number;
}

export class Horizon {
  readonly elevationsDeg: ArrayLike<number> | null;
  readonly binWidthDeg: number;
  readonly slopeDeg: number | null;
  readonly uphillAzimuthDeg: number | null;
  readonly dMinM: number | null;
  readonly observerHeightM: number;

  constructor(init: HorizonInit = {}) {
    this.elevationsDeg = init.elevationsDeg ?? null;
    this.binWidthDeg = init.binWidthDeg ?? 0.1;
    this.slopeDeg = init.slopeDeg ?? null;
    this.uphillAzimuthDeg = init.uphillAzimuthDeg ?? null;
    this.dMinM = init.dMinM ?? null;
    this.observerHeightM = init.observerHeightM ?? 0;
  }

  /** The same horizon with a different terrain mask. Near-zone plane parameters and observer height are kept (R3: the +/- sigma passes shift only the mask). */
  withElevations(elevationsDeg: ArrayLike<number>): Horizon {
    return new Horizon({ elevationsDeg, binWidthDeg: this.binWidthDeg, slopeDeg: this.slopeDeg, uphillAzimuthDeg: this.uphillAzimuthDeg, dMinM: this.dMinM, observerHeightM: this.observerHeightM });
  }

  /** Smooth-sphere dip when there is no mask; otherwise periodic linear interpolation between bin centres. */
  elevationAt(azimuthDeg: number): number {
    const values = this.elevationsDeg;
    if (values == null) {
      return -Math.acos(LUNAR_RADIUS_KM / (LUNAR_RADIUS_KM + this.observerHeightM / 1000)) / DEG;
    }
    const n = values.length;
    const mod = ((azimuthDeg % 360) + 360) % 360;
    const coordinate = mod / this.binWidthDeg - 0.5;
    const floor = Math.floor(coordinate);
    const left = ((floor % n) + n) % n;
    const fraction = coordinate - floor;
    const right = (left + 1) % n;
    return (1 - fraction) * values[left] + fraction * values[right];
  }

  /** Effective mask: terrain, raised by the near-zone plane when it is uphill; the terrain value itself is never clamped. */
  effectiveAt(azimuthDeg: number): number {
    const terrain = this.elevationAt(azimuthDeg);
    if (this.slopeDeg == null || this.uphillAzimuthDeg == null || this.dMinM == null) return terrain;
    const slope = this.slopeDeg * DEG;
    const near = Math.atan(Math.tan(slope) * Math.cos((azimuthDeg - this.uphillAzimuthDeg) * DEG) - this.observerHeightM / this.dMinM) / DEG;
    const nearPositive = Math.max(0, near);
    return nearPositive === 0 ? terrain : Math.max(terrain, nearPositive); // as reference/visibility.py: a flat or downhill plane never lifts a below-zero terrain horizon to 0
  }

  /** Min and max of the effective mask over [centre - halfWidth, centre + halfWidth] (sampled like the Python reference). */
  extrema(centreAzimuthDeg: number, halfWidthDeg: number): [number, number] {
    if (this.elevationsDeg == null) {
      const v = this.effectiveAt(centreAzimuthDeg);
      return [v, v];
    }
    const count = Math.max(2, Math.ceil((2 * halfWidthDeg) / this.binWidthDeg) + 2);
    const lo = centreAzimuthDeg - halfWidthDeg;
    const hi = centreAzimuthDeg + halfWidthDeg;
    let mn = Infinity;
    let mx = -Infinity;
    for (let i = 0; i < count; i++) {
      const v = this.effectiveAt(lo + ((hi - lo) * i) / (count - 1));
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    return [mn, mx];
  }
}

export function angularRadiusDeg(body: BodyId, distanceKm: number): number {
  if (body === 'sun') return (SUN_ANGULAR_RADIUS_DEG_AT_1_AU * AU_KM) / distanceKm;
  return Math.asin(EARTH_RADIUS_KM / distanceKm) / DEG;
}

/** Visible fraction (0..1) of the body's disk above the effective mask: span short-circuit, then 24 (Sun) / 32 (Earth) chords. */
export function diskFraction(body: BodyId, elevationDeg: number, azimuthDeg: number, distanceKm: number, horizon: Horizon): number {
  const radius = angularRadiusDeg(body, distanceKm);
  const cosine = Math.max(Math.cos(Math.min(Math.abs(elevationDeg), 89.9) * DEG), Math.cos(89.9 * DEG));
  const halfWidth = radius >= 90 - elevationDeg ? 180 : Math.asin(Math.sin(radius * DEG) / cosine) / DEG;
  const [minimum, maximum] = horizon.extrema(azimuthDeg, halfWidth);
  if (elevationDeg - 1.05 * radius > maximum) return 1;
  if (elevationDeg + 1.05 * radius < minimum) return 0;
  const chords = body === 'sun' ? 24 : 32;
  const r = radius * DEG;
  let visibleArea = 0;
  for (let i = 0; i < chords; i++) {
    const x = r * ((2 * (i + 0.5)) / chords - 1);
    const halfChord = Math.sqrt(Math.max(0, r * r - x * x));
    const azimuthOffset = Math.asin(Math.sin(x) / cosine) / DEG;
    const mask = horizon.effectiveAt(azimuthDeg + azimuthOffset);
    const visibleLower = Math.max(-halfChord, (mask - elevationDeg) * DEG);
    visibleArea += Math.max(0, halfChord - visibleLower);
  }
  const f = (visibleArea * ((2 * r) / chords)) / (Math.PI * r * r);
  return Math.min(1, Math.max(0, f));
}

export interface Availability {
  fraction: number;
  clearanceDeg: number;
  visible: boolean;
}

export interface AvailabilityOptions {
  diskThreshold: number;
  marginDeg?: number;
  minSunElevationOpsDeg?: number;
}

/** "Available" per the Definitions: disk >= threshold AND clearance >= margin (AND, for the Sun, elevation >= ops minimum). */
export function availability(
  body: BodyId,
  elevationDeg: number,
  azimuthDeg: number,
  distanceKm: number,
  horizon: Horizon,
  opts: AvailabilityOptions,
): Availability {
  const fraction = diskFraction(body, elevationDeg, azimuthDeg, distanceKm, horizon);
  const clearanceDeg = elevationDeg - horizon.effectiveAt(azimuthDeg);
  let visible = fraction >= opts.diskThreshold && clearanceDeg >= (opts.marginDeg ?? 0);
  if (body === 'sun') visible = visible && elevationDeg >= (opts.minSunElevationOpsDeg ?? 0);
  return { fraction, clearanceDeg, visible };
}
