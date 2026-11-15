// Owner: Abhinav
// Orbit feature — Sun / Earth geometry in the selenographic frame, from "hours since the last new moon".
//
// Frame (right-handed): +x = sub-Earth point (lat 0, lon 0), +y = 90°E, +z = lunar north.
// Everything here is a smooth analytic stand-in (mean synodic month, fixed sub-solar latitude, sinusoidal libration).
// The real ephemeris lives in public/data/ephem; when that is wired in, only this file changes — callers take the
// vectors and angles and never re-derive them.

export type Vec3 = readonly [number, number, number];

export const SYNODIC_HOURS = 708.73;
/** Mean sub-solar latitude used for lighting (degrees). The true value swings ±1.54°; −1° is about right for February. */
export const DEFAULT_SUBSOLAR_LAT_DEG = -1.0;
/** New moon of 2027-02-07 16:56 UTC — the epoch `hoursSinceNewMoon` is counted from in demos and tests. */
export const REFERENCE_NEW_MOON_UTC = Date.UTC(2027, 1, 7, 16, 56, 0);

const RAD = Math.PI / 180;

export function hoursSinceNewMoon(date: Date | number): number {
  const ms = typeof date === 'number' ? date : date.getTime();
  return (ms - REFERENCE_NEW_MOON_UTC) / 3_600_000;
}

/** Wrap an angle in degrees to [-180, 180). */
export const wrapLon = (deg: number): number => ((((deg + 180) % 360) + 360) % 360) - 180;

export interface LatLon {
  lat: number;
  lon: number;
}

/** Sub-solar point. At new moon the Sun is over the far side (lon 180°); at full moon over the sub-Earth point (lon 0°). */
export function subsolarPoint(hours: number, latDeg: number = DEFAULT_SUBSOLAR_LAT_DEG): LatLon {
  return { lat: latDeg, lon: wrapLon(180 - (360 * hours) / SYNODIC_HOURS) };
}

/** Optical libration of Earth as seen from the Moon (degrees). Amplitude and periods are the mean values. */
export function earthLibration(hours: number): LatLon {
  return { lon: 6.5 * Math.sin((2 * Math.PI * hours) / 661), lat: 6.5 * Math.sin((2 * Math.PI * hours) / 655.7) };
}

export function latLonToVec(latDeg: number, lonDeg: number): Vec3 {
  const la = latDeg * RAD;
  const lo = lonDeg * RAD;
  return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
}

export function vecToLatLon(v: Vec3): LatLon {
  const r = Math.hypot(v[0], v[1], v[2]) || 1;
  return { lat: Math.asin(Math.max(-1, Math.min(1, v[2] / r))) / RAD, lon: Math.atan2(v[1], v[0]) / RAD };
}

export const sunVector = (hours: number, subsolarLatDeg?: number): Vec3 => {
  const p = subsolarPoint(hours, subsolarLatDeg);
  return latLonToVec(p.lat, p.lon);
};

export const earthVector = (hours: number): Vec3 => {
  const l = earthLibration(hours);
  return latLonToVec(l.lat, l.lon);
};

/** Longitude (degrees E) of the Earth's surface that faces the Moon — Earth spins 15°/h eastward, so this runs west. */
export const earthSubLunarLonDeg = (hours: number): number => wrapLon(25 - 15 * hours);

export type PhaseName =
  | 'New moon'
  | 'Waxing crescent'
  | 'First quarter'
  | 'Waxing gibbous'
  | 'Full moon'
  | 'Waning gibbous'
  | 'Last quarter'
  | 'Waning crescent';

export interface Phase {
  /** Lit fraction of the near side as seen from Earth, 0–1. */
  illuminated: number;
  /** Position in the month, 0 (new) → 0.5 (full) → 1 (new). */
  cycle: number;
  name: PhaseName;
}

export function phaseAt(hours: number, subsolarLatDeg?: number): Phase {
  const s = sunVector(hours, subsolarLatDeg);
  const illuminated = (1 + s[0]) / 2; // angle between Earth and Sun as seen from the Moon
  const cycle = (((hours / SYNODIC_HOURS) % 1) + 1) % 1;
  const waxing = cycle < 0.5;
  let name: PhaseName;
  if (illuminated < 0.03) name = 'New moon';
  else if (illuminated > 0.97) name = 'Full moon';
  else if (illuminated < 0.45) name = waxing ? 'Waxing crescent' : 'Waning crescent';
  else if (illuminated < 0.55) name = waxing ? 'First quarter' : 'Last quarter';
  else name = waxing ? 'Waxing gibbous' : 'Waning gibbous';
  return { illuminated, cycle, name };
}

/** Direction the Sun is in on the polar map, degrees clockwise from "up" (0° E up, east to the right). */
export const polarSunAzimuthDeg = (hours: number): number => ((subsolarPoint(hours).lon % 360) + 360) % 360;
