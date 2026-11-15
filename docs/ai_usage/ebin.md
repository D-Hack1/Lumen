# ebin.md

_Owner: Ebin_

Per-person AI usage log. Format follows `abhinav.md`: tool, what was generated, what was found wrong and fixed, human review status, verification.
All of this work was done in Claude Code sessions with Claude models (Opus 5.5 / Sonnet 5.5), limited to Ebin-owned folders
(`web/src/features/{ribbon,analysis,barcode,touchdown,compareVisuals,sparkline,shared,ask,methodology}`, `docs/visuals.md`, this file) unless a
shared file is named below. The assistant was told to treat `docs/`, the plan and the contracts as the source of truth and not to invent data.

## 2026-11-14 · Phase 1–2: stubs, shared layered canvas, Ribbon, Barcode/Slip, charts
- **Generated:** stub components with their final names; `LayeredCanvas` (static + overlay canvas, DPR-aware, no transitions); the Ribbon
  panorama (terrain silhouette from the real mask, ±σ band, Sun/Earth tracks, markers), Horizon Lens (true-scale disks clipped by the
  terrain), scrub/play transport; Survival Barcode with pattern encodings; Slip Bar; Power & Elevation; shared geometry helpers + tests.
- **Found and fixed on review (by teammates, then verified):** per-tick React `setState` in Pointing & Link and the Slip Bar (against the Fast
  Lane rule); a controlled tilt slider that snapped back while dragging; an overlay redrawn every frame forever (now bus-driven).
- **Human review:** pending (Ebin) — check the panorama scale (the "V ×N" exaggeration tag) and the Lens disk geometry against the plan.
- **Verification:** `tsc`, ESLint, Vitest; live Playwright drags (tilt reached its dragged value; idle chart made 0 animation-frame calls in 2 s).

## 2026-11-14 · Phase 3–5: Windows Table, Pointing & Link, Touchdown Pad, compare visuals, Educator variants
- **Generated:** Windows Table (sort/filter, ± times, [lo–hi] durations, CSV/JSON through the engine's exporters); DSN lanes; Touchdown Pad
  (slope/aspect compass, panel preset, mast height, yaw and tilt dials on the Fast Lane bus, per-panel power bars, pad risk flag, dispersion
  histogram); Aligned Barcodes with a live slip preview; Season Strip; 60-day Feasibility Calendar; Educator wording; coachmark anchors; the
  Earth Twin overlay. Pure helpers (`padModel`, `barcodeShift`, `lensGeometry`, `visualCopy`) have unit tests.
- **Found and fixed:** a slip-preview that previewed the wrong rows; the dispersion histogram and pad badge disagreeing (they now read one
  loaded grid through the engine's `summariseDispersion`); a wrong glossary definition shown for Earth elevation (the glossary lists some
  metrics under several terms; now an explicit metric → entry map).
- **Human review:** pending (Ebin).
- **Verification:** unit tests; real-browser checks of the Touchdown tilt drag, the histogram and the Earth Twin; the zero-scroll suite at
  six viewports (36/36) while the old cockpit was mounted.

## 2026-11-14/15 · Real NASA imagery
- **Generated:** loaders that decode the Sun (SDO) and Earth (EPIC) images once into bitmaps; Earth phase shading and sky orientation
  computed from the engine's Sun and Earth directions (upside-down from the south pole); the Moon south-pole image converted from a QuickMap
  export. The images themselves were downloaded from the public NASA sources named in `web/public/content/bodies/bodies.json` and cropped to the
  disk edge; no colour edits.
- **Human review:** pending (Ebin) — confirm each image's credit and licence page (recorded as "NASA imagery, credit required").
- **Verification:** screenshots of both bodies; hover/scrub frame cost before and after (+0.03 ms per frame).

## 2026-11-15 · Ask LUMEN (offline commands, explanations, "Why this number?")
- **Generated:** a command parser (go to a page, pick a site, slip N days); a BM25 knowledge search over `knowledge.json` with intent, synonyms and
  one-typo tolerance; guarded "Why this number?" templates filled from the live result (a ± is only stated when the result has one); the
  overlay UI with focus handling; `docs/ask_help.md` (plain-language answers written from the plan and the live pages); a builder script;
  a bank of ~70 ordinary questions that must find the right entry, plus off-topic questions that must not be answered; Playwright tests.
- **Design decision:** no language model. The assistant says so in the box, and answers only from written material with its source.
- **Found and fixed:** slip clamped silently to the live range (now says so); a stale knowledge file (a test rebuilds and compares); a content
  addition that outranked the right answer (caught by the must-be-first tests).
- **Human review:** pending (Ebin) — read `docs/ask_help.md`; every statement should be traceable to the plan or to what the pages show.
- **Verification:** 150+ unit tests; 18 mock-mode and 4 real-data browser tests; explanations matched the on-screen numbers exactly.

## 2026-11-15 · Final-day integration (deploy, offline, Stand here details, Methodology, Quick-Start)
- **Generated:** the PWA precache fix (large map layers are no longer precached, which was failing the production build); a GitHub Pages
  deploy workflow with a configurable base path; the Stand here "Details" section (Windows Table, Pointing & Link with DSN lanes, Power &
  Barcode) reading the page's own result through a small context; hover and click on the charts driving the shared crosshair and the page
  clock; a labelled Power chart with a ±σ band; the Methodology page (reads the validation report live); Quick-Start (four credited
  scenarios); updated tests for the newly published σ; `check_site_illumination.py`; `docs/limitations.md`, `docs/data_sources_terrain.md`,
  `docs/submission.md`.
- **Found and fixed:** a duplicate default-σ artifact I produced was discarded when the terrain owner published real Monte-Carlo σ (not
  committed); three tests asserting "σ not produced yet" were updated to the new data; my chart components were reading the global store
  instead of the page's result.
- **Not done by AI, still needs a human:** enabling GitHub Pages (repo setting), recording the demo video or slides, confirming the exact
  challenge title and team registration, verifying the Shackleton coordinates against a primary source.
- **Human review:** pending (Ebin).
- **Verification:** production build with a `/Lumen/` base served and loaded in a browser — all four pages render with real data, zero failed
  requests, zero console errors, 88 files precached, and with the network switched off the app still loads and shows engine numbers.
