# frontend_content.md

_Owner: Abhinav_ · Status: copy keys **implemented (Phase 2: D-14 states complete in both personas)**; `quickstart.json` shape **draft for Phase 5**.
Source of truth: `web/src/content/personaCopy.ts` (strings), `web/src/state/copy.ts` (lookup),
`web/src/engine/format.ts` → `fill()` (placeholders, Nived). If this file and the code disagree, the code wins and
this file gets fixed.

## 1. How copy works

- **Every visible label** in every component comes from `useCopy(key)` or `useCopyFn()` (WORK_DISTRIBUTION §5).
  The engine returns numbers and enums, never display strings (except `tierBadge`, `definitionsSummary` and `QuickAnswerResult.text`).
- **Two tables:** `planner` (complete) and `educator` (overrides only, for keys whose wording differs).
- **Lookup order:** Educator override (only when persona = educator) → Planner → **the key itself**. A missing
  string shows up as its key, never blank. This is how missing keys are spotted.
- **API** (`web/src/state/copy.ts`):

| Function | Use |
|---|---|
| `useCopy(key): string` | one label in a component |
| `useCopyFn(): (key) => string` | many labels in a component (`const t = useCopyFn()`) |
| `usePersona(): 'planner' \| 'educator'` | persona-specific rendering beyond wording (rounding, callouts) |
| `getCopy(key, persona): string` | outside React (exports, Copy as text) |

- **Placeholders:** `{name}` in a string is filled by the caller with `fill(template, vars)` from
  `web/src/engine/format.ts`. An unfilled placeholder stays visible as `{name}`. Placeholders used now:

| Placeholder | Meaning | Formatted by |
|---|---|---|
| `{t}` | a duration or countdown, already formatted with ± or a range (e.g. `41 h ± 5 h`, `~12–30 h`) | `fmtUntil` / `fmtSpan` (`engine/format.ts`) |
| `{n}` | integer days (window length) or a percentage | caller |
| `{deg}` | degrees (ops elevation) | caller |
| `{name}`, `{lat}`, `{lon}`, `{km}` | off-map indicator (site name, coordinates, distance) | caller |
| `{label}`, `{time}`, `{pm}`, `{key}` | Mission Bar jump tooltip (`mb.jump.tip*`): the `.long` jump label, target UTC to the minute, ± half-width, shortcut key | `jumpTooltip` (`app/jumps.ts`) |

- **Uncertainty is never in the copy string:** ±, `[lo–hi]` and "grazing" ranges are built by the formatter and
  passed in through `{t}`. Copy owns the words around them.

## 2. Rules for keys

1. **Namespace = component group** (`mb.*`, `answer.*`, `metric.*` …). The namespace's user (listed in §4) asks for keys; Abhinav owns the file and adds them.
2. **Adding or renaming a key:** post in `#lumen-changes` with `key · Planner text · Educator text (optional) · where used`. Abhinav adds it to
   `personaCopy.ts` and to this file. **Don't edit `personaCopy.ts` from another branch**; it's a single-owner file (CODEOWNERS).
3. **State enums map to keys by name:** the D-14 Answer Strip states use the engine enum as the last key segment
   (`answer.label.<SunCellState|EarthCellState>`, `answer.sun.<state>`, `answer.earth.<state>`), and so do panel
   presets (`touchdown.preset.<PanelPreset>`), map layers (`map.layer.<MapLayerId>`), verdicts
   (`verdict.<Verdict>`), views (`view.<ViewId>`) and slots (`slot.<SlotId>`). A new enum value needs a new key.
4. **`.long` suffix** = the full name used for the tooltip, `aria-label` or wide layouts. The plain key is the short label
   shown when space is tight (Mission Bar at c2–c4).
5. **Educator copy:** plain language, rounded, no jargon, no symbols without words. It must still carry the
   uncertainty ("give or take", "hard to pin down"). It never drops the ± that `{t}` carries.
