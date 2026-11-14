// Owner: Nived
// useCatalog, useResult, useCompareResults, useQuickAnswer, useLayers, jumpTo.
// N-3: mock-backed. Catalog and layers load the (mock or real) files through the loaders; results are fake
// but fully shaped. useResult will read the scenario from Abhinav's store once it exists (N-5+).
import { useEffect, useState } from 'react';
import { loadCatalog } from './data/catalog';
import { loadLayers } from './data/layers';
import { mockCompare, mockScenarioResult } from './mock/mockResult';
import { quickAnswer } from './quickAnswer';
import type {
  CatalogResult,
  CompareResults,
  EventType,
  LayersResult,
  QuickAnswerInput,
  QuickAnswerResult,
  ScenarioResult,
} from './types';

const EMPTY_CATALOG: CatalogResult = { sites: [], sparklines: {}, loading: true, error: null };
const EMPTY_RESULT: ScenarioResult = {
  status: 'idle', error: null, meta: null, verdict: 'PENDING', verdictReasons: [], answer: null, events: [], windows: [], series: null, metrics: null,
};
const EMPTY_COMPARE: CompareResults = { status: 'idle', rows: [], baselineId: null };
const EMPTY_QUICK: QuickAnswerResult = {
  status: 'idle', error: null, tier: 'pending', tierBadge: '', matchedSiteId: null, snapDistanceKm: null, sunElevDeg: 0, sunAzDeg: 0, sunDiskPct: 0,
  sunUp: false, earthElevDeg: 0, earthAzDeg: 0, earthRangeKm: 0, linkUp: false, nextSunset: null, nextEarthset: null, nextShadowExit: null,
  sunlitPct: { value: null, lo: null, hi: null }, linkPct: { value: null, lo: null, hi: null }, psrDistanceKm: null, text: '',
};
const EMPTY_LAYERS: LayersResult = {
  layers: [], extents: null, sizePx: null, regions: [], loading: true, error: null,
};

/** Run an async loader once on mount; `fallback` is returned until it resolves. */
function useLoaded<T>(load: () => Promise<T>, fallback: T, onError: (e: string) => T): T {
  const [v, setV] = useState<T>(fallback);
  useEffect(() => {
    let live = true;
    load().then(
      (x) => live && setV(x),
      (e: unknown) => live && setV(onError(e instanceof Error ? e.message : String(e))),
    );
    return () => {
      live = false;
    };
    // loaders are module-level and cached; run once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return v;
}

export function useCatalog(): CatalogResult {
  return useLoaded<CatalogResult>(
    () => loadCatalog().then((c) => ({ ...c, loading: false, error: null })),
    EMPTY_CATALOG,
    (error) => ({ ...EMPTY_CATALOG, loading: false, error }),
  );
}

// Latest result, so jumpTo() can answer without arguments (per contract).
let lastResult: ScenarioResult = EMPTY_RESULT;

export function useResult(): ScenarioResult {
  return useLoaded<ScenarioResult>(
    () =>
      loadCatalog().then(({ sites }) => {
        lastResult = mockScenarioResult(sites[0] ?? null);
        return lastResult;
      }),
    { ...EMPTY_RESULT, status: 'loading' },
    (error) => ({ ...EMPTY_RESULT, status: 'error', error }),
  );
}

export function useCompareResults(): CompareResults {
  return useLoaded<CompareResults>(
    () => loadCatalog().then(({ sites }) => mockCompare(sites)),
    { ...EMPTY_COMPARE, status: 'loading' },
    () => ({ ...EMPTY_COMPARE, status: 'error' }),
  );
}

export function useQuickAnswer(input: QuickAnswerInput | null): QuickAnswerResult {
  const [res, setRes] = useState<QuickAnswerResult>(EMPTY_QUICK);
  const key = input ? `${input.lat}|${input.lon}|${input.utc}|${input.durationDays}|${input.heightM}` : '';
  useEffect(() => {
    if (!input) {
      setRes(EMPTY_QUICK);
      return;
    }
    let live = true;
    setRes((r) => ({ ...r, status: 'loading' }));
    quickAnswer(input).then(
      (x) => live && setRes(x),
      (e: unknown) => live && setRes({ ...EMPTY_QUICK, status: 'error', error: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return res;
}

export function useLayers(): LayersResult {
  return useLoaded<LayersResult>(
    () => loadLayers().then((l) => ({ ...l, loading: false, error: null })),
    EMPTY_LAYERS,
    (error) => ({ ...EMPTY_LAYERS, loading: false, error }),
  );
}

/** Time (epoch ms UTC) of the next event of this type after the current scrub time, or null. Abhinav sets t_scrub from it. */
export function jumpTo(eventType: EventType): number | null {
  const after = lastResult.answer?.tScrub ?? 0;
  return lastResult.events.find((e) => e.type === eventType && e.t > after)?.t ?? null;
}
