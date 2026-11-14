// Owner: Abhinav
// Slot registry: id → owner, component, budget, and whether the owner's stub is importable yet.
// `status`: 'stub'    = teammate stub exists and is imported (renders inside the slot)
//           'missing' = teammate file has no export yet → placeholder rendered in my layout (listed in report)
//           'later'   = my own component, built in a later phase (Phase N)
//           'live'    = built and wired
export type SlotId =
  | 'search'
  | 'map'
  | 'siteList'
  | 'answer'
  | 'definitions'
  | 'ribbon'
  | 'analysis'
  | 'barcode'
  | 'slip'
  | 'metricDeck'
  | 'touchdown'
  | 'profileBattery'
  | 'scenarioRows'
  | 'missionProfile'
  | 'compareSlip'
  | 'compareTabs'
  | 'compareVisual'
  | 'scan'
  | 'deltaTable'
  | 'compareWindows'
  | 'methodology';

export type Owner = 'Abhinav' | 'Ebin' | 'Nived';
export type SlotStatus = 'stub' | 'missing' | 'later' | 'live';

export interface SlotSpec {
  owner: Owner;
  /** Final component name + agreed import path (FRONTEND_BUILD_GUIDE §6 Phase 1 / WORK_DISTRIBUTION §5). */
  component: string;
  path: string;
  status: SlotStatus;
  /** Phase in which the real component lands (for 'later'). */
  phase?: number;
  /** Budget token in tokens.ts (slotBudget/sideBudget key); 'flex' = takes remaining height. */
  budget: string;
  /** Whitelisted internal scroll container (§4). */
  scroll?: boolean;
}

export const SLOTS: Record<SlotId, SlotSpec> = {
  // ---- Cockpit · left ----
  search: {
    owner: 'Abhinav',
    component: 'Search + FilterChips',
    path: 'features/sidebar',
    status: 'later',
    phase: 3,
    budget: 'search',
  },
  map: { owner: 'Nived', component: 'Basemap', path: 'features/map/Basemap', status: 'stub', budget: 'map' },
  siteList: {
    owner: 'Abhinav',
    component: 'SiteCard list',
    path: 'features/sidebar/SiteCard',
    status: 'later',
    phase: 3,
    budget: 'flex',
    scroll: true,
  },
  // ---- Cockpit · centre ----
  answer: {
    owner: 'Nived',
    component: 'AnswerStrip',
    path: 'features/answer/AnswerStrip',
    status: 'stub',
    budget: 'answer',
  },
  definitions: {
    owner: 'Abhinav',
    component: 'DefinitionsBar',
    path: 'features/definitions/DefinitionsBar',
    status: 'later',
    phase: 3,
    budget: 'definitions',
  },
  ribbon: {
    owner: 'Ebin',
    component: 'Ribbon',
    path: 'features/ribbon/Ribbon',
    status: 'missing',
    budget: 'ribbonMin',
  },
  analysis: {
    owner: 'Ebin',
    component: 'AnalysisPanel',
    path: 'features/analysis/AnalysisPanel',
    status: 'missing',
    budget: 'analysis',
  },
  barcode: {
    owner: 'Ebin',
    component: 'Barcode',
    path: 'features/barcode/Barcode',
    status: 'missing',
    budget: 'barcode',
  },
  slip: { owner: 'Ebin', component: 'SlipBar', path: 'features/barcode/SlipBar', status: 'missing', budget: 'slip' },
  // ---- Cockpit · right ----
  metricDeck: {
    owner: 'Nived',
    component: 'MetricDeck',
    path: 'features/metrics/MetricDeck',
    status: 'stub',
    budget: 'metricDeck',
  },
  touchdown: {
    owner: 'Ebin',
    component: 'TouchdownPad',
    path: 'features/touchdown/TouchdownPad',
    status: 'missing',
    budget: 'flex',
  },
  profileBattery: {
    owner: 'Abhinav',
    component: 'ProfileBatteryAccordion',
    path: 'features/scenarios/ProfileBatteryAccordion',
    status: 'later',
    phase: 4,
    budget: 'accordionHeader',
  },
  // ---- Compare ----
  scenarioRows: {
    owner: 'Abhinav',
    component: 'ScenarioRows',
    path: 'features/scenarios/ScenarioRows',
    status: 'later',
    phase: 4,
    budget: 'compareRows',
  },
  missionProfile: {
    owner: 'Abhinav',
    component: 'MissionProfileForm',
    path: 'features/scenarios/MissionProfileForm',
    status: 'later',
    phase: 4,
    budget: 'flex',
  },
  compareSlip: {
    owner: 'Ebin',
    component: 'SlipBar (global)',
    path: 'features/barcode/SlipBar',
    status: 'missing',
    budget: 'slip',
  },
  compareTabs: {
    owner: 'Abhinav',
    component: 'Centre toggle',
    path: 'app/views/CompareView',
    status: 'live',
    budget: 'compareTabs',
  },
  compareVisual: {
    owner: 'Ebin',
    component: 'AlignedBarcodes | SeasonStrip | FeasibilityCalendar',
    path: 'features/compareVisuals',
    status: 'missing',
    budget: 'flex',
  },
  scan: {
    owner: 'Nived',
    component: 'ScanPanel',
    path: 'features/compareResults/ScanPanel',
    status: 'stub',
    budget: 'flex',
    scroll: true,
  },
  deltaTable: {
    owner: 'Nived',
    component: 'DeltaTable',
    path: 'features/compareResults/DeltaTable',
    status: 'stub',
    budget: 'deltaTable',
  },
  compareWindows: {
    owner: 'Ebin',
    component: 'WindowsTable',
    path: 'features/analysis/WindowsTable',
    status: 'missing',
    budget: 'compareWindows',
    scroll: true,
  },
  // ---- Methodology ----
  methodology: {
    owner: 'Abhinav',
    component: 'MethodologySections',
    path: 'features/methodology/MethodologySections',
    status: 'later',
    phase: 6,
    budget: 'flex',
    scroll: true,
  },
};
