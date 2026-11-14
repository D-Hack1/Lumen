// Owner: Nived
// The one place a scenario (store state + catalog) becomes an engine request. Used by the result store and the compare store.
import type { Definitions as StoreDefinitions, Scenario, SiteRef } from '../state/scenarioStore';
import type { ScenarioRequest } from './core/buildResult';
import type { SiteRecord } from './types';

const DAY_MS = 86_400_000;

/** Store definitions (percent, UI units) -> engine definitions (fractions). */
export function engineDefinitions(d: StoreDefinitions) {
  return { sunDiskThreshold: d.sunDiskThresholdPct / 100, earthDiskThreshold: d.dteDiskThresholdPct / 100, earthMarginDeg: d.earthMarginDeg, minSunElevationOpsDeg: d.minSunElevationOps };
}

export interface RequestParts {
  siteRef: SiteRef;
  landingUtc: number;
  heightM: number;
  /** Where the Answer Strip is evaluated (t_scrub). */
  scrubUtc: number;
}

export function makeRequest(s: Scenario, sites: SiteRecord[], p: RequestParts): ScenarioRequest {
  const site = p.siteRef.kind === 'site' ? sites.find((x) => x.id === (p.siteRef as { id: string }).id) : undefined;
  const point = p.siteRef.kind === 'point' ? p.siteRef : null;
  if (!site && !point) throw new Error('The selected site is not in the catalog.');
  return {
    siteId: site?.id ?? null, tier: site?.tier ?? 'C', nearFieldResM: site?.nearFieldResM ?? null,
    latDeg: site?.lat ?? point!.lat, lonDegEast: site?.lon ?? point!.lon, heightM: p.heightM, rotation: site?.rotationMatrix ?? null,
    touchdownMs: site?.touchdownUtc ?? null, padSlopeDeg: site?.padSlopeDeg ?? null, psr: site?.psr ?? null,
    startMs: p.landingUtc + s.slipDays * DAY_MS, durationDays: s.durationDays, tScrubMs: p.scrubUtc,
    definitions: engineDefinitions(s.definitions), profile: s.profile, weights: s.weights, dataVersions: { catalog: 1 },
  };
}
