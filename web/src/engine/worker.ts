// Owner: Nived
// Web Worker entry: runs scenario evaluations off the main thread (guide §2, "worker latest-wins").
// The main thread tags each request; stale results are dropped there (see client.ts). Evaluation itself is ~70 ms for a
// 30-day window, but it must never block scrubbing or typing.
import * as Comlink from 'comlink';
import { buildScenarioResult, type ScenarioRequest } from './core/buildResult';
import { loadEphem } from './data/ephem';
import { setDataMode, type DataMode } from './data/source';
import { refineCandidate, scanStage1, stage1ForOffsets, type ScanInput } from './compare/scanEngine';
import type { ScanCandidate, ScenarioResult } from './types';

export interface EngineApi {
  evaluateScenario(mode: DataMode, req: ScenarioRequest): Promise<ScenarioResult>;
  scanStage1(mode: DataMode, input: ScanInput): Promise<ScanCandidate[]>;
  refineCandidate(mode: DataMode, req: ScenarioRequest, candidate: ScanCandidate): Promise<ScanCandidate>;
  stage1Offsets(mode: DataMode, req: ScenarioRequest, offsets: number[]): Promise<ScanCandidate[]>;
}

const api: EngineApi = {
  async evaluateScenario(mode, req) {
    setDataMode(mode); // the worker has its own module state; mirror the main thread's mock/real choice
    const eph = await loadEphem();
    return buildScenarioResult(eph, { ...req, dataVersions: { ...req.dataVersions, ephem: eph.mock ? 'mock' : 'real' } });
  },
  async scanStage1(mode, input) {
    setDataMode(mode);
    return scanStage1(await loadEphem(), input);
  },
  async stage1Offsets(mode, req, offsets) {
    setDataMode(mode);
    return stage1ForOffsets(await loadEphem(), req, offsets);
  },
  async refineCandidate(mode, req, candidate) {
    setDataMode(mode);
    return refineCandidate(await loadEphem(), req, candidate);
  },
};

Comlink.expose(api);