6. **Length budget:** strings must fit their slot at V4 (1280×720, type ×0.9). The worst case is checked by
   `npm run e2e` with `?fixture=worst-case` (guide §5.1).

## 3. Current Educator overrides

71 keys (full wording in §4): `mb.*` (16), `verdict.*` (10), `profile.*` (10), `answer.*` (31), `metric.*` (4).

Phase 2 completed Educator wording for **all 9 D-14 Answer Strip states** (labels, value templates, grazing,
"dark for", below-ops and the shared now/window cells), the Mission Bar jump labels and tooltips, the verdict
chip and the Mission Profile popover. Which keys make up each D-14 state is indexed in
`web/src/content/answerStates.ts` (`ANSWER_STATE_COPY`); `web/src/app/missionBar.test.tsx` checks every
state has a Planner string and a different Educator string, and that Educator keeps every `{placeholder}`.

**To do (Phase 5, A-12):** Educator wording for the remaining Metric Deck, map and Scan keys, plus the
"What am I seeing?" callouts.

## 4. Key reference (179 keys, generated from `personaCopy.ts`)

### `app.*` · App · used by Abhinav

| Key | Planner | Educator override |
|---|---|---|
| `app.name` | LUMEN |  |
| `app.tagline` | Lunar Mission ENvironment Navigator |  |

### `view.*` · View tabs · used by Abhinav

| Key | Planner | Educator override |
|---|---|---|
| `view.cockpit` | Cockpit |  |
| `view.cockpit.long` | Mission Cockpit |  |
| `view.compare` | Compare |  |
| `view.compare.long` | Scenario Compare & Slip |  |
| `view.methodology` | Methodology |  |
| `view.methodology.long` | Methodology & Validation |  |

### `mb.*` · Mission Bar · used by Abhinav

| Key | Planner | Educator override |
|---|---|---|
| `mb.landing` | Landing |  |
| `mb.landing.long` | Landing date & time (UTC) |  |
| `mb.duration` | Mission duration |  |
| `mb.met` | MET | Time since landing |
| `mb.jump.sunset` | Sunset |  |
| `mb.jump.sunset.long` | Next Sunset | Jump to the next sunset |
| `mb.jump.earthset` | Earthset |  |
| `mb.jump.earthset.long` | Next Earthset | Jump to when Earth next sets |
| `mb.jump.earthrise` | Earthrise |  |
| `mb.jump.earthrise.long` | Next Earthrise | Jump to when Earth next rises |
| `mb.jump.shadowExit` | Shadow exit | Sun returns |
| `mb.jump.shadowExit.long` | Next Shadow Exit | Jump to when the Sun comes back |
| `mb.jump.touchdown` | T0 | Landing |
| `mb.jump.touchdown.long` | Touchdown (T0) | Jump back to the landing moment |
| `mb.jump.none` | No such event in this window | That does not happen in this window |
| `mb.jump.group` | Jump to event | Jump to a moment |
| `mb.jump.tip` | {label} · {time} UTC ± {pm} · key {key} | {label} — {time} UTC, give or take {pm} (press {key}) |
| `mb.jump.tipExact` | {label} · {time} UTC · key {key} | {label} — {time} UTC (press {key}) |
| `mb.jump.tipGrazing` | {label} · {time} UTC ± {pm} (grazing) · key {key} | {label} — around {time} UTC, hard to pin down (give or take {pm}) (press {key}) |
| `mb.jump.tipNone` | {label} · none before window end · key {key} | {label} — does not happen before the window ends (press {key}) |
| `mb.verdict` | Verdict |  |
| `mb.verdict.long` | Verdict against the Mission Profile — click for details | How this plan does against the mission’s must-haves — click for details |
| `mb.persona` | Persona |  |
| `mb.share` | Share |  |
| `mb.share.long` | Share Scenario URL |  |
| `mb.share.toast` | Scenario link copied — opens this exact site, date, attitude and view. | Link copied — anyone who opens it sees exactly this view. |
| `mb.share.failed` | Could not copy automatically — the link is in the address bar. |  |

### `persona.*` · Persona switch · used by Abhinav

