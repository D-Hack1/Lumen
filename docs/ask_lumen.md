# Ask LUMEN

_Owner: Ebin_ · code: `web/src/features/ask/`

An offline helper opened with `/`. It is **search and templates, not a chatbot**: it can only act on the phrases listed
here, and it can only quote text that is already in LUMEN's own files. No network, no model, no invented numbers.

## What it does
| Part | You type | It does | Code |
|---|---|---|---|
| Commands | `go to compare`, `show IM-2`, `slip 9 days`, `help` | calls the app's own actions (`go`, `selectSite`, `setSlip`) | `commands.ts` |
| Explain | `what is libration`, `why a windows table` | keyword search over `public/content/knowledge.json`; shows the text and its source | `knowledge.ts` |
| Why this number | `why is this ± so big?`, or a tile's "Why?" button | a template filled from the current result | `why.ts` |

## Rules that keep it honest
- A **±** is only stated when the result has one (`dtMs != null`, `lo/hi != null`). Otherwise the line says why there is
  none, quoting `meta.sigmaSource` and `meta.tierBadge`. Real σ is not available yet, so today those lines say so.
- The clearance rate is **derived** from `series.sunClearanceDeg` per `stepMs`; σ is read from `series.sigmaBandDeg`.
  Nothing is hard-coded.
- Verdict reasons, definitions and glossary text are **quoted**, not paraphrased.
- Slip commands act only if the live pages expose `setSlip`; otherwise the box says it can't yet.
- Landing-date commands are out of v1 (the live pages have no landing-date state).

## Knowledge file
Built by `node scripts/build-knowledge.mjs` (from `web/`) from `glossary.json`, `docs/validation.md`,
`docs/limitations.md` and the plan's Revision 2 changelog (the decision log). Anything mentioning Shackleton is excluded
(mask under review). Re-run it whenever those sources change.

## Wiring (three one-liners, none inside Ebin's folder)
1. Mount: `<AskLumen />` inside `<LumenContext.Provider>` in `features/pages/PagesApp.tsx`.
2. Metric tiles: `<MetricDeck onWhy={askWhy} />` (`import { askWhy } from '../ask'`).
3. Slip: expose `setSlip(days)` on `LumenState`; `AskLumen` picks it up automatically.
When the live pages read `useResult()`, set `PAGES_USE_ENGINE_RESULT = true` in `AskLumen.tsx` (removes the
"numbers are from the engine's own scenario" note).

## Keys
`/` opens (ignored in inputs, with ctrl/meta/alt, and on key repeat). `Esc` closes (capture phase, before popovers).
Arrow keys only inside the box. Avoids backtick (Perf HUD) and S/E/X/T.
