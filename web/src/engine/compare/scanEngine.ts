// Owner: Nived
// Two-stage Scan (R3 delta D-15, gate G13). Pure and synchronous (runs in the worker or in tests).
//   Stage 1: ONE nominal visibility series per site (10-minute samples over the whole scan span), then every candidate
//            landing date is scored with prefix sums (O(1) each). Verdicts are provisional. Target <= 100 ms.
//   Stage 2: full evaluation (2-minute grid, events refined) of a chosen candidate: exact values, no longer provisional.
// Without a terrain mask every value is a smooth-Moon best case, so a stage-1/2 pass is PENDING at best (see verdict.ts).
import { buildScenarioResult, type ScenarioRequest } from '../core/buildResult';
import { stateAt, type Definitions } from '../core/evaluate';
import { makeSite } from '../core/geometry';
import { inEphemerisRange } from '../core/interp';
import { evaluateVerdict } from '../core/verdict';
import { Horizon } from '../core/visibility';
import type { Ephemeris } from '../data/ephem';
import type { Bounded, MetricSet, ScanCandidate } from '../types';

export const STAGE1_STEP_MS = 600_000;
const DAY = 86_400_000;
const nulls: Bounded = { value: null, lo: null, hi: null };
const val = (v: number | null): Bounded => ({ value: v, lo: null, hi: null });

export interface ScanInput {
  /** One request per site to scan; `startMs` is the nominal landing date, `durationDays` the surface window. */
  requests: ScenarioRequest[];
  plusMinusDays: number;
}

/** A metric set where only what the verdict judges is filled in. */
function judged(sunlit: number, link: number, nightH: number, padSlopeDeg: number | null): MetricSet {
  return {
    sunElevationDeg: nulls, sunClearanceDeg: nulls, sunDiskPct: nulls, earthElevationDeg: nulls, dteMarginDeg: nulls, sunlitPct: val(sunlit), linkPct: val(link),
    longestNightH: val(nightH), longestCommGapH: nulls, opsHours: nulls, energyPerDayWh: nulls, sunElevationAtTouchdownDeg: null,
    padSlopeDeg: padSlopeDeg == null ? null : val(padSlopeDeg), psrDistanceKm: null,
  };
}

function longestFalseRun(up: Uint8Array, from: number, to: number): number {
  let best = 0;
  let run = 0;
  for (let i = from; i < to; i++) {
    if (up[i]) run = 0;
    else best = Math.max(best, ++run);
  }
  return best;
}

export function scanStage1(eph: Ephemeris, input: ScanInput): ScanCandidate[] {
  const out: ScanCandidate[] = [];
  for (const r of input.requests) {
    const windowMs = r.durationDays * DAY;
    const offsets: number[] = [];
    for (let d = -input.plusMinusDays; d <= input.plusMinusDays; d++) {
      const s = r.startMs + d * DAY;
      if (inEphemerisRange(eph, s) && inEphemerisRange(eph, s + windowMs)) offsets.push(d);
    }
    if (offsets.length === 0) continue;

    // One series per site, covering every candidate window.
    const tFirst = r.startMs + offsets[0] * DAY;
    const tLast = r.startMs + offsets[offsets.length - 1] * DAY + windowMs;
    const n = Math.ceil((tLast - tFirst) / STAGE1_STEP_MS);
    const site = makeSite(r.latDeg, r.lonDegEast, r.heightM, r.rotation ?? undefined);
    const horizon = new Horizon({ observerHeightM: r.heightM });
    const d: Definitions = r.definitions;
    const sun = new Uint8Array(n);
    const earth = new Uint8Array(n);
    const sunCum = new Int32Array(n + 1); // prefix sums: count of "up" samples before index i
    const earthCum = new Int32Array(n + 1);
    for (let i = 0; i < n; i++) {
      const s = stateAt(eph, site, horizon, d, tFirst + i * STAGE1_STEP_MS);
      sun[i] = s.sun.up ? 1 : 0;
      earth[i] = s.earth.up ? 1 : 0;
      sunCum[i + 1] = sunCum[i] + sun[i];
      earthCum[i + 1] = earthCum[i] + earth[i];
    }

    const m = Math.round(windowMs / STAGE1_STEP_MS); // samples per candidate window
    for (const off of offsets) {
      const start = r.startMs + off * DAY;
      const i0 = Math.round((start - tFirst) / STAGE1_STEP_MS);
      const sunlit = (100 * (sunCum[i0 + m] - sunCum[i0])) / m;
      const link = (100 * (earthCum[i0 + m] - earthCum[i0])) / m;
      const nightH = (longestFalseRun(sun, i0, i0 + m) * STAGE1_STEP_MS) / 3_600_000;
      const v = evaluateVerdict({ metrics: judged(sunlit, link, nightH, r.padSlopeDeg), windowHours: r.durationDays * 24, profile: r.profile, weights: r.weights, boundsKind: 'optimistic' });
      out.push({
        siteId: r.siteId ?? 'custom', landingUtc: start, viabilityIndex: v.viabilityIndex ?? 0, verdict: v.verdict, provisional: true, boundsStatus: 'nominal',
        sunlitPct: val(sunlit), linkPct: val(link), longestNightH: val(nightH),
      });
    }
  }
  return out.sort((a, b) => b.viabilityIndex - a.viabilityIndex);
}

/** Stage 2: exact evaluation of one candidate (same engine as the Cockpit). */
export function refineCandidate(eph: Ephemeris, request: ScenarioRequest, candidate: ScanCandidate): ScanCandidate {
  const res = buildScenarioResult(eph, { ...request, startMs: candidate.landingUtc, tScrubMs: candidate.landingUtc });
  if (res.status !== 'ready' || !res.metrics) return candidate; // cannot refine: keep the provisional numbers
  const m = res.metrics;
  return {
    ...candidate,
    viabilityIndex: res.viability?.index ?? candidate.viabilityIndex, verdict: res.verdict, provisional: false,
    boundsStatus: m.sunlitPct.lo != null ? 'bounded' : 'nominal', sunlitPct: m.sunlitPct, linkPct: m.linkPct, longestNightH: m.longestNightH,
  };
}
