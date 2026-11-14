// Owner: Nived
// Shared types for the engine API. Authoritative description: contracts/frontend_engine_api.md.
// Conventions: all times are epoch milliseconds (UTC); angles in degrees; distances in km unless suffixed.

export type Tier = 'A' | 'B' | 'C' | 'pending';
export type Verdict = 'GO' | 'MARGINAL' | 'NO-GO' | 'PENDING';
export type EventType = 'sunset' | 'shadowExit' | 'earthset' | 'earthrise';
export type SiteCategory =
  | 'historical_landing'
  | 'published_target'
  | 'artemis_candidate_region'
  | 'contrast_site'
  | 'custom';

/** A value with its uncertainty range (three-pass method, PLAN §5.8). lo/hi are null when not applicable (e.g. Tier C). */
export interface Bounded {
  value: number | null;
  lo: number | null;
  hi: number | null;
}

// ---------- catalog ----------

export interface SiteRecord {
  id: string;
  name: string;
  category: SiteCategory;
  agency: string | null;
  date: string | null; // landing date (historical) YYYY-MM-DD
  asPublishedDate: string | null; // targets only
  lat: number;
  lon: number;
  landingCoords: { lat: number; lon: number; source: string };
  targetCoords: { lat: number; lon: number; source: string } | null;
  coordNote: string | null;
  touchdownUtc: number | null;
  touchdownPrecision: 'minute' | 'second' | null;
  lastContactUtc: number | null;
  tier: Tier;
  nearFieldResM: number | null;
  sigmaSource: string;
  sigmaDefaultDeg: number | null;
  padSlopeDeg: number | null;
  psr: { distanceKm: number; bearingDeg: number; areaKm2: number; source: 'published' | 'derived' } | null;
  sparklineIndex: number;
  sourceUrl: string | null;
  verificationStatus: string;
  provenanceNotes: string | null;
  mock: boolean;
}

export interface Sparkline {
  startUtc: number;
  sunlitPct: Uint8Array; // one value per day
  linkPct: Uint8Array;
}

export interface CatalogResult {
  sites: SiteRecord[];
  sparklines: Record<string, Sparkline>;
  loading: boolean;
  error: string | null;
}

// ---------- scenario result ----------

export type WindowType = 'sun' | 'earth' | 'link' | 'ops';
export type GrazingReason = 'rate' | 'dt_limit' | 'vanishes' | null;

export interface EventRecord {
  type: EventType;
  t: number;
  dtMs: number | null; // ± half-width; null for Tier C
  grazing: boolean;
  grazingReason: GrazingReason;
  dtMethod: 'fast' | 'exact';
}

export interface WindowRecord {
  type: WindowType;
  start: number;
  end: number;
  startPmMs: number | null;
  endPmMs: number | null;
  durationH: Bounded;
  peakElevDeg: number;
  flags: { grazing: boolean; partialStart: boolean; partialEnd: boolean };
}

/** Render-window series on a uniform grid: sample i is at t0 + i * stepMs. */
export interface Series {
  t0: number;
  stepMs: number;
  sunElevDeg: Float32Array;
  sunAzDeg: Float32Array;
  sunClearanceDeg: Float32Array;
  sunDiskPct: Float32Array;
  earthElevDeg: Float32Array;
  earthAzDeg: Float32Array;
  earthClearanceDeg: Float32Array;
  earthDiskPct: Float32Array;
  powerW: Float32Array;
  sunUp: Uint8Array;
  earthUp: Uint8Array;
  linkUp: Uint8Array;
  sigmaBandDeg: Float32Array; // ±σ of the effective mask at the Sun azimuth
}

export type SunCellState =
  | 'sunsetIn'
  | 'sunriseIn'
  | 'noSunriseBeforeEnd'
  | 'staysUpPastEnd'
  | 'belowOpsElevation';
export type EarthCellState = 'earthsetIn' | 'earthriseIn' | 'linkResumesDsn';

/** What the Answer Strip needs at scrub time (state table: R3 delta D-14). */
export interface AnswerState {
  tScrub: number;
  sun: {
    elevDeg: number;
    diskPct: number;
    up: boolean;
    state: SunCellState;
    nextEventT: number | null;
    nextEventPmMs: number | null;
    grazing: boolean;
    darkForMs: number | null;
    opsMinElevDeg: number | null;
  };
  earth: {
    elevDeg: number;
    visible: boolean;
    linkUp: boolean;
    state: EarthCellState;
    nextEventT: number | null;
    nextEventPmMs: number | null;
    grazing: boolean;
  };
  windowSunlitPct: Bounded;
  windowLinkPct: Bounded;
}

