# frontend_engine_api.md

_Owner: Nived_ · Status: **draft for H2 freeze** · Types: `web/src/engine/types.ts` (the source of truth for field names)

Hooks + engine functions the UI may call. UI code **never** reads `public/data/` and never computes physics; it
uses only what is listed here.

## Conventions
- Times: epoch **milliseconds, UTC** (`number`). Angles: degrees. Distances: km unless the name ends `M` (metres). Durations: hours unless `Ms`.
- Uncertainty: `Bounded = { value, lo, hi }` (any may be `null`). For Tier C `lo === hi === value` (no terrain ±: show "smooth-Moon bound").
- Event/window `±` is `dtMs` / `startPmMs` / `endPmMs` (half-width, ms). `null` = not applicable (Tier C).
- Every visible label comes from Abhinav's `useCopy`; the engine returns **numbers and enums, never display strings**
  (exceptions: `meta.tierBadge`, `meta.definitionsSummary`, `QuickAnswerResult.text`).
- Mock/real switch: env `VITE_LUMEN_DATA=mock|real` (default `mock`). Same hooks, same shapes — no component changes.
- Hooks are safe to call before data arrives: they return an empty typed object with `loading`/`status` set.

## Hooks (`web/src/engine/hooks.ts`)

| Hook | Returns | Notes |
|---|---|---|
| `useCatalog()` | `CatalogResult` `{ sites: SiteRecord[], sparklines: Record<siteId, {startUtc, sunlitPct: Uint8Array, linkPct: Uint8Array}>, loading, error }` | Sparklines: one value per day from `startUtc`. |
| `useResult()` | `ScenarioResult` | Reads the active scenario from Abhinav's store (`useScenario`) and recomputes in the worker (debounced, stale jobs cancelled). |
| `useCompareResults()` | `CompareResults` `{ status, rows: {scenarioId, result, deltaVsBaseline}[], baselineId }` | One row per compare scenario (≤4). |
| `useQuickAnswer(input \| null)` | `QuickAnswerResult` | `null` input → idle. |
| `useLayers()` | `LayersResult` `{ layers, extents, sizePx, regions, regionsSvgUrl, loading, error }` | Layer `url`s are ready for `<img>`. |

### `ScenarioResult`
| Field | Type | Meaning |
|---|---|---|
| `status` | `'idle'\|'loading'\|'ready'\|'error'` | `error` string set when `'error'`. |
| `meta` | `ResultMeta` | `siteId`, `tier`, `tierBadge`, `sigmaSource`, `snapDistanceKm` (Tier B), `definitionsSummary`, `dataVersions`, `mock`. |
| `verdict` | `'GO'\|'MARGINAL'\|'NO-GO'\|'PENDING'` | + `verdictReasons: string[]` (copy keys later). |
| `answer` | `AnswerState` | Answer Strip at `tScrub`. State enums per R3 D-14: Sun `sunsetIn \| sunriseIn \| noSunriseBeforeEnd \| staysUpPastEnd \| belowOpsElevation`; Earth `earthsetIn \| earthriseIn \| linkResumesDsn`. Includes `nextEventT`, `nextEventPmMs`, `grazing`, `darkForMs`, `windowSunlitPct`, `windowLinkPct`. |
| `events` | `EventRecord[]` | `{type: sunset\|shadowExit\|earthset\|earthrise, t, dtMs, grazing, grazingReason: rate\|dt_limit\|vanishes\|null, dtMethod: fast\|exact}` |
| `windows` | `WindowRecord[]` | `{type: sun\|earth\|link\|ops, start, end, startPmMs, endPmMs, durationH: Bounded, peakElevDeg, flags:{grazing, partialStart, partialEnd}}` |
| `series` | `Series` | Uniform grid `t0 + i*stepMs`: `sunElevDeg, sunAzDeg, sunClearanceDeg, sunDiskPct, earthElevDeg, earthAzDeg, earthClearanceDeg, earthDiskPct, powerW, sunUp, earthUp, linkUp, sigmaBandDeg` (Float32Array / Uint8Array). Azimuth is Earth-referenced at polar sites. |
| `metrics` | `MetricSet` | `sunElevationDeg` (hero), `sunClearanceDeg`, `sunDiskPct`, `earthElevationDeg`, `dteMarginDeg`, `sunlitPct`, `linkPct`, `longestNightH`, `longestCommGapH`, `opsHours`, `energyPerDayWh`, `sunElevationAtTouchdownDeg`, `padSlopeDeg`, `psrDistanceKm {km, bearingDeg, areaKm2, source}`. Each is `Bounded`. |

## Functions

| Function | Signature | Notes |
|---|---|---|
| `jumpTo` | `(eventType: 'sunset'\|'shadowExit'\|'earthset'\|'earthrise') => number \| null` | Next event after current scrub time; caller sets `t_scrub`. The Mission Bar E button should show Earthrise when `answer.earth.visible` is false, Earthset otherwise. |
| `quickAnswer` | `(input: {lat, lon, utc, durationDays, heightM}) => Promise<QuickAnswerResult>` | Tier A if a curated site matches, else Tier B snap, else Tier C. `text` is pre-formatted for "Copy as text". |
| `exportCsv` | `(result: ScenarioResult, kind?: 'windows'\|'metrics') => string` | `#`-prefixed header block (site, tier, σ source, definitions, data versions) then CSV. |
| `exportJson` | `(result: ScenarioResult, kind?: 'windows'\|'metrics') => string` | `{ header, windows \| metrics }`. |
| `runScan` | `(params: ScanParams, onUpdate?: (r: ScanResult) => void) => Promise<ScanResult>` | Two-stage (R3 D-15): `onUpdate` fires with stage 1 (`provisional`, `boundsStatus:'nominal'`), then stage 2 (`'bounded'`). `ScanResult.candidates` is ranked best-first. |

`ScanParams = { mode: 'dates'|'sites', baseLandingUtc, plusMinusDays, siteIds: string[]|null, durationDays }`.

## Open points (resolve at the H2 session)
1. `useResult()` takes no args and reads the store — confirm the store field names with `frontend_state_api.md`.
2. Whether `series` should be downsampled by the engine per viewport (proposal: engine returns a fixed 10-min grid for the render window).
3. R3 additions already in the types: `grazingReason`, `dtMethod`, `boundsStatus`, `minSunElevationOps` state (`belowOpsElevation`), site `landingCoords/targetCoords/touchdownPrecision/lastContactUtc`.

## Status
Types, hook signatures and function signatures are implemented against the **mock dataset** (`web/public/data-mock/`).
Values are fake; shapes are final unless the H2 review changes them.
