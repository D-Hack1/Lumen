// Owner: Nived
// One scenario evaluation, the TypeScript twin of validation/golden.py `build_golden_set` (this is what the golden
// parity test runs, and what the worker will run for every scenario). Geometry-only: smooth-Moon or mask horizon,
// no DSN/power/uncertainty yet (those fields stay null).
import type { Ephemeris } from '../data/ephem';
import { detectEvents, sampleTimes } from './events';
import { bodyAt, makeSite, type Site } from './geometry';
import { firstPassMetrics } from './metrics';
import { availability, Horizon, type AvailabilityOptions } from './visibility';
import { mergeWindows, toWindowRecord, type RawWindow } from './windows';
import type { EventRecord, WindowRecord } from '../types';
import type { FirstPassMetrics } from './metrics';

export interface Definitions {
  sunDiskThreshold: number; // fraction 0..1
  earthDiskThreshold: number;
  earthMarginDeg: number;
  minSunElevationOpsDeg: number;
}

export const DEFAULT_DEFINITIONS: Definitions = { sunDiskThreshold: 0.5, earthDiskThreshold: 0.5, earthMarginDeg: 1, minSunElevationOpsDeg: 0 };

export interface EvaluateInput {
  eph: Ephemeris;
  site: Site;
  horizon: Horizon;
  startMs: number;
  durationDays: number;
  definitions?: Definitions;
}

export interface BodySample {
  azimuthDeg: number;
  elevationDeg: number;
  distanceKm: number;
  diskFraction: number;
  clearanceDeg: number;
  up: boolean;
}

export interface SamplePoint {
  t: number;
  sun: BodySample;
  earth: BodySample;
}

export interface Evaluation {
  times: number[];
  samples: SamplePoint[];
  sunEvents: EventRecord[];
  earthEvents: EventRecord[];
  windows: RawWindow[];
  windowRecords: WindowRecord[];
  metrics: FirstPassMetrics;
}

export function stateAt(eph: Ephemeris, site: Site, horizon: Horizon, d: Definitions, tMs: number): SamplePoint {
  const sunOpts: AvailabilityOptions = { diskThreshold: d.sunDiskThreshold, minSunElevationOpsDeg: d.minSunElevationOpsDeg };
  const earthOpts: AvailabilityOptions = { diskThreshold: d.earthDiskThreshold, marginDeg: d.earthMarginDeg };
  const sg = bodyAt(eph, 'sun', tMs, site);
  const eg = bodyAt(eph, 'earth', tMs, site);
  const sa = availability('sun', sg.elevationDeg, sg.azimuthDeg, sg.distanceKm, horizon, sunOpts);
  const ea = availability('earth', eg.elevationDeg, eg.azimuthDeg, eg.distanceKm, horizon, earthOpts);
  return {
    t: tMs,
    sun: { ...sg, diskFraction: sa.fraction, clearanceDeg: sa.clearanceDeg, up: sa.visible },
    earth: { ...eg, diskFraction: ea.fraction, clearanceDeg: ea.clearanceDeg, up: ea.visible },
  };
}

export function evaluate(input: EvaluateInput): Evaluation {
  const { eph, site, horizon } = input;
  const d = input.definitions ?? DEFAULT_DEFINITIONS;
  const endMs = input.startMs + input.durationDays * 86_400_000;
  const times = sampleTimes(input.startMs, endMs);
  const samples = times.map((t) => stateAt(eph, site, horizon, d, t));
  const sunUp = samples.map((s) => s.sun.up);
  const earthUp = samples.map((s) => s.earth.up);
  const sunPredicate = (t: number) => stateAt(eph, site, horizon, d, t).sun.up;
  const earthPredicate = (t: number) => stateAt(eph, site, horizon, d, t).earth.up;
  const sunEvents = detectEvents(input.startMs, endMs, sunPredicate, { down: 'sunset', up: 'shadowExit' }, { times, values: sunUp });
  const earthEvents = detectEvents(input.startMs, endMs, earthPredicate, { down: 'earthset', up: 'earthrise' }, { times, values: earthUp });
  const sunEl = samples.map((s) => s.sun.elevationDeg);
  const earthEl = samples.map((s) => s.earth.elevationDeg);
  const windows = [...mergeWindows('sun', times, sunUp, sunEl), ...mergeWindows('earth', times, earthUp, earthEl)];
  const metrics = firstPassMetrics({
    times, sunVisible: sunUp, earthVisible: earthUp, sunElevationDeg: sunEl, earthElevationDeg: earthEl,
    sunClearanceDeg: samples.map((s) => s.sun.clearanceDeg), earthClearanceDeg: samples.map((s) => s.earth.clearanceDeg),
    sunDiskFraction: samples.map((s) => s.sun.diskFraction),
  });
  return { times, samples, sunEvents, earthEvents, windows, windowRecords: windows.map(toWindowRecord), metrics };
}

/** Convenience for the smooth-Moon (Tier C) case: no terrain, observer on the reference sphere. */
export function smoothMoon(latDeg: number, lonDegEast: number, heightM: number): { site: Site; horizon: Horizon } {
  return { site: makeSite(latDeg, lonDegEast, heightM), horizon: new Horizon({ observerHeightM: heightM }) };
}