| Key | Planner | Educator override |
|---|---|---|
| `persona.planner` | Planner |  |
| `persona.planner.long` | Mission Planner |  |
| `persona.educator` | Educator |  |
| `persona.educator.long` | Educator / Explorer |  |

### `verdict.*` · Verdict chip · used by Abhinav

| Key | Planner | Educator override |
|---|---|---|
| `verdict.GO` | GO | Looks good |
| `verdict.MARGINAL` | MARGINAL | Borderline |
| `verdict.NO-GO` | NO-GO | Not viable |
| `verdict.PENDING` | PENDING | Not sure yet |
| `verdict.provisional` | provisional | first guess |
| `verdict.GO.long` | GO — every hard threshold passes on the conservative bound | Looks good — passes every must-have, even in the cautious case |
| `verdict.MARGINAL.long` | MARGINAL — passes on the nominal value but not on the conservative bound | Borderline — passes on the best guess, but not in the cautious case |
| `verdict.NO-GO.long` | NO-GO — at least one hard threshold fails | Not viable — at least one must-have fails |
| `verdict.PENDING.long` | PENDING — cannot be judged yet (missing data or only a smooth-Moon bound); see reasons | Not sure yet — some data is still missing, so this cannot be judged |
| `verdict.provisional.long` | Provisional — uncertainty bounds still computing; GO needs the conservative bound | First guess — the give-or-take is still being worked out |

### `profile.*` · Mission Profile popover (verdict chip) · used by Abhinav

| Key | Planner | Educator override |
|---|---|---|
| `profile.title` | Mission Profile | Mission must-haves |
| `profile.reasons` | Why |  |
| `profile.thresholds` | Hard thresholds | Must-haves |
| `profile.surfaceDurationDays` | Surface duration | Time on the surface |
| `profile.minSunlitPct` | Min sunlit | Sunlight needed |
| `profile.minLinkHours` | Min link | Radio contact needed |
| `profile.maxLongestNightH` | Max longest night | Longest dark spell allowed |
| `profile.maxPadSlopeDeg` | Max pad slope | Steepest ground allowed |
| `profile.batteryWh` | Battery |  |
| `profile.loadW` | Load |  |
| `profile.edit` | Edit in Compare | Change in Compare |
| `profile.placeholder` | The editable profile form arrives with the Compare view. | You will be able to change these in the Compare view. |
| `profile.noReasons` | No reasons reported yet. | No explanation yet. |
| `profile.close` | Close |  |

### `slot.*` · Slot labels (placeholders, accessible names) · used by Abhinav

| Key | Planner | Educator override |
|---|---|---|
| `slot.search` | Site search & filters |  |
| `slot.map` | South Pole Basemap |  |
| `slot.siteList` | Site cards |  |
| `slot.answer` | Answer Strip |  |
| `slot.definitions` | Definitions Bar |  |
| `slot.ribbon` | SKYLINE Ribbon |  |
| `slot.analysis` | Analysis tabs |  |
| `slot.barcode` | Survival Barcode |  |
| `slot.slip` | Slip Bar |  |
| `slot.metricDeck` | Metric Deck |  |
| `slot.touchdown` | Touchdown Pad |  |
| `slot.profileBattery` | Profile & Battery |  |
| `slot.scenarioRows` | Scenario rows A–D |  |
| `slot.missionProfile` | Mission Profile |  |
| `slot.compareSlip` | Global slip |  |
| `slot.compareTabs` | Centre view |  |
| `slot.compareVisual` | Compare visual |  |
| `slot.scan` | Scan |  |
| `slot.deltaTable` | Delta vs baseline |  |
| `slot.compareWindows` | Windows Table (selected row) |  |
| `slot.methodology` | Methodology & Validation |  |

### `right.*` · Right-column tabs (V4/V4b) · used by Abhinav

| Key | Planner | Educator override |
|---|---|---|
| `right.metrics` | Metrics |  |
| `right.touchdown` | Touchdown |  |

