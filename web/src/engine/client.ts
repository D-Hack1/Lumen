// Owner: Nived
// Main-thread side of the engine: owns the worker, and gives hooks a latest-wins `evaluateScenario`.
// Falls back to running in-thread when Workers are unavailable (tests, SSR), with identical results.
import * as Comlink from 'comlink';
import { buildScenarioResult, type ScenarioRequest } from './core/buildResult';
import { loadEphem } from './data/ephem';
import { dataMode } from './data/source';
import type { EngineApi } from './worker';
import type { ScenarioResult } from './types';

let remote: Comlink.Remote<EngineApi> | null | undefined;

function engine(): Comlink.Remote<EngineApi> | null {
  if (remote !== undefined) return remote;
  remote = null;
  if (typeof Worker !== 'undefined') {
    try {
      remote = Comlink.wrap<EngineApi>(new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }));
    } catch {
      remote = null; // e.g. worker construction blocked: run in-thread
    }
  }
  return remote;
}

export async function evaluateScenario(req: ScenarioRequest): Promise<ScenarioResult> {
  const mode = dataMode();
  const w = engine();
  if (w) return w.evaluateScenario(mode, req);
  const eph = await loadEphem();
  return buildScenarioResult(eph, { ...req, dataVersions: { ...req.dataVersions, ephem: eph.mock ? 'mock' : 'real' } });
}

/** Latest-wins wrapper: results of superseded calls are discarded (resolve to null), so a slow old job can never overwrite a newer one. */
export function latestWins<A extends unknown[], R>(fn: (...a: A) => Promise<R>): (...a: A) => Promise<R | null> {
  let latest = 0;
  return async (...a: A) => {
    const mine = ++latest;
    const r = await fn(...a);
    return mine === latest ? r : null;
  };
}
