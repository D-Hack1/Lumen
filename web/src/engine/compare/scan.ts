// Owner: Nived
// Two-stage scan (R3 delta D-15). MOCK (N-3): stage 1 then stage 2 with fake numbers, same call shape as the real one.
import { loadCatalog } from '../data/catalog';
import { mockScan } from '../mock/mockResult';
import type { ScanParams, ScanResult } from '../types';

/** Calls onUpdate with stage 1 (provisional, nominal) then stage 2 (bounded). Resolves with the final result. */
export async function runScan(params: ScanParams, onUpdate?: (r: ScanResult) => void): Promise<ScanResult> {
  const t0 = performance.now();
  const { sites } = await loadCatalog();
  const nominal = mockScan(params, sites);
  const s1: ScanResult = { stage: 1, done: false, candidates: nominal, latencyMs: performance.now() - t0 };
  onUpdate?.(s1);
  const bounded = nominal.map((c, i) => (i < 10 ? { ...c, provisional: false, boundsStatus: 'bounded' as const } : c));
  const s2: ScanResult = { stage: 2, done: true, candidates: bounded, latencyMs: performance.now() - t0 };
  onUpdate?.(s2);
  return s2;
}
