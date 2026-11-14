// Owner: Nived
// Golden Set 2 (synthetic R3 edge vectors; public/data/golden/golden_set2_synthetic.json, written by Gowri's validation/golden_synthetic.py).
// Hand-derived by Gowri, independent of this code: every case is replayed through the TypeScript engine and compared within the file's own tolerances.
// They exercise primitives only (no DEM, sigma, DSN or catalog data); real site Set 2 cases are still pending.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AU_KM } from '../core/constants';
import { detectEvents } from '../core/events';
import { evaluatePowerSeries } from '../core/power';
import { availability } from '../core/visibility';
import { Horizon } from '../core/visibility';
import { mergeWindows } from '../core/windows';
import { fastEventUncertainty, limbOffsetDeg, numericBounds, shiftHorizonMask, threePassBounds, totalClearanceRateDegPerHour, exactEventUncertainty } from '../core/uncertainty';
import { evaluateWithBounds } from '../core/bounds';
import { DEFAULT_DEFINITIONS } from '../core/evaluate';
import { buildScenarioResult } from '../core/buildResult';
import { makeSite } from '../core/geometry';
import { loadEphem } from '../data/ephem';
import { setDataMode } from '../data/source';
import { PUBLIC, stubFetch } from './helpers';
import type { EventRecord } from '../types';

