# ui_guide.md

_Owner: Abhinav_ · Phase 1 (foundations). Read this before building any component that goes into a bento slot.

## 1. Shell and views
- The app root is locked to the viewport (`100dvh`, `overflow: hidden`). **The page never scrolls.**
- Mission Bar on top, then one view: **Cockpit**, **Compare** or **Methodology**. Switching views is a ≤ 150 ms opacity crossfade.
- Every bento cell is a `<Slot id="…">` (`web/src/app/layout/Slot.tsx`). The grid sets the slot's size, never its content. Your component should fill its slot (`height: 100%`) and must not overflow it.
- Internal scrolling is allowed **only** in: the site-card list, the Windows Table body, the Scan list and Methodology (`data-scroll="allowed"`).

## 2. Density modes (chosen from viewport size only)
| Test viewport | `data-density` | `data-cols` | Right column |
|---|---|---|---|
| V1 1920×960 | d1 | c1 (400 / flex / 520) | Metric Deck + Touchdown |
| V2 1536×754 | d2 | c2 (340 / flex / 396) | same |
| V3 1440×810 | d2 | c3 (340 / flex / 360) | same |
| V4 1280×720 | d4 (type ×0.9) | c4 (300 / flex / 320) | tabs [Metrics \| Touchdown] |
| V4b 1280×640 | d4 | c4 | tabs |

The attributes are set on `<html>`. Budgets are defined once in `web/src/ui/tokens.ts` (`slotBudget`, `sideBudget`, `colBudget`) and are available as CSS variables (`--slot-answer`, `--slot-ribbon-min`, `--col-left`, …).

## 3. Slot ids (Cockpit)
| Slot id | Owner · component | d1 / d2 / d4 height (px) |
|---|---|---|
| `search` | Abhinav · Search + FilterChips | 92 / 92 / 84 |
| `map` | Nived · Basemap (square) | 320 / 290 / 240 |
| `siteList` | Abhinav · SiteCard list (scrolls) | flex |
| `answer` | Nived · AnswerStrip | 92 / 80 / 72 |
| `definitions` | Abhinav · DefinitionsBar | 28 / 26 / 24 |
| `ribbon` | Ebin · Ribbon | ≥ 330 / 280 / 220 (takes the remaining height) |
| `analysis` | Ebin · AnalysisPanel | 170 / 150 / 130 |
| `barcode` | Ebin · Barcode | 64 / 56 / 48 |
| `slip` | Ebin · SlipBar | 40 / 38 / 36 |
| `metricDeck` | Nived · MetricDeck | 300 / 262 / 230 |
| `touchdown` | Ebin · TouchdownPad | flex |
| `profileBattery` | Abhinav · ProfileBatteryAccordion (header; opens as an overlay) | 48 / 40 / 36 |

**Compare:** `scenarioRows`, `missionProfile` (left) · `compareSlip`, `compareTabs`, `compareVisual` (centre) · `scan` (scrolls), `deltaTable`, `compareWindows` (scrolls) (right). **Methodology:** `methodology` (scrolls).

The Mission Bar is 56 / 52 / 48 px.

## 4. UI kit and tokens
Import from `web/src/ui` (barrel): `Panel, Card, Chip, Badge, InfoBadge, Segmented, Slider, toast/ToastViewport`, plus `color`, `font`, `type`, `motion` and patterns.
- **Colours:** use `color.*` in Canvas/SVG and `var(--c-*)` in CSS. Never hard-code a hex value.
- **Data encodings, always paired with a pattern or shape:** Sun = amber `color.sun` (solid) · Earth only = blue **dots** (`createDotPattern`) · Sun + Earth = teal `color.both` (solid) · blocked = grey **hatch** (`createHatchPattern`). In CSS, use `cssStateFill(state)`.
- **Numbers:** add the `num` class (tabular monospace) to every live value, ± and unit.
- **Motion:** use the tokens in `motion.*` and animate only `transform` and `opacity`. Containers only (popover, drawer, toast, tabs, segmented). **Never on data.**

## 5. Hot path (Fast Lane, guide §1.3) — mandatory for charts and maps
- Tag hot elements with `data-hotpath`. A global CSS rule disables transitions and animations on them.
- **Do not set React state at pointer rate.** Write the latest value to a transient bus, and draw from a subscriber.
  - `crosshairBus` (`web/src/state/buses.ts`): `{ tHover, tScrub, source }`. Use `crosshair.setHover(t, 'barcode')`, `crosshair.setScrubLive(t)`, then `crosshair.commitScrub(t)` on release.
  - `slipBus`: `{ slipDays, dragging }`. Commit on release with `useScenario.getState().setSlip(d)`.
  - `padDragBus`: `{ tiltMagDeg, tiltDirDeg, yawDeg, dragging }`. Commit with `setTilt` / `setYaw`.
- `bus.subscribe(fn)` calls `fn` **once per frame at most**, inside the shared frame bus (`web/src/state/frameBus.ts`). Draw imperatively from it: canvas calls, or ref `textContent` / attribute writes.
- For continuous animation (playback), use `frameBus.loop((now, dt) => …)`. Never start your own `requestAnimationFrame` loop.
- Committed (human-speed) state is `useScenario(selector)` (`web/src/state/scenarioStore.ts`). Labels come from `useCopy(key)` (`web/src/state/copy.ts`).

## 6. Worst-case fixture
Open `/?fixture=worst-case` to fill every slot with worst-case content: Educator copy, "No sunrise before window end (+60 d)", grazing ranges, 4 Compare rows, 30 Scan rows, a 9-row Windows Table, long site names and all badges. `npm run e2e` checks zero scroll and per-slot overflow at V1–V4b, and saves screenshots to `web/e2e/screens/phase-N/`. When your real component lands, its slot entry in the fixture is removed and the same content arrives through the mock engine's forced states.

## 7. Keyboard map
Phase 1 provides arrow-key navigation inside segmented controls and tabs. The full map (1/2/3, S/E/X/T, Q, ←/→, Space, Esc) arrives in Phase 5.
