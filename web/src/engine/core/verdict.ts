// Owner: Nived
// Go / no-go verdict against the Mission Profile (PLAN_FINAL 5.7). Pure function.
//   GO       every hard requirement passes at the CONSERVATIVE bound (lo for a minimum, hi for a maximum)
//   MARGINAL some requirement passes only at the nominal value, or is within 10% of its limit
//   NO-GO    some requirement fails even at the nominal value
//   PENDING  nothing fails, nothing is marginal, but something cannot be judged (missing data, or bounds that are only
//            optimistic because there is no terrain). A failure is still reported even then: if the best case fails, it fails.
import type { Bounded, MetricSet, Verdict } from '../types';

export interface VerdictProfile {
  minSunlitPct: number;
  minLinkHours: number;
  maxLongestNightH: number;
  maxPadSlopeDeg: number;
}

export interface VerdictWeights {
  sunlit: number;
  link: number;
  night: number;
  slope: number;
}

export interface VerdictInput {
  metrics: MetricSet;
  /** Length of the evaluated window in hours (link hours = link % of this). */
  windowHours: number;
  profile: VerdictProfile;
  weights: VerdictWeights;
  /** 'bounded': lo/hi are real uncertainty bounds. 'optimistic': smooth-Moon horizon, so values are best cases (never GO). */
  boundsKind: 'bounded' | 'optimistic';
}

export type RequirementId = 'sunlit' | 'link' | 'night' | 'slope';
export type RequirementStatus = 'pass' | 'marginal' | 'fail' | 'unknown';

export interface RequirementResult {
  id: RequirementId;
  status: RequirementStatus;
}

export interface VerdictComponent {
  id: RequirementId;
  /** 0..1, or null when there is no data for it. */
  score: number | null;
  weight: number;
}

export interface VerdictResult {
  verdict: Verdict;
  requirements: RequirementResult[];
  reasons: string[];
  /** 0..100 weighted average of the component scores that have data; null if none do. */
  viabilityIndex: number | null;
  components: VerdictComponent[];
}

interface Spec {
  id: RequirementId;
  label: string;
  unit: string;
  kind: 'min' | 'max';
  limit: number;
  value: Bounded | null;
}

const scale = (b: Bounded | null, k: number): Bounded | null =>
  b == null ? null : { value: b.value == null ? null : b.value * k, lo: b.lo == null ? null : b.lo * k, hi: b.hi == null ? null : b.hi * k };

const WEIGHT_KEY: Record<RequirementId, keyof VerdictWeights> = { sunlit: 'sunlit', link: 'link', night: 'night', slope: 'slope' };

/** Minimum-type: value / limit capped at 1. Maximum-type: limit / value capped at 1 (a value of 0 scores 1). */
function componentScore(s: Spec): number | null {
  const v = s.value?.value ?? null;
  if (v == null) return null;
  if (s.kind === 'min') return s.limit <= 0 ? 1 : Math.min(1, Math.max(0, v / s.limit));
  return v <= 0 ? 1 : Math.min(1, s.limit / v);
}

export function evaluateVerdict(input: VerdictInput): VerdictResult {
  const { metrics: m, profile: p } = input;
  const specs: Spec[] = [
    { id: 'sunlit', label: 'Sunlit time', unit: '%', kind: 'min', limit: p.minSunlitPct, value: m.sunlitPct },
    { id: 'link', label: 'Link time', unit: ' h', kind: 'min', limit: p.minLinkHours, value: scale(m.linkPct, input.windowHours / 100) },
    { id: 'night', label: 'Longest night', unit: ' h', kind: 'max', limit: p.maxLongestNightH, value: m.longestNightH },
    { id: 'slope', label: 'Pad slope', unit: '°', kind: 'max', limit: p.maxPadSlopeDeg, value: m.padSlopeDeg },
  ];
  const reasons: string[] = [];
  const requirements: RequirementResult[] = specs.map((s) => {
    const v = s.value?.value ?? null;
    const word = s.kind === 'min' ? 'below the minimum' : 'above the maximum';
    if (v == null) {
      reasons.push(`${s.label}: no data yet.`);
      return { id: s.id, status: 'unknown' };
    }
    const meets = (x: number) => (s.kind === 'min' ? x >= s.limit : x <= s.limit);
    if (!meets(v)) {
      reasons.push(`${s.label} ${v.toFixed(1)}${s.unit} is ${word} (${s.limit}${s.unit}).`);
      return { id: s.id, status: 'fail' }; // fails even at the nominal value (certain, even on an optimistic bound)
    }
    if (input.boundsKind === 'optimistic') {
      reasons.push(`${s.label} passes only on the smooth-Moon bound; terrain data is needed to confirm.`);
      return { id: s.id, status: 'unknown' };
    }
    // Conservative bound: the worse end of the range (lo for a minimum, hi for a maximum). No bound => the nominal value.
    const conservative = (s.kind === 'min' ? s.value?.lo : s.value?.hi) ?? v;
    const nearLimit = Math.abs(v - s.limit) <= 0.1 * Math.abs(s.limit) + 1e-9; // within 10% of the limit (inclusive)
    if (!meets(conservative)) {
      reasons.push(`${s.label} passes only at the nominal value (conservative bound ${conservative.toFixed(1)}${s.unit}).`);
      return { id: s.id, status: 'marginal' };
    }
    if (nearLimit) {
      reasons.push(`${s.label} ${v.toFixed(1)}${s.unit} is within 10% of its limit (${s.limit}${s.unit}).`);
      return { id: s.id, status: 'marginal' };
    }
    return { id: s.id, status: 'pass' };
  });
  const has = (st: RequirementStatus) => requirements.some((r) => r.status === st);
  const components: VerdictComponent[] = specs.map((s) => ({ id: s.id, score: componentScore(s), weight: input.weights[WEIGHT_KEY[s.id]] }));
  const scored = components.filter((c) => c.score != null);
  const wSum = scored.reduce((a, c) => a + c.weight, 0);
  const viabilityIndex = scored.length === 0 || wSum <= 0 ? null : (100 * scored.reduce((a, c) => a + c.weight * (c.score as number), 0)) / wSum;
  const verdict: Verdict = has('fail') ? 'NO-GO' : has('marginal') ? 'MARGINAL' : has('unknown') ? 'PENDING' : 'GO';
  return { verdict, requirements, reasons, viabilityIndex, components };
}
