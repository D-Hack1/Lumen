// Owner: Nived
// Two-stage scan (R3 delta D-15). MOCK (N-3): the numbers come from mocks/mockResult and the timing from
// mocks/scanSim; the call shape is the real one. Cancel a stale scan with the returned handle.
import { loadCatalog } from '../data/catalog';
import { mockScan } from '../../mocks/mockResult';
import { simulateScan, type ScanSimHandle } from '../../mocks/scanSim';
import type { ScanParams, ScanResult } from '../types';

export interface ScanHandle {
  cancel(): void;
  done: Promise<ScanResult>;
}

/** Calls onUpdate with stage 1 (provisional, nominal) then stage 2 (bounded). Latest-wins: cancel() drops later updates. */
export function startScan(params: ScanParams, onUpdate: (r: ScanResult) => void): ScanHandle {
  let inner: ScanSimHandle | null = null;
  let cancelled = false;
  const done = loadCatalog().then(({ sites }) => {
    if (cancelled) return { stage: 1 as const, done: false, candidates: [], latencyMs: 0 };
    inner = simulateScan(mockScan(params, sites), onUpdate);
    return inner.done;
  });
  return { cancel: () => ((cancelled = true), inner?.cancel()), done };
}

/** Convenience wrapper that resolves with the final (stage 2) result. */
export function runScan(params: ScanParams, onUpdate?: (r: ScanResult) => void): Promise<ScanResult> {
  return startScan(params, onUpdate ?? (() => undefined)).done;
}
