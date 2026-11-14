// Owner: Nived
// Web Worker entry: runs scenario evaluations off the main thread (guide §2, "worker latest-wins").
// The main thread tags each request; stale results are dropped there (see client.ts). Evaluation itself is ~70 ms for a
// 30-day window, but it must never block scrubbing or typing.
import * as Comlink from 'comlink';
import { buildScenarioResult, type ScenarioRequest } from './core/buildResult';
import { loadEphem } from './data/ephem';
import { setDataMode, type DataMode } from './data/source';
import type { ScenarioResult } from './types';

export interface EngineApi {
  evaluateScenario(mode: DataMode, req: ScenarioRequest): Promise<ScenarioResult>;
}

const api: EngineApi = {
  async evaluateScenario(mode, req) {
    setDataMode(mode); // the worker has its own module state; mirror the main thread's mock/real choice
    const eph = await loadEphem();
    return buildScenarioResult(eph, { ...req, dataVersions: { ...req.dataVersions, ephem: eph.mock ? 'mock' : 'real' } });
  },
};

Comlink.expose(api);
