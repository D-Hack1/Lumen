// Owner: Nived
// The ONE place scenario results are computed. Every `useResult()` consumer (Answer Strip, Metric Deck, Ribbon, charts...)
// reads the same snapshot, so a scenario change triggers a single evaluation (not one per component) and latest-wins
// applies to the scenario, not to individual callers.
//   scenario store change --(30 ms debounce)--> worker evaluate --(latest wins)--> snapshot --> subscribers
// While a new evaluation is running the previous ready result stays visible (no flash of empty panels).
import { evaluateScenario, latestWins } from './client';
import type { ScenarioRequest } from './core/buildResult';
import { loadCatalog } from './data/catalog';
import { dataMode } from './data/source';
import { mockScenarioResult } from '../mocks/mockResult';
import { getScenario, useScenario, type Definitions as StoreDefinitions } from '../state/scenarioStore';
import type { EventType, ScenarioResult } from './types';

const DAY_MS = 86_400_000;
const DEBOUNCE_MS = 30;

export const LOADING: ScenarioResult = { status: 'loading', error: null, meta: null, verdict: 'PENDING', verdictReasons: [], answer: null, events: [], windows: [], series: null, metrics: null };

/** Store definitions (percent, UI units) -> engine definitions (fractions). */
export function engineDefinitions(d: StoreDefinitions) {
  return { sunDiskThreshold: d.sunDiskThresholdPct / 100, earthDiskThreshold: d.dteDiskThresholdPct / 100, earthMarginDeg: d.earthMarginDeg, minSunElevationOpsDeg: d.minSunElevationOps };
}

let snapshot: ScenarioResult = LOADING;
const listeners = new Set<() => void>();
let started = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let lastKey = '';
const evaluateLatest = latestWins(evaluateScenario);

function publish(r: ScenarioResult): void {
  snapshot = r;
  listeners.forEach((fn) => fn());
}

/** The request depends only on these scenario fields; anything else changing (view, persona, layers...) must not re-run the engine. */
function relevantKey(): string {
  const s = getScenario();
  return JSON.stringify([s.site, s.landingUtc, s.slipDays, s.durationDays, s.scrubUtc, s.heightM, s.definitions, dataMode()]);
}

async function run(): Promise<void> {
  const s = getScenario();
  try {
    const { sites } = await loadCatalog();
    if (dataMode() === 'mock') return publish(mockScenarioResult(sites[0] ?? null));
    const site = s.site.kind === 'site' ? sites.find((x) => x.id === (s.site as { id: string }).id) : undefined;
    const point = s.site.kind === 'point' ? s.site : null;
    if (!site && !point) throw new Error('The selected site is not in the catalog.');
    const req: ScenarioRequest = {
      siteId: site?.id ?? null, tier: site?.tier ?? 'C', nearFieldResM: site?.nearFieldResM ?? null,
      latDeg: site?.lat ?? point!.lat, lonDegEast: site?.lon ?? point!.lon, heightM: s.heightM, rotation: site?.rotationMatrix ?? null,
      touchdownMs: site?.touchdownUtc ?? null, padSlopeDeg: site?.padSlopeDeg ?? null, psr: site?.psr ?? null,
      startMs: s.landingUtc + s.slipDays * DAY_MS, durationDays: s.durationDays, tScrubMs: s.scrubUtc,
      definitions: engineDefinitions(s.definitions), dataVersions: { catalog: 1 },
    };
    const r = await evaluateLatest(req);
    if (r) publish(r); // null = superseded by a newer scenario: drop it
  } catch (e) {
    publish({ ...LOADING, status: 'error', error: e instanceof Error ? e.message : String(e) });
  }
}

function schedule(): void {
  clearTimeout(timer);
  timer = setTimeout(() => void run(), dataMode() === 'real' ? DEBOUNCE_MS : 0);
}

function start(): void {
  if (started) return;
  started = true;
  lastKey = relevantKey();
  useScenario.subscribe(() => {
    const k = relevantKey();
    if (k !== lastKey) {
      lastKey = k;
      schedule();
    }
  });
  schedule();
}

export function getResult(): ScenarioResult {
  return snapshot;
}

export function subscribeResult(fn: () => void): () => void {
  start();
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Time (epoch ms UTC) of the next event of this type after the current scrub time, or null. Abhinav sets t_scrub from it. */
export function jumpTo(eventType: EventType): number | null {
  const after = snapshot.answer?.tScrub ?? getScenario().scrubUtc;
  return snapshot.events.find((e) => e.type === eventType && e.t > after)?.t ?? null;
}
