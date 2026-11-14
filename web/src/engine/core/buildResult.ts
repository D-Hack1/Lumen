// Owner: Nived
// Turns one `evaluate()` run into the public `ScenarioResult` the UI hooks return. Pure and synchronous, so it runs
// identically in the Web Worker and in unit tests. Geometry-only for now: terrain mask, sigma bounds, DSN and power are
// not available yet, so their fields are null (never invented) and the verdict stays PENDING.
import type { Ephemeris } from '../data/ephem';
import { deriveAnswerState } from '../answerState';
import type { AnswerState, Bounded, EventRecord, MetricSet, ScenarioResult, Series, Tier } from '../types';
import { evaluate, stateAt, DEFAULT_DEFINITIONS, type Definitions, type Evaluation } from './evaluate';
import { makeSite, type Mat3 } from './geometry';
import { inEphemerisRange } from './interp';
import { evaluateVerdict, type VerdictProfile, type VerdictWeights } from './verdict';
import { longestFalseRunHours } from './metrics';
import { FINE_STEP_MS } from './events';
import { Horizon } from './visibility';

/** Everything the worker needs, as plain serialisable data (no store, no catalog objects). */
export interface ScenarioRequest {
  siteId: string | null;
  tier: Tier;
  nearFieldResM: number | null;
  latDeg: number;
  lonDegEast: number;
  heightM: number;
  rotation: Mat3 | null;
  touchdownMs: number | null;
  padSlopeDeg: number | null;
  psr: { distanceKm: number; bearingDeg: number; areaKm2: number; source: 'published' | 'derived' } | null;
  startMs: number;
  durationDays: number;
  tScrubMs: number;
  definitions: Definitions;
  /** Mission Profile thresholds and Viability Index weights (from the store). */
  profile: VerdictProfile;
  weights: VerdictWeights;
  dataVersions: Record<string, number | string>;
}

const nulls: Bounded = { value: null, lo: null, hi: null };
const val = (v: number | null): Bounded => ({ value: v, lo: null, hi: null });

const DAY = 86_400_000;

function emptyError(message: string): ScenarioResult {
  return { status: 'error', error: message, meta: null, verdict: 'PENDING', verdictReasons: [], viability: null, answer: null, events: [], windows: [], series: null, metrics: null };
}

function buildSeries(ev: Evaluation): Series {
  const n = ev.samples.length;
  const f = () => new Float32Array(n);
  const u = () => new Uint8Array(n);
  const s: Series = {
    t0: ev.times[0], stepMs: FINE_STEP_MS, sunElevDeg: f(), sunAzDeg: f(), sunClearanceDeg: f(), sunDiskPct: f(), earthElevDeg: f(), earthAzDeg: f(),
    earthClearanceDeg: f(), earthDiskPct: f(), earthRangeKm: f(), powerW: f(), sunUp: u(), earthUp: u(), linkUp: u(), sigmaBandDeg: f(),
  };
  ev.samples.forEach((p, i) => {
    s.sunElevDeg[i] = p.sun.elevationDeg; s.sunAzDeg[i] = p.sun.azimuthDeg; s.sunClearanceDeg[i] = p.sun.clearanceDeg; s.sunDiskPct[i] = 100 * p.sun.diskFraction;
    s.earthElevDeg[i] = p.earth.elevationDeg; s.earthAzDeg[i] = p.earth.azimuthDeg; s.earthClearanceDeg[i] = p.earth.clearanceDeg; s.earthDiskPct[i] = 100 * p.earth.diskFraction; s.earthRangeKm[i] = p.earth.distanceKm;
    s.sunUp[i] = p.sun.up ? 1 : 0; s.earthUp[i] = p.earth.up ? 1 : 0;
    s.linkUp[i] = p.earth.up ? 1 : 0; // no DSN data yet: link == Earth visible
    // powerW and sigmaBandDeg stay 0: no power model / sigma yet
  });
  return s;
}

