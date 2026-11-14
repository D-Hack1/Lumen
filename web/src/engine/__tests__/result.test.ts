// Owner: Nived
// ScenarioResult built from the REAL ephemeris (IM-2, smooth horizon) - what the Answer Strip / Metric Deck show in real mode.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { evaluateScenario, latestWins } from '../client';
import { buildScenarioResult, type ScenarioRequest } from '../core/buildResult';
import { DEFAULT_DEFINITIONS } from '../core/evaluate';
import { loadEphem, type Ephemeris } from '../data/ephem';
import { setDataMode } from '../data/source';
import { PUBLIC, stubFetch } from './helpers';

const EPHEM_BIN = join(PUBLIC, 'data/ephem/ephem.bin');
const GOLDEN = join(PUBLIC, 'data/golden/golden_set1.json');
const run = existsSync(EPHEM_BIN) && statSync(EPHEM_BIN).size > 1_000_000 && existsSync(GOLDEN);

const TOUCHDOWN = Date.parse('2025-03-06T17:28:50Z');
const base: ScenarioRequest = {
  siteId: 'im2_athena', tier: 'pending', nearFieldResM: null, latDeg: -84.7906, lonDegEast: 29.1957, heightM: 2, rotation: null,
  touchdownMs: TOUCHDOWN, padSlopeDeg: null, psr: null, startMs: TOUCHDOWN, durationDays: 30, tScrubMs: TOUCHDOWN,
  definitions: DEFAULT_DEFINITIONS, dataVersions: { catalog: 1 },
};

describe.skipIf(!run)('buildScenarioResult (real IM-2 ephemeris)', () => {
  let eph: Ephemeris;
  const golden = run ? (JSON.parse(readFileSync(GOLDEN, 'utf8')).cases[0] as { events: Array<{ type: string; utc: string }>; metrics: Record<string, { value: number }> }) : null;
  beforeAll(async () => {
    setDataMode('real');
    stubFetch();
    eph = await loadEphem();
  });
  afterAll(() => setDataMode(null));

  it('answers "Sun now / Sunset in" from the real geometry, matching the golden sunset', () => {
    const r = buildScenarioResult(eph, base);
    expect(r.status).toBe('ready');
    expect(r.answer!.sun.up).toBe(true);
    expect(r.answer!.sun.state).toBe('sunsetIn');
    const goldenSunset = Date.parse(golden!.events.find((e) => e.type === 'sunset')!.utc);
    expect(Math.abs(r.answer!.sun.nextEventT! - goldenSunset)).toBeLessThan(60_000);
    expect(r.answer!.sun.elevDeg).toBeCloseTo(2.4646, 3); // from the golden render sample at touchdown
    expect(r.answer!.earth.state).toBe('earthsetIn');
  });

  it('never invents values it does not have: no sigma bounds, no power, verdict pending, honest labels', () => {
    const r = buildScenarioResult(eph, base);
    expect(r.verdict).toBe('PENDING');
    expect(r.verdictReasons[0]).toMatch(/not available yet/);
    expect(r.metrics!.energyPerDayWh.value).toBeNull();
    expect(r.metrics!.sunlitPct.lo).toBeNull(); // no +/- until the uncertainty passes exist
    expect(r.meta!.sigmaSource).toBe('smooth-Moon bound');
    expect(r.meta!.definitionsSummary).toMatch(/DSN not applied/);
    expect(r.metrics!.sunlitPct.value).toBeCloseTo(golden!.metrics.sunlitPct.value, 6);
  });

  it('moves to the sunrise state after dark, with "dark for" measured from the last sunset', () => {
    const afterSunset = Date.parse('2025-03-21T00:00:00Z'); // between the 19 Mar sunset and the 3 Apr shadow exit
    const r = buildScenarioResult(eph, { ...base, tScrubMs: afterSunset });
    expect(r.answer!.sun.up).toBe(false);
    expect(r.answer!.sun.state).toBe('sunriseIn');
    expect(r.answer!.sun.darkForMs).toBeGreaterThan(30 * 3_600_000);
    expect(r.answer!.sun.nextEventT).toBeGreaterThan(afterSunset);
  });

  it('the ISRO ops-elevation definition produces the below-ops state (D-10 / D-14)', () => {
    const r = buildScenarioResult(eph, { ...base, definitions: { ...DEFAULT_DEFINITIONS, minSunElevationOpsDeg: 6 } });
    expect(r.answer!.sun.state).toBe('belowOpsElevation'); // Sun is up at 2.5 deg but below the 6 deg minimum
    expect(r.answer!.sun.opsMinElevDeg).toBe(6);
    expect(r.metrics!.sunlitPct.value).toBe(0); // never above 6 deg at 85S, so no ops-available time
  });

  it('reports a clear error when the window is outside the ephemeris', () => {
    const r = buildScenarioResult(eph, { ...base, startMs: Date.UTC(2035, 0, 1), tScrubMs: Date.UTC(2035, 0, 1) });
    expect(r.status).toBe('error');
    expect(r.error).toMatch(/outside it/);
  });

  it('series, events and windows are consistent with each other', () => {
    const r = buildScenarioResult(eph, base);
    const s = r.series!;
    expect(s.sunElevDeg.length).toBe(s.sunUp.length);
    expect(s.t0).toBe(TOUCHDOWN);
    expect(s.stepMs).toBe(120_000);
    expect(r.events.map((e) => e.t)).toEqual([...r.events.map((e) => e.t)].sort((a, b) => a - b));
    expect(r.windows.filter((w) => w.type === 'sun').length).toBeGreaterThan(0);
  });

  it('the client runs the same evaluation in-thread when there is no Worker (tests/SSR)', async () => {
    const r = await evaluateScenario(base);
    expect(r.status).toBe('ready');
    expect(r.meta!.dataVersions.ephem).toBe('real');
  });
});

describe('latestWins', () => {
  it('discards results of superseded calls', async () => {
    const slow = latestWins(async (ms: number, v: string) => (await new Promise((r) => setTimeout(r, ms)), v));
    const a = slow(30, 'old');
    const b = slow(5, 'new');
    expect(await b).toBe('new');
    expect(await a).toBeNull();
  });
});