### `compare.*` · Compare centre toggle · used by Abhinav

| Key | Planner | Educator override |
|---|---|---|
| `compare.aligned` | Aligned Barcodes |  |
| `compare.season` | Season Strip |  |
| `compare.calendar` | Calendar |  |

### `answer.*` · Answer Strip (D-14 states) · used by Nived

| Key | Planner | Educator override |
|---|---|---|
| `answer.sunNow` | Sun now | The Sun right now |
| `answer.earthNow` | Earth now | Earth right now |
| `answer.up` | UP | in the sky |
| `answer.down` | DOWN | below the horizon |
| `answer.disk` | {n}% disk | {n}% of the Sun showing |
| `answer.linkOk` | link ✓ | radio contact ✓ |
| `answer.linkDown` | link ✗ | no radio contact ✗ |
| `answer.windowSunlit` | Window sunlit | Sunlight over the mission |
| `answer.windowLink` | Window link | Radio contact over the mission |
| `answer.label.sunsetIn` | Sunset | Next sunset |
| `answer.label.sunriseIn` | Sunrise (Shadow Exit) | Sun comes back |
| `answer.label.noSunriseBeforeEnd` | Sunrise | Sun comes back |
| `answer.label.staysUpPastEnd` | Sunset | Next sunset |
| `answer.label.belowOpsElevation` | Ops elevation | Sun too low |
| `answer.label.earthsetIn` | Earthset | Earth sets |
| `answer.label.earthriseIn` | Earthrise | Earth rises |
| `answer.label.linkResumesDsn` | Link | Radio contact |
| `answer.sun.sunsetIn` | Sunset in {t} | The Sun sets in {t} |
| `answer.sun.sunriseIn` | Sunrise (Shadow Exit) in {t} | The Sun comes back in {t} |
| `answer.sun.darkFor` | dark for {t} so far | dark for {t} already |
| `answer.sun.noSunriseBeforeEnd` | No sunrise before window end (+{n} d) | The Sun does not come back in this window (+{n} days) |
| `answer.sun.staysUpPastEnd` | Stays up past window end | The Sun stays up for the whole window |
| `answer.sun.belowOps` | Below ops elevation ({deg}°) — ops resume in {t} | Too low for the lander ({deg}°) — usable again in {t} |
| `answer.sun.belowOpsNoResume` | Below ops elevation ({deg}°) | Too low for the lander ({deg}°) |
| `answer.earth.earthsetIn` | Earthset in {t} | Earth sets in {t} |
| `answer.earth.earthriseIn` | Earthrise in {t} | Earth rises in {t} |
| `answer.earth.linkResumes` | Link resumes in {t} (DSN) | Radio contact returns in {t} |
| `answer.earth.noChange` | No change before window end | No change before the window ends |
| `answer.grazing` | {t} (grazing) | {t} (skims the horizon) |
| `answer.grazingFull` | grazing — timing poorly constrained | skims the horizon — timing is hard to pin down |
| `answer.smoothMoon` | smooth-Moon bound | flat-Moon estimate |

### `metric.*` · Metric Deck · used by Nived

| Key | Planner | Educator override |
|---|---|---|
| `metric.sunElevation` | Sun elevation |  |
| `metric.clearance` | Clearance / disk |  |
| `metric.earthEl` | Earth el / margin |  |
| `metric.sunlit` | Sunlit % | Time in sunlight |
| `metric.link` | Link % | Time in radio contact |
| `metric.longestNight` | Longest night | Longest dark spell |
| `metric.commGap` | Comm gap | Longest radio silence |
| `metric.ops` | Ops hours |  |
| `metric.psr` | PSR distance |  |
| `metric.psrDerived` | derived |  |
| `metric.psrWording` | permanently shadowed region (a cold trap that may host ice) |  |
| `metric.empty` | No result yet |  |

### `map.*` · Basemap · used by Nived

