// Owner: Nived
// Python <-> TypeScript parity (gate G4, first pass). Runs the REAL pipeline output:
//   web/public/data/ephem/ephem.bin  +  web/public/data/golden/golden_set1.json  (Gowri, IM-2 smooth-sphere 30 d).
// Skipped (never faked) when those files are absent or are still Git LFS pointers.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as C from '../core/constants';
import { evaluate, smoothMoon, DEFAULT_DEFINITIONS, stateAt } from '../core/evaluate';
import { hermitePositions } from '../core/interp';
import { loadEphem, type Ephemeris } from '../data/ephem';
import { setDataMode } from '../data/source';
import { PUBLIC, stubFetch } from './helpers';

const EPHEM_BIN = join(PUBLIC, 'data/ephem/ephem.bin');
const GOLDEN = join(PUBLIC, 'data/golden/golden_set1.json');
const CONSTANTS_PY = join(PUBLIC, '../../pipeline/lumen_pipeline/common/constants.py');

const realEphem = existsSync(EPHEM_BIN) && statSync(EPHEM_BIN).size > 1_000_000; // an LFS pointer is ~130 bytes
const realGolden = existsSync(GOLDEN);
const run = realEphem && realGolden;
// CI sets this so a missing/un-hydrated ephem.bin FAILS instead of silently skipping the parity checks.
const mustRun = process.env.LUMEN_REQUIRE_PARITY === '1';

describe('parity data present', () => {
  it.runIf(mustRun)('real ephem.bin and golden_set1.json are available (LUMEN_REQUIRE_PARITY=1)', () => {
    expect(realEphem, 'web/public/data/ephem/ephem.bin missing or still a Git LFS pointer').toBe(true);
    expect(realGolden, 'web/public/data/golden/golden_set1.json missing').toBe(true);
  });
});

interface GoldenCase {
  id: string;
  input: { latitude_deg: number; longitude_deg_east: number; start_utc: string; duration_days: number; observer_height_m: number; definitions: Record<string, number | null> };
  events: Array<{ type: string; utc: string }>;
  windows: Array<{ type: string; start_utc: string; end_utc: string; duration_h: number; peak_elevation_deg: number; flags: { partial_start: boolean; partial_end: boolean } }>;
  metrics: Record<string, { value: number | null } | null>;
  render_samples_hourly: Array<{
    utc: string;
    sun: { azimuth_deg: number; elevation_deg: number; disk_fraction: number; clearance_deg: number; up: boolean };
    earth: { azimuth_deg: number; elevation_deg: number; disk_fraction: number; clearance_deg: number; up: boolean; range_km: number };
  }>;
}
interface Golden {
  tolerances: { azimuth_deg: number; elevation_deg: number; event_time_s: number; metric_percent: number };
  cases: GoldenCase[];
}

describe('constants parity (constants.py <-> constants.ts)', () => {
  it.skipIf(!existsSync(CONSTANTS_PY))('every numeric constant in constants.py matches', () => {
    const py = readFileSync(CONSTANTS_PY, 'utf8');
    const camel: Record<string, number> = {
      LUNAR_RADIUS_KM: C.LUNAR_RADIUS_KM, EARTH_RADIUS_KM: C.EARTH_RADIUS_KM, AU_KM: C.AU_KM, SOLAR_CONSTANT_W_M2: C.SOLAR_CONSTANT_W_M2,
      SPEED_OF_LIGHT_KM_S: C.SPEED_OF_LIGHT_KM_S, SUN_ANGULAR_RADIUS_DEG_AT_1_AU: C.SUN_ANGULAR_RADIUS_DEG_AT_1_AU,
      POLAR_REFERENCE_LATITUDE_DEG: C.POLAR_REFERENCE_LATITUDE_DEG, DEFAULT_SUN_AVAILABLE_DISK_FRACTION: C.DEFAULT_SUN_AVAILABLE_DISK_FRACTION,
      DEFAULT_EARTH_MARGIN_DEG: C.DEFAULT_EARTH_MARGIN_DEG, DEFAULT_DTE_DISK_FRACTION: C.DEFAULT_DTE_DISK_FRACTION,
      DEFAULT_DSN_MASK_DEG: C.DEFAULT_DSN_MASK_DEG, DEFAULT_MIN_SUN_ELEVATION_OPS_DEG: C.DEFAULT_MIN_SUN_ELEVATION_OPS_DEG,
    };
    const found = [...py.matchAll(/^([A-Z0-9_]+)\s*=\s*([-0-9_.]+)\s*$/gm)];
    expect(found.length).toBe(Object.keys(camel).length); // a new Python constant must be mirrored here
    for (const [, name, value] of found) {
      expect(camel[name], `missing in constants.ts: ${name}`).toBeDefined();
      expect(camel[name], name).toBe(Number(value.replaceAll('_', '')));
    }
  });
});

