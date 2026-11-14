// Owner: Abhinav
// Committed scenario store (Zustand). Human-speed state only — may re-render React.
// Fields: PLAN_FINAL §6 "Scenario (URL)" + R3 D-11 (minSunElevationOps, definitionsPreset) + slip (store action
// "set slip", WORK_DISTRIBUTION §5). Pointer-rate values (hover, live scrub, slip drag, pad drag) live on the
// transient buses in ./buses and are committed here on release.
import { create } from 'zustand';
import { crosshairBus, padDragBus, slipBus } from './buses';

// ---------- types ----------

export type ViewId = 'cockpit' | 'compare' | 'methodology';
export type Persona = 'planner' | 'educator';
export type DurationDays = 7 | 14 | 30 | 60;
export type MastHeightM = 1 | 2 | 5 | 10;
/** PLAN §5.6 generic presets: 4 vertical side panels · 1 vertical at heading · horizontal deck · sun-tracking mast. */
export type PanelPreset = 'fourSide' | 'singleHeading' | 'horizontalDeck' | 'trackingMast';
export type DsnMode = 'off' | 'dsnAware';
export type DefinitionsPresetId = 'default' | 'isroVikramOps' | 'custom';
export type AnalysisTab = 'power' | 'windows' | 'pointing';
export type CompareCentreTab = 'aligned' | 'season' | 'calendar';
export type MapExtent = '80S' | '85S';
export type MapLayerId = 'illumination' | 'earth_visibility' | 'slope_hazard' | 'psr' | 'psr_distance';

export type SiteRef = { kind: 'site'; id: string } | { kind: 'point'; lat: number; lon: number };

export interface Definitions {
  /** Sun available when ≥ this % of the disk clears the effective mask. */
  sunDiskThresholdPct: number;
  /** Earth visible when DTE margin ≥ this (deg). */
  earthMarginDeg: number;
  /** Earth disk fraction required for DTE (%). */
  dteDiskThresholdPct: number;
  dsnMode: DsnMode;
  /** DSN complex sees the Moon above this elevation (deg). */
  dsnMaskDeg: number;
  /** R3 D-10: additional "Sun elevation ≥ X°" requirement; 0 = off. */
  minSunElevationOps: number;
}

export interface Tilt {
  magnitudeDeg: number;
  directionDeg: number;
}

export interface ProfileThresholds {
  surfaceDurationDays: number;
  minSunlitPct: number;
  minLinkHours: number;
  maxLongestNightH: number;
  maxPadSlopeDeg: number;
  batteryWh: number;
  loadW: number;
}

export interface Weights {
  sunlit: number;
  link: number;
  night: number;
  slope: number;
}

export interface CompareRow {
  id: 'A' | 'B' | 'C' | 'D';
  site: SiteRef;
  landingUtc: number;
  panelPreset: PanelPreset;
  yawDeg: number | null;
  tilt: Tilt;
  heightM: MastHeightM;
  baseline: boolean;
}

export interface ActiveLayers {
  extent: MapExtent;
  layer: MapLayerId | null;
  opacity: number; // 0..1
}

/** Everything that goes into the share URL. */
export interface Scenario {
  view: ViewId;
  persona: Persona;
  site: SiteRef;
  landingUtc: number; // epoch ms UTC
  durationDays: DurationDays;
  scrubUtc: number; // committed scrub time, epoch ms UTC
  slipDays: number; // −30…+30
  heightM: MastHeightM;
  panelPreset: PanelPreset;
  yawDeg: number | null; // null = best of the 15° sweep (PLAN §5.6)
  tilt: Tilt; // off-nominal tilt
  definitions: Definitions;
  definitionsPreset: DefinitionsPresetId;
  profile: ProfileThresholds;
  weights: Weights;
  compareRows: CompareRow[]; // ≤ 4
  layers: ActiveLayers;
  analysisTab: AnalysisTab; // Cockpit centre tab
  compareTab: CompareCentreTab; // Compare centre tab
}

// ---------- defaults ----------

/** IM-2 Athena official touchdown (R3 D-12) — the CP1 demo scenario. */
export const DEFAULT_LANDING_UTC = Date.UTC(2025, 2, 6, 17, 28, 50);

export const DEFAULT_DEFINITIONS: Definitions = {
  sunDiskThresholdPct: 50,
  earthMarginDeg: 1,
  dteDiskThresholdPct: 50,
  dsnMode: 'dsnAware',
  dsnMaskDeg: 10,
  minSunElevationOps: 0,
};