| Key | Planner | Educator override |
|---|---|---|
| `map.extent.80S` | 80–90°S |  |
| `map.extent.85S` | 85–90°S |  |
| `map.layer.none` | No layer |  |
| `map.layer.illumination` | Average illumination |  |
| `map.layer.earth_visibility` | Earth visibility |  |
| `map.layer.slope_hazard` | Slope hazard |  |
| `map.layer.psr` | PSR (derived) |  |
| `map.layer.psr_distance` | Distance to PSR |  |
| `map.opacity` | Layer opacity |  |
| `map.schematic` | schematic relief |  |
| `map.cursor` | Move over the map |  |
| `map.offMap` | {name} → {lat}, {lon} · {km} km |  |
| `map.inset.landing` | Landing |  |
| `map.inset.target` | Target |  |
| `map.inset.scale` | 100 m |  |

### `scan.*` · Scan Panel · used by Nived

| Key | Planner | Educator override |
|---|---|---|
| `scan.mode.dates` | This site ± days |  |
| `scan.mode.sites` | All sites |  |
| `scan.provisional` | provisional |  |
| `scan.bounded` | bounded |  |
| `scan.load` | Load |  |
| `scan.stage1` | Stage 1 · nominal |  |
| `scan.stage2` | Stage 2 · exact |  |
| `scan.running` | Scanning… |  |
| `scan.col.rank` | # |  |
| `scan.col.site` | Site · landing |  |
| `scan.col.verdict` | Verdict |  |
| `scan.col.sunlit` | Sun % |  |
| `scan.col.link` | Link % |  |
| `scan.col.night` | Night |  |

### `delta.*` · Delta Table · used by Nived

| Key | Planner | Educator override |
|---|---|---|
| `delta.metric` | Row |  |
| `delta.sunlit` | Δ sunlit |  |
| `delta.link` | Δ link |  |
| `delta.night` | Δ night |  |
| `delta.baseline` | baseline |  |
| `delta.empty` | Add a second scenario row to compare. |  |

### `ribbon.*` · Ribbon · used by Ebin

| Key | Planner | Educator override |
|---|---|---|
| `ribbon.title` | SKYLINE Ribbon |  |

### `analysis.*` · Analysis tabs · used by Ebin

| Key | Planner | Educator override |
|---|---|---|
| `analysis.tabs` | Analysis |  |
| `analysis.power` | Power & Elevation |  |
| `analysis.windows` | Windows Table |  |
| `analysis.pointing` | Pointing & Link |  |

### `slip.*` · Slip Bar · used by Ebin

| Key | Planner | Educator override |
|---|---|---|
| `slip.label` | Landing slip (days) |  |

### `touchdown.*` · Touchdown Pad · used by Ebin

| Key | Planner | Educator override |
|---|---|---|
| `touchdown.preset` | Panel preset |  |
| `touchdown.preset.fourSide` | 4 sides |  |
| `touchdown.preset.singleHeading` | 1 panel |  |
| `touchdown.preset.horizontalDeck` | Deck |  |
| `touchdown.preset.trackingMast` | Tracking mast |  |
| `touchdown.height` | Mast height |  |

## 5. `web/public/content/quickstart.json` (draft, built in Phase 5)

The file is currently `{}`. This is the shape `QuickStartDrawer` and `CoachmarkTour` will read. Sources: PLAN §6
"Quick-start scenario", §8.9, guide §3.3 and R3 D-10.