describe.skipIf(!run)('golden set 1: IM-2, smooth sphere, 30 days (real data)', () => {
  let eph: Ephemeris;
  let golden: Golden;
  let c: GoldenCase;

  beforeAll(async () => {
    setDataMode('real');
    stubFetch();
    eph = await loadEphem();
    golden = JSON.parse(readFileSync(GOLDEN, 'utf8')) as Golden;
    c = golden.cases[0];
  });
  afterAll(() => setDataMode(null));

  it('loads the real ephemeris (3600 s nodes, 2023-2030)', () => {
    expect(eph.stepSeconds).toBe(3600);
    expect(eph.count).toBe(70128);
    expect(eph.startMs).toBe(Date.UTC(2023, 0, 1));
    expect(eph.frame).toBe('MOON_ME'); // public frame name (Gowri #21); the SPICE frame is MOON_ME_DE421
    expect(eph.spiceFrame).toBe('MOON_ME_DE421');
  });

  it('Hermite positions are float64-clean at a node and between nodes', () => {
    const at = hermitePositions(eph, eph.startMs + 5 * 3_600_000);
    expect(Math.hypot(...at.sun) / C.AU_KM).toBeGreaterThan(0.98);
    expect(Math.hypot(...at.sun) / C.AU_KM).toBeLessThan(1.02);
    expect(() => hermitePositions(eph, eph.startMs - 1)).toThrow(RangeError);
    expect(() => hermitePositions(eph, eph.endMs)).toThrow(RangeError);
  });

  it('every hourly Sun/Earth sample matches within the golden tolerances', () => {
    const { site, horizon } = smoothMoon(c.input.latitude_deg, c.input.longitude_deg_east, c.input.observer_height_m);
    const d = { ...DEFAULT_DEFINITIONS, sunDiskThreshold: c.input.definitions.sun_disk_threshold!, earthDiskThreshold: c.input.definitions.earth_disk_threshold!, earthMarginDeg: c.input.definitions.earth_margin_deg!, minSunElevationOpsDeg: c.input.definitions.minSunElevationOps! };
    const tol = golden.tolerances;
    expect(c.render_samples_hourly.length).toBeGreaterThan(700);
    let worstAz = 0, worstEl = 0, worstRange = 0;
    for (const g of c.render_samples_hourly) {
      const s = stateAt(eph, site, horizon, d, Date.parse(g.utc));
      for (const body of ['sun', 'earth'] as const) {
        const want = g[body];
        const got = s[body];
        const dAz = Math.abs(((got.azimuthDeg - want.azimuth_deg + 540) % 360) - 180);
        worstAz = Math.max(worstAz, dAz);
        worstEl = Math.max(worstEl, Math.abs(got.elevationDeg - want.elevation_deg));
        expect(Math.abs(got.clearanceDeg - want.clearance_deg), `${body} clearance @${g.utc}`).toBeLessThan(tol.elevation_deg);
        expect(Math.abs(got.diskFraction - want.disk_fraction), `${body} disk @${g.utc}`).toBeLessThan(0.01);
        expect(got.up, `${body} up @${g.utc}`).toBe(want.up);
      }
      worstRange = Math.max(worstRange, Math.abs(s.earth.distanceKm - g.earth.range_km));
    }
    expect(worstAz).toBeLessThan(tol.azimuth_deg);
    expect(worstEl).toBeLessThan(tol.elevation_deg);
    expect(worstRange).toBeLessThan(1); // km
  });

  describe('full 30-day evaluation: events, windows, metrics', () => {
    let ev: ReturnType<typeof evaluate>;
    beforeAll(() => {
      const { site, horizon } = smoothMoon(c.input.latitude_deg, c.input.longitude_deg_east, c.input.observer_height_m);
      const d = { sunDiskThreshold: c.input.definitions.sun_disk_threshold!, earthDiskThreshold: c.input.definitions.earth_disk_threshold!, earthMarginDeg: c.input.definitions.earth_margin_deg!, minSunElevationOpsDeg: c.input.definitions.minSunElevationOps! };
      ev = evaluate({ eph, site, horizon, startMs: Date.parse(c.input.start_utc), durationDays: c.input.duration_days, definitions: d });
    });

    it('finds the same events (type, order) within the time tolerance', () => {
      const got = [...ev.sunEvents, ...ev.earthEvents];
      expect(got.map((e) => e.type)).toEqual(c.events.map((e) => e.type));
      got.forEach((e, i) => {
        const dt = Math.abs(e.t - Date.parse(c.events[i].utc)) / 1000;
        expect(dt, `${e.type} off by ${dt} s`).toBeLessThan(golden.tolerances.event_time_s);
      });
    });

    it('merges the same windows, with the same partial-endpoint flags', () => {
      expect(ev.windows.length).toBe(c.windows.length);
      ev.windows.forEach((w, i) => {
        const g = c.windows[i];
        expect(w.type).toBe(g.type);
        expect(Math.abs(w.startMs - Date.parse(g.start_utc)) / 1000).toBeLessThan(2);
        expect(Math.abs(w.endMs - Date.parse(g.end_utc)) / 1000).toBeLessThan(2);
        expect(w.partialStart).toBe(g.flags.partial_start);
        expect(w.partialEnd).toBe(g.flags.partial_end);
        expect(Math.abs(w.peakElevationDeg - g.peak_elevation_deg)).toBeLessThan(golden.tolerances.elevation_deg);
        expect(Math.abs((w.endMs - w.startMs) / 3_600_000 - g.duration_h)).toBeLessThan(0.01);
      });
    });

    it('computes the same first-pass metrics, and leaves the unavailable ones null', () => {
      const m = ev.metrics;
      const want = c.metrics;
      const pct = golden.tolerances.metric_percent;
      expect(Math.abs(m.sunlitPct.value! - want.sunlitPct!.value!)).toBeLessThan(pct);
      expect(Math.abs(m.earthVisiblePct.value! - want.earthVisiblePct!.value!)).toBeLessThan(pct);
      expect(Math.abs(m.longestNightH.value! - want.longestNightH!.value!)).toBeLessThan(0.1);
      expect(Math.abs(m.sunElevationDeg.value! - want.sunElevationDeg!.value!)).toBeLessThan(golden.tolerances.elevation_deg);
      expect(Math.abs(m.dteMarginDeg.value! - want.dteMarginDeg!.value!)).toBeLessThan(golden.tolerances.elevation_deg);
      for (const k of ['linkPct', 'longestCommGapH', 'opsHours', 'energyPerDayWh'] as const) {
        expect(m[k].value, k).toBeNull();
        expect(want[k]!.value, `golden ${k}`).toBeNull();
      }
    });
  });
});