export const DEFINITIONS_PRESETS: Record<Exclude<DefinitionsPresetId, 'custom'>, Definitions> = {
  default: DEFAULT_DEFINITIONS,
  /** R3 D-10: "ISRO Vikram ops (min Sun elevation 6°)". */
  isroVikramOps: { ...DEFAULT_DEFINITIONS, minSunElevationOps: 6 },
};

export const DEFAULT_SCENARIO: Scenario = {
  view: 'cockpit',
  persona: 'planner',
  site: { kind: 'site', id: 'im2_athena' },
  landingUtc: DEFAULT_LANDING_UTC,
  durationDays: 14,
  scrubUtc: DEFAULT_LANDING_UTC,
  slipDays: 0,
  heightM: 2,
  panelPreset: 'fourSide',
  yawDeg: null,
  tilt: { magnitudeDeg: 0, directionDeg: 0 },
  definitions: DEFAULT_DEFINITIONS,
  definitionsPreset: 'default',
  profile: {
    surfaceDurationDays: 14,
    minSunlitPct: 50,
    minLinkHours: 100,
    maxLongestNightH: 72,
    maxPadSlopeDeg: 10,
    batteryWh: 2000,
    loadW: 60,
  },
  weights: { sunlit: 0.4, link: 0.3, night: 0.2, slope: 0.1 },
  compareRows: [],
  layers: { extent: '85S', layer: 'illumination', opacity: 0.8 },
  analysisTab: 'power',
  compareTab: 'aligned',
};

export const SCENARIO_KEYS = Object.keys(DEFAULT_SCENARIO) as (keyof Scenario)[];
export const MAX_COMPARE_ROWS = 4;
const ROW_IDS: CompareRow['id'][] = ['A', 'B', 'C', 'D'];

// ---------- actions ----------

export interface ScenarioActions {
  setView(v: ViewId): void;
  setPersona(p: Persona): void;
  selectSite(id: string): void;
  setCustomPoint(lat: number, lon: number): void;
  setLandingUtc(t: number): void;
  setDuration(d: DurationDays): void;
  /** Commit the scrub time (on release / jump / key). Also moves the live crosshair. */
  commitScrub(t: number): void;
  /** Commit slip (on release). Live drag writes slipBus only. */
  setSlip(days: number): void;
  setHeight(h: MastHeightM): void;
  setPanelPreset(p: PanelPreset): void;
  setYaw(deg: number | null): void;
  /** Commit off-nominal tilt (on release). Live drag writes padDragBus only. */
  setTilt(t: Tilt): void;
  /** Edit individual definitions → preset becomes 'custom' unless it still equals a preset. */
  setDefinitions(patch: Partial<Definitions>): void;
  applyDefinitionsPreset(id: Exclude<DefinitionsPresetId, 'custom'>): void;
  setProfile(patch: Partial<ProfileThresholds>): void;
  setWeights(patch: Partial<Weights>): void;
  addCompareRow(row?: Partial<Omit<CompareRow, 'id'>>): CompareRow['id'] | null;
  duplicateCompareRow(id: CompareRow['id']): CompareRow['id'] | null;
  updateCompareRow(id: CompareRow['id'], patch: Partial<Omit<CompareRow, 'id'>>): void;
  removeCompareRow(id: CompareRow['id']): void;
  setBaseline(id: CompareRow['id']): void;
  setLayers(patch: Partial<ActiveLayers>): void;
  setAnalysisTab(t: AnalysisTab): void;
  setCompareTab(t: CompareCentreTab): void;
  /** Replace the scenario (URL decode, Quick-Start load). Missing fields fall back to defaults. */
  hydrate(s: Partial<Scenario>): void;
  reset(): void;
}

export type ScenarioStore = Scenario & ScenarioActions;

const sameDefs = (a: Definitions, b: Definitions) =>
  (Object.keys(a) as (keyof Definitions)[]).every((k) => a[k] === b[k]);

function presetFor(d: Definitions): DefinitionsPresetId {
  for (const [id, p] of Object.entries(DEFINITIONS_PRESETS)) if (sameDefs(d, p)) return id as DefinitionsPresetId;
  return 'custom';
}

/** Data-only view of the store (what urlSync encodes). */
export function pickScenario(s: Scenario): Scenario {
  const out = {} as Record<string, unknown>;
  for (const k of SCENARIO_KEYS) out[k] = s[k];
  return out as unknown as Scenario;
}