```jsonc
{
  "version": 1,
  "scenarios": [
    {
      "id": "cy3-validate",                       // stable id, kebab-case
      "order": 4,                                 // card position in the drawer (1–4)
      "title": "Validate a Real Landing: Chandrayaan-3",
      "promise": "Check our Sun elevation against the mission team's 8.75° at touchdown.", // one line on the card
      "persona": "planner",                       // persona the tour switches to: "planner" | "educator"
      "tourSeconds": 60,                          // shown as the "~60 s tour" chip
      // --- thumbnail (guide §3.3) ---
      "image": "thumbs/cy3-validate.webp",        // relative to /content/, local file only (no hotlinks), 16:9, WebP ≤ 60 KB
      "alt": "LROC view of the Chandrayaan-3 landing area near 69.4°S",
      "credit": "NASA/GSFC/Arizona State University",
      "sourceUrl": "https://…",                   // where the image came from
      "license": "Public domain (NASA); credit required",
      "fallback": "procedural",                   // shown if the image fails: a mini Horizon Lens render (Nived)
      // --- scenario to load (same shape as the share URL payload; frontend_state_api.md §3) ---
      "state": {                                  // Partial<Scenario>; missing fields = DEFAULT_SCENARIO
        "view": "cockpit",
        "site": { "kind": "site", "id": "cy3_shiv_shakti" },
        "landingUtc": 1692793980000,              // 2023-08-23T12:33:00Z (minute precision, D-12)
        "durationDays": 14,
        "definitionsPreset": "isroVikramOps",     // tour 4 applies the ISRO preset (D-10)
        "definitions": { "minSunElevationOps": 6 }
      },
      // --- coachmark tour ---
      "steps": [
        { "target": "ribbon", "text": "The Sun sits just above the ridge at touchdown…", "textEducator": "…" },
        { "target": "answer", "text": "…", "action": null },
        { "target": "definitions", "text": "…", "action": { "type": "applyDefinitionsPreset", "id": "isroVikramOps" } },
        { "target": "analysis", "text": "…", "action": { "type": "setAnalysisTab", "tab": "windows" } }
      ]
    }
  ]
}
```

**Field rules**

| Field | Rule |
|---|---|
| `version` | `1`. The loader rejects other versions |
| `scenarios` | exactly the 4 cards of PLAN §8.9, in `order` |
| `image` | local, under `web/public/content/thumbs/`. NASA/LROC preferred. ISRO imagery only with its terms recorded in `license`. **Never** a NASA logo or insignia, **never** an AI-generated image presented as real |
| `credit`, `license`, `sourceUrl` | required whenever `image` is set. The credit is shown on the image foot. Each image is also listed in `docs/credits_frontend.md` |
| `fallback` | always `"procedural"` (so cards never show an empty box) |
| `state` | decoded with the same rules as the URL (`decodeScenario`): unknown fields ignored, wrong shapes fall back to defaults. Loaded with `hydrate(state)` |
| `steps[].target` | a `SlotId` (`frontend_state_api.md` / `docs/ui_guide.md` §3) or `"missionBar"` |
| `steps[0..1]` | **every tour starts on the Ribbon and the Answer Strip**: the first two targets are `ribbon` and `answer` (either order) |
| `steps[].text` | Planner wording (plain string, not a copy key, so tour text stays editable in one file). `textEducator` is optional; it is used when persona = educator |
| `steps[].action` | optional store action run when the step opens: `{ type: <ScenarioActions name>, …args }`. Allowed: `applyDefinitionsPreset`, `setAnalysisTab`, `setCompareTab`, `setSlip`, `addCompareRow`, `setView`, `setPersona`, `commitScrub` |
| step count | 3–4 per tour (PLAN §8.9) |

**The four scenarios (ids fixed now; dates and text in Phase 5)**

| order | id | Title | persona | Notes |
|---|---|---|---|---|
| 1 | `shackleton-slip-9d` | Test a 9-Day Launch Delay at Shackleton | planner | baseline date chosen at H8 from a GO window; tour: slip +9 d → aligned barcodes → Scan |
| 2 | `im2-tilt` | Replay IM-2 Athena's Crater Tilt | planner | landing 2025-03-06T17:28:50Z; tilt 30°; label *"Illustrative; not Athena's actual array geometry."* |
| 3 | `apollo11-pole-earth` | Compare Apollo 11, the South Pole and Earth | educator | Apollo 11 vs a polar ridge row; Earth Twin overlay (Tier 1) |
| 4 | `cy3-validate` | Validate a Real Landing: Chandrayaan-3 | planner | ISRO ops preset; ends on Methodology G7 |

Open point: the Apollo 11 and Shackleton site ids must match Gowri's final `sites.json` ids.