export function buildScenarioResult(eph: Ephemeris, req: ScenarioRequest): ScenarioResult {
  const endMs = req.startMs + req.durationDays * DAY;
  if (!inEphemerisRange(eph, req.startMs) || !inEphemerisRange(eph, endMs)) {
    return emptyError(`The ephemeris covers ${new Date(eph.startMs).toISOString().slice(0, 10)} to ${new Date(eph.endMs).toISOString().slice(0, 10)}; this window is outside it.`);
  }
  // No terrain mask is available yet for any site: every site is evaluated on the smooth-Moon horizon (an optimistic
  // bound, labelled as such), including curated Tier-A sites whose masks are still pending.
  const site = makeSite(req.latDeg, req.lonDegEast, req.heightM, req.rotation ?? undefined);
  const horizon = new Horizon({ observerHeightM: req.heightM });
  const d = req.definitions;
  const ev = evaluate({ eph, site, horizon, startMs: req.startMs, durationDays: req.durationDays, definitions: d });
  const series = buildSeries(ev);

  const tScrub = Math.min(Math.max(req.tScrubMs, req.startMs), endMs);
  const cur = stateAt(eph, site, horizon, d, tScrub);
  const events: EventRecord[] = [...ev.sunEvents, ...ev.earthEvents].sort((a, b) => a.t - b.t);

  // Answer Strip facts (D-14). "Sun up" = geometrically visible; the ops-elevation requirement is handled by the state.
  const geomSunUp = cur.sun.diskFraction >= d.sunDiskThreshold && cur.sun.clearanceDeg >= 0;
  const sunAvailable = cur.sun.up;
  const sunNext = ev.sunEvents.find((e) => e.t > tScrub && e.type === (sunAvailable ? 'sunset' : 'shadowExit')) ?? null;
  const resume = ev.sunEvents.find((e) => e.t > tScrub && e.type === 'shadowExit') ?? null;
  const lastSunset = [...ev.sunEvents].reverse().find((e) => e.type === 'sunset' && e.t <= tScrub) ?? null;
  const earthNext = ev.earthEvents.find((e) => e.t > tScrub && e.type === (cur.earth.up ? 'earthset' : 'earthrise')) ?? null;
  const m = ev.metrics;
  const answer: AnswerState = deriveAnswerState({
    tScrub, sunElevDeg: cur.sun.elevationDeg, sunDiskPct: 100 * cur.sun.diskFraction, sunUp: geomSunUp,
    opsMinElevDeg: d.minSunElevationOpsDeg > 0 ? d.minSunElevationOpsDeg : null, sunNext,
    darkSinceMs: !geomSunUp ? (lastSunset?.t ?? null) : null, opsResumeT: resume?.t ?? null,
    earthElevDeg: cur.earth.elevationDeg, earthVisible: cur.earth.up, linkUp: cur.earth.up, dsnAware: false, earthNext, linkResumeT: null,
    windowSunlitPct: m.sunlitPct, windowLinkPct: m.earthVisiblePct,
  });

  let opsMs = 0;
  for (let i = 0; i < ev.samples.length - 1; i++) if (ev.samples[i].sun.up && ev.samples[i].earth.up) opsMs += ev.times[i + 1] - ev.times[i];
  const earthUp = ev.samples.map((s) => s.earth.up);
  const touch = req.touchdownMs != null && inEphemerisRange(eph, req.touchdownMs) ? stateAt(eph, site, horizon, d, req.touchdownMs) : null;

  const metrics: MetricSet = {
    sunElevationDeg: val(cur.sun.elevationDeg), sunClearanceDeg: val(cur.sun.clearanceDeg), sunDiskPct: val(100 * cur.sun.diskFraction),
    earthElevationDeg: val(cur.earth.elevationDeg), dteMarginDeg: val(cur.earth.clearanceDeg),
    sunlitPct: m.sunlitPct, linkPct: m.earthVisiblePct, // link = Earth visible until DSN data exists
    longestNightH: m.longestNightH, longestCommGapH: val(longestFalseRunHours(ev.times, earthUp)), opsHours: val(opsMs / 3_600_000),
    energyPerDayWh: nulls,
    sunElevationAtTouchdownDeg: touch ? val(touch.sun.elevationDeg) : null,
    padSlopeDeg: req.padSlopeDeg != null ? val(req.padSlopeDeg) : null,
    psrDistanceKm: req.psr ? { km: req.psr.distanceKm, bearingDeg: req.psr.bearingDeg, areaKm2: req.psr.areaKm2, source: req.psr.source } : null,
  };

  // No terrain yet => every value is a smooth-Moon best case: a failure is certain, a pass is only PENDING (see verdict.ts).
  const verdict = evaluateVerdict({ metrics, windowHours: req.durationDays * 24, profile: req.profile, weights: req.weights, boundsKind: 'optimistic' });

  return {
    status: 'ready', error: null,
    meta: {
      siteId: req.siteId ?? 'custom', tier: req.tier,
      tierBadge: 'Smooth-Moon horizon · terrain pending',
      sigmaSource: 'smooth-Moon bound', snapDistanceKm: null,
      definitionsSummary: `Sun available = ≥${Math.round(d.sunDiskThreshold * 100)}% disk above the horizon${d.minSunElevationOpsDeg > 0 ? ` and ≥${d.minSunElevationOpsDeg}° elevation` : ''} @${req.heightM} m · Link = Earth ≥${d.earthMarginDeg}° above the horizon (DSN not applied)`,
      dataVersions: req.dataVersions, mock: eph.mock,
    },
    verdict: verdict.verdict,
    verdictReasons: verdict.reasons,
    viability: { index: verdict.viabilityIndex, components: verdict.components },
    answer, events, windows: ev.windowRecords, series, metrics,
  };
}

export { DEFAULT_DEFINITIONS };