export const useScenario = create<ScenarioStore>()((set, get) => {
  const nextRowId = () => ROW_IDS.find((id) => !get().compareRows.some((r) => r.id === id)) ?? null;
  const syncBuses = (s: Scenario) => {
    crosshairBus.set({ tScrub: s.scrubUtc, tHover: null, source: 'store' });
    slipBus.set({ slipDays: s.slipDays, dragging: false });
    padDragBus.set({ tiltMagDeg: s.tilt.magnitudeDeg, tiltDirDeg: s.tilt.directionDeg, yawDeg: s.yawDeg ?? 0 });
  };

  return {
    ...DEFAULT_SCENARIO,

    setView: (view) => set({ view }),
    setPersona: (persona) => set({ persona }),
    selectSite: (id) => set({ site: { kind: 'site', id } }),
    setCustomPoint: (lat, lon) => set({ site: { kind: 'point', lat, lon } }),
    setLandingUtc: (landingUtc) => {
      set({ landingUtc, scrubUtc: landingUtc });
      crosshairBus.set({ tScrub: landingUtc, source: 'store' });
    },
    setDuration: (durationDays) => set({ durationDays }),
    commitScrub: (scrubUtc) => {
      crosshairBus.set({ tScrub: scrubUtc, source: 'store' });
      if (get().scrubUtc !== scrubUtc) set({ scrubUtc });
    },
    setSlip: (days) => {
      const slipDays = Math.max(-30, Math.min(30, Math.round(days)));
      slipBus.set({ slipDays, dragging: false });
      set({ slipDays });
    },
    setHeight: (heightM) => set({ heightM }),
    setPanelPreset: (panelPreset) => set({ panelPreset }),
    setYaw: (yawDeg) => set({ yawDeg }),
    setTilt: (tilt) => {
      padDragBus.set({ tiltMagDeg: tilt.magnitudeDeg, tiltDirDeg: tilt.directionDeg, dragging: false });
      set({ tilt });
    },
    setDefinitions: (patch) => {
      const definitions = { ...get().definitions, ...patch };
      set({ definitions, definitionsPreset: presetFor(definitions) });
    },
    applyDefinitionsPreset: (id) => set({ definitions: { ...DEFINITIONS_PRESETS[id] }, definitionsPreset: id }),
    setProfile: (patch) => set({ profile: { ...get().profile, ...patch } }),
    setWeights: (patch) => set({ weights: { ...get().weights, ...patch } }),

    addCompareRow: (row = {}) => {
      const id = nextRowId();
      if (!id) return null;
      const s = get();
      const r: CompareRow = {
        site: s.site,
        landingUtc: s.landingUtc,
        panelPreset: s.panelPreset,
        yawDeg: s.yawDeg,
        tilt: s.tilt,
        heightM: s.heightM,
        baseline: s.compareRows.length === 0,
        ...row,
        id,
      };
      set({ compareRows: [...s.compareRows, r].sort((a, b) => a.id.localeCompare(b.id)) });
      return id;
    },
    duplicateCompareRow: (id) => {
      const src = get().compareRows.find((r) => r.id === id);
      if (!src) return null;
      const { id: _drop, ...rest } = src;
      return get().addCompareRow({ ...rest, baseline: false });
    },
    updateCompareRow: (id, patch) =>
      set({ compareRows: get().compareRows.map((r) => (r.id === id ? { ...r, ...patch, id } : r)) }),
    removeCompareRow: (id) => {
      const rows = get().compareRows.filter((r) => r.id !== id);
      if (rows.length && !rows.some((r) => r.baseline)) rows[0] = { ...rows[0], baseline: true };
      set({ compareRows: rows });
    },
    setBaseline: (id) => set({ compareRows: get().compareRows.map((r) => ({ ...r, baseline: r.id === id })) }),

    setLayers: (patch) => set({ layers: { ...get().layers, ...patch } }),
    setAnalysisTab: (analysisTab) => set({ analysisTab }),
    setCompareTab: (compareTab) => set({ compareTab }),

    hydrate: (s) => {
      const next: Scenario = { ...DEFAULT_SCENARIO, ...s };
      next.compareRows = next.compareRows.slice(0, MAX_COMPARE_ROWS);
      next.definitionsPreset = presetFor(next.definitions);
      set(next);
      syncBuses(next);
    },
    reset: () => {
      set({ ...DEFAULT_SCENARIO });
      syncBuses(DEFAULT_SCENARIO);
    },
  };
});

/** Non-React access for event handlers and the engine. */
export const getScenario = () => useScenario.getState();