type Case = { id: string; input: Record<string, any>; expected: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
const file = JSON.parse(readFileSync(join(PUBLIC, 'data/golden/golden_set2_synthetic.json'), 'utf8')) as { cases: Case[]; tolerances: { angle_deg: number; event_time_s: number; delta_t_percent: number } };
const TOL = file.tolerances;
const get = (id: string): Case => file.cases.find((c) => c.id === id)!;
const S = 1000;
const flat = (deg: number) => new Horizon({ elevationsDeg: new Float64Array(360).fill(deg), binWidthDeg: 1 });
const ev = (et: number): EventRecord => ({ type: 'sunset', t: et * S, dtMs: null, grazing: false, grazingReason: null, dtMethod: 'fast' });
const opts = { diskThreshold: 0.5 };

describe('Golden Set 2 (synthetic) vs the TypeScript engine', () => {
  it('has the 12 documented cases (guards against the file silently changing shape)', () => {
    expect(file.cases.map((c) => c.id)).toEqual([
      'synthetic_flat_visibility_boundaries', 'synthetic_terrain_mask_boundary', 'synthetic_disk_limb_conventions', 'synthetic_event_at_window_start',
      'synthetic_total_clearance_rate', 'synthetic_three_pass_bounds', 'synthetic_exact_event_uncertainty', 'synthetic_grazing_rate',
      'synthetic_near_zone_slope_edges', 'synthetic_tier_c_smooth_moon', 'synthetic_min_sun_elevation_ops', 'synthetic_power_eclipse_soc',
    ]);
  });

  it.each(['synthetic_flat_visibility_boundaries', 'synthetic_terrain_mask_boundary'])('%s: elevation +-2 deg about the horizon gives clearance, disk fraction and visibility', (id) => {
    const c = get(id);
    const h = flat(c.input.horizon_deg);
    for (const want of c.expected.visibility) {
      const a = availability('sun', want.elevation_deg, 0, c.input.sun_distance_km, h, opts);
      expect(Math.abs(a.clearanceDeg - want.clearance_deg)).toBeLessThanOrEqual(TOL.angle_deg);
      expect(a.visible).toBe(want.visible);
      if ('disk_fraction' in want) expect(a.fraction).toBeCloseTo(want.disk_fraction, 6);
    }
  });

  it('synthetic_disk_limb_conventions: 0% disk -> +r, 50% -> 0, 100% -> -r', () => {
    const c = get('synthetic_disk_limb_conventions');
    const r = c.input.solar_radius_deg;
    expect(limbOffsetDeg(0, r)).toBeCloseTo(c.expected.limb_clearance_offset_deg.disk_0_pct, 12);
    expect(limbOffsetDeg(0.5, r)).toBeCloseTo(c.expected.limb_clearance_offset_deg.disk_50_pct, 12);
    expect(limbOffsetDeg(1, r)).toBeCloseTo(c.expected.limb_clearance_offset_deg.disk_100_pct, 12);
  });

  it('synthetic_event_at_window_start: a predicate already true at the start has no event and a partial-start window', () => {
    const c = get('synthetic_event_at_window_start');
    const [a, b] = c.input.range_et as [number, number];
    expect(detectEvents(a * S, b * S, (t) => t / S >= 0, { down: 'sunset', up: 'shadowExit' })).toEqual(c.expected.events);
    const times = [a * S, (a + 120) * S, b * S];
    const w = mergeWindows('sun', times, [true, true, true], [1, 1, 1]);
    expect(w.length).toBe(1);
    expect(w[0].startMs / S).toBe(c.expected.window.start_et);
    expect(w[0].endMs / S).toBe(c.expected.window.end_et);
    expect(w[0].partialStart).toBe(c.expected.window.partial_start);
  });

  it('synthetic_total_clearance_rate: d el/dt - (d mask/d az)(d az/dt) = -32.4 deg/h for a moving mask', () => {
    const c = get('synthetic_total_clearance_rate');
    const v = Float64Array.from({ length: 3600 }, (_, i) => c.input.mask_deg_per_bin * i);
    const h = new Horizon({ elevationsDeg: v, binWidthDeg: c.input.mask_bin_width_deg });
    const geom = (t: number) => ({ elevationDeg: 5 + 0.001 * (t / S), azimuthDeg: 10 + 0.1 * (t / S) });
    const [a, b] = c.input.range_et as [number, number];
    const event = ((a + b) / 2) * S; // the +-120 s stencil in the file's range [-20, 220] is centred on et = 100
    expect(totalClearanceRateDegPerHour(event, geom, h)).toBeCloseTo(c.expected.clearance_rate_deg_per_hour, 6);
  });

  it('synthetic_three_pass_bounds: mask 1.0 +- sigma 0.2 -> [0.8, 1.0, 1.2]', () => {
    const c = get('synthetic_three_pass_bounds');
    const h = new Horizon({ elevationsDeg: [c.input.mask_deg, c.input.mask_deg], binWidthDeg: 180 });
    const shifted = [shiftHorizonMask(h, c.input.sigma_deg, -1), h, shiftHorizonMask(h, c.input.sigma_deg, 1)].map((x) => x.elevationAt(90));
    shifted.forEach((x, i) => expect(x).toBeCloseTo(c.expected.shifted_masks_deg[i], 12));
    numericBounds(threePassBounds(h, c.input.sigma_deg, (x) => x.elevationAt(90))).forEach((x, i) => expect(x).toBeCloseTo(c.expected.numeric_bounds[i], 12));
  });

  it('synthetic_exact_event_uncertainty: times 80/100/120 s -> half spread 20 s, exact, no grazing', () => {
    const c = get('synthetic_exact_event_uncertainty');
    const [lo, nom, hi] = c.input.event_times_et as number[];
    const u = exactEventUncertainty(ev(nom), ev(lo), ev(hi));
    expect(u.deltaTSeconds).toBe(c.expected.delta_t_seconds);
    expect(u.dtMethod).toBe(c.expected.dt_method);
    expect(u.grazingReason).toBe(c.expected.grazing_reason);
  });

  it('synthetic_grazing_rate: a clearance that never changes has no finite +-, flagged "rate"', () => {
    const c = get('synthetic_grazing_rate');
    const u = fastEventUncertainty(0, () => ({ elevationDeg: c.input.constant_clearance_deg, azimuthDeg: 0 }), flat(0), () => c.input.sigma_deg);
    expect(c.expected.delta_t_seconds).toBe('infinity');
    expect(u.deltaTSeconds).toBe(Infinity);
    expect(u.grazingReason).toBe(c.expected.grazing_reason);
  });

  it('synthetic_near_zone_slope_edges: the plane only raises the horizon on the uphill side (flat/downhill and cross-slope keep the terrain)', () => {
    const c = get('synthetic_near_zone_slope_edges');
    const i = c.input;
    const h = new Horizon({ elevationsDeg: new Float64Array(360).fill(i.terrain_horizon_deg), binWidthDeg: 1, slopeDeg: i.slope_deg, uphillAzimuthDeg: i.uphill_azimuth_deg, dMinM: i.d_min_m, observerHeightM: i.observer_height_m });
    const flatH = new Horizon({ elevationsDeg: new Float64Array(360).fill(i.terrain_horizon_deg), binWidthDeg: 1, slopeDeg: 0, uphillAzimuthDeg: i.uphill_azimuth_deg, dMinM: i.d_min_m, observerHeightM: i.observer_height_m });
    expect(Math.abs(flatH.effectiveAt(i.uphill_azimuth_deg) - c.expected.flat_or_downhill_effective_deg)).toBeLessThanOrEqual(TOL.angle_deg);
    expect(Math.abs(h.effectiveAt((i.uphill_azimuth_deg + 180) % 360) - c.expected.flat_or_downhill_effective_deg)).toBeLessThanOrEqual(TOL.angle_deg);
    expect(Math.abs(h.effectiveAt((i.uphill_azimuth_deg + 90) % 360) - c.expected.cross_slope_effective_deg)).toBeLessThanOrEqual(TOL.angle_deg);
    // The file stores the hand-rounded 6.25; the exact value is atan(tan 10deg - 1/15) = 6.2597 deg, so (as Gowri's own pytest does) allow 0.01 deg here.
    expect(Math.abs(h.effectiveAt(i.uphill_azimuth_deg) - c.expected.uphill_effective_deg)).toBeLessThanOrEqual(0.01);
  });

  it('synthetic_min_sun_elevation_ops: 5 deg elevation fails the 6 deg ISRO ops minimum even with the full disk', () => {
    const c = get('synthetic_min_sun_elevation_ops');
    const i = c.input;
    const a = availability('sun', i.elevation_deg, 0, AU_KM, flat(0), { diskThreshold: i.disk_threshold, minSunElevationOpsDeg: i.min_sun_elevation_ops_deg });
    expect(a.visible).toBe(c.expected.visible);
    expect(availability('sun', i.elevation_deg, 0, AU_KM, flat(0), { diskThreshold: i.disk_threshold }).visible).toBe(true); // without the ops floor it would be visible
  });

  it('synthetic_power_eclipse_soc: generation, net power and stored energy across daylight then eclipse', () => {
    const c = get('synthetic_power_eclipse_soc');
    const i = c.input;
    const sunDir = [0, 0, 1] as const;
    const r = evaluatePowerSeries(i.times_et, [sunDir, sunDir], [i.sun_distance_km, i.sun_distance_km], i.disk_fractions, [{ normal: i.panel_normal, areaM2: i.panel_area_m2, efficiency: i.panel_efficiency }], i.load_w, {
      batteryCapacityWh: i.battery_capacity_wh, usableDepthOfDischarge: i.usable_depth_of_discharge, initialSocFraction: i.initial_soc_fraction,
    });
    c.expected.generation_w.forEach((x: number, k: number) => expect(r.generationW[k]).toBeCloseTo(x, 9));
    c.expected.net_w.forEach((x: number, k: number) => expect(r.netW[k]).toBeCloseTo(x, 9));
    c.expected.stored_energy_wh.forEach((x: number, k: number) => expect(r.storedEnergyWh[k]).toBeCloseTo(x, 9));
  });

  it('synthetic_tier_c_smooth_moon: no terrain => no sigma, labelled "smooth-Moon bound", and no +- on any value', async () => {
    const c = get('synthetic_tier_c_smooth_moon');
    setDataMode('real');
    stubFetch();
    try {
      const eph = await loadEphem();
      const T = Date.parse('2025-03-06T17:28:50Z');
      const base = {
        siteId: null, tier: 'C' as const, nearFieldResM: null, latDeg: -84.7906, lonDegEast: 29.1957, heightM: c.input.observer_height_m, rotation: null, touchdownMs: null, padSlopeDeg: null, psr: null,
        startMs: T, durationDays: 14, tScrubMs: T, definitions: DEFAULT_DEFINITIONS, dataVersions: { catalog: 1 },
        profile: { minSunlitPct: 0, minLinkHours: 0, maxLongestNightH: 1e9, maxPadSlopeDeg: 90 }, weights: { sunlit: 1, link: 1, night: 1, slope: 1 },
      };
      expect(buildScenarioResult(eph, base).meta!.sigmaSource).toBe(c.expected.label);
      const b = evaluateWithBounds({ eph, site: makeSite(base.latDeg, base.lonDegEast, base.heightM), horizon: new Horizon({ observerHeightM: base.heightM }), startMs: T, durationDays: 14, definitions: DEFAULT_DEFINITIONS }, { sigmaDeg: 0.1, sigmaAtAzimuthDeg: () => 0.1 });
      expect(b.hasBounds).toBe(false);
      expect(b.metrics.sunlitPct.lo).toBeNull();
      for (const e of b.sunEvents) expect(e.dtMs).toBeNull();
    } finally {
      setDataMode(null);
    }
  });
});