export interface MetricSet {
  sunElevationDeg: Bounded; // hero
  sunClearanceDeg: Bounded;
  sunDiskPct: Bounded;
  earthElevationDeg: Bounded;
  dteMarginDeg: Bounded;
  sunlitPct: Bounded;
  linkPct: Bounded;
  longestNightH: Bounded;
  longestCommGapH: Bounded;
  opsHours: Bounded;
  energyPerDayWh: Bounded;
  sunElevationAtTouchdownDeg: Bounded | null;
  padSlopeDeg: Bounded | null;
  psrDistanceKm: { km: number; bearingDeg: number; areaKm2: number; source: 'published' | 'derived' } | null;
}

export interface ResultMeta {
  siteId: string;
  tier: Tier;
  tierBadge: string; // e.g. "Tier A · near-field 5 m"
  sigmaSource: string; // "default" | "Monte-Carlo, 30 clones" | "calibrated vs Tier A" | "smooth-Moon bound"
  snapDistanceKm: number | null; // Tier B only
  definitionsSummary: string;
  dataVersions: Record<string, number | string>;
  mock: boolean;
}

export interface ScenarioResult {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  meta: ResultMeta | null;
  verdict: Verdict;
  verdictReasons: string[];
  answer: AnswerState | null;
  events: EventRecord[];
  windows: WindowRecord[];
  series: Series | null;
  metrics: MetricSet | null;
}

// ---------- compare / scan ----------

export interface CompareRow {
  scenarioId: string; // A..D
  result: ScenarioResult;
  deltaVsBaseline: Partial<Record<keyof MetricSet, number | null>>;
}

export interface CompareResults {
  status: 'idle' | 'loading' | 'ready' | 'error';
  rows: CompareRow[];
  baselineId: string | null;
}

export interface ScanParams {
  mode: 'dates' | 'sites';
  baseLandingUtc: number;
  plusMinusDays: number;
  siteIds: string[] | null; // null = current site only (mode 'dates')
  durationDays: number;
}

export interface ScanCandidate {
  siteId: string;
  landingUtc: number;
  viabilityIndex: number;
  verdict: Verdict;
  provisional: boolean;
  boundsStatus: 'nominal' | 'bounded';
  sunlitPct: Bounded;
  linkPct: Bounded;
  longestNightH: Bounded;
}

export interface ScanResult {
  stage: 1 | 2;
  done: boolean;
  candidates: ScanCandidate[]; // ranked best-first
  latencyMs: number;
}

// ---------- quick answer ----------

export interface QuickAnswerInput {
  lat: number;
  lon: number;
  utc: number;
  durationDays: number;
  heightM: number;
}

export interface QuickAnswerResult {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  tier: Tier;
  tierBadge: string;
  matchedSiteId: string | null;
  snapDistanceKm: number | null;
  sunElevDeg: number;
  sunAzDeg: number;
  sunDiskPct: number;
  sunUp: boolean;
  earthElevDeg: number;
  earthAzDeg: number;
  earthRangeKm: number;
  linkUp: boolean;
  nextSunset: EventRecord | null;
  nextEarthset: EventRecord | null;
  nextShadowExit: EventRecord | null;
  sunlitPct: Bounded;
  linkPct: Bounded;
  psrDistanceKm: number | null;
  text: string; // pre-formatted for "Copy as text"
}

// ---------- layers ----------

export interface LayerEntry {
  id: string;
  label: string;
  extent: '80_90S' | '85_90S';
  url: string; // resolved, ready for <img>
  legendStops: Array<{ value: number; label: string; color: string }>;
  source: string;
  derived: boolean;
}

export interface LayerExtent {
  latLimitDeg: number;
  halfExtentKm: number;
  centrePx: [number, number];
  metresPerPx: number;
}

export interface RegionOutline {
  id: string;
  name: string;
  centroid: { lat: number; lon: number };
  /** SVG path in km, y flipped (svg_y = -y), same frame as the layers (half_extent_km of the 80_90S extent). */
  svgPath: string;
}

export interface LayersResult {
  layers: LayerEntry[];
  extents: Record<'80_90S' | '85_90S', LayerExtent> | null;
  sizePx: [number, number] | null;
  regions: RegionOutline[];
  loading: boolean;
  error: string | null;
}
