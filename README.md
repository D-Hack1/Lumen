# LUMEN · Lunar Mission ENvironment Navigator

**Hero widget:** the SKYLINE Ribbon.

A calculator and visual planner for geometric Sun availability and Earth-communication
windows at lunar landing sites, with a generic power estimate. See `plan/PLAN_FINAL (1).md`
for the full locked spec and `plan/WORK_DISTRIBUTION (1).md` for who owns what.

## Repository layout

- `pipeline/` — Python 3.12 build-time pipeline (ephemeris, DSN, terrain, validation).
- `web/` — React + Vite + TypeScript static offline PWA.
- `contracts/` — frozen data & API contracts (source of truth for file formats and hooks).
- `docs/` — validation, data sources, limitations, architecture, AI-usage logs.
- `plan/` — the locked master plan and work-distribution documents (read-only reference).

Ownership of every path is enforced by `CODEOWNERS`; see `plan/WORK_DISTRIBUTION (1).md` §1–§3
before editing anything outside your own section.

## Getting started

### Backend (`pipeline/`)

```
cd pipeline
pip install -e .
pytest
```

### Frontend (`web/`)

```
cd web
npm install
npm run dev            # http://localhost:5173 (mock data by default: VITE_LUMEN_DATA=mock|real)
npm test               # Vitest unit tests
npm run e2e:install    # once: Playwright Chromium
npm run e2e            # live app smoke: the four pages × 5 viewports (loads, no errors, no horizontal scroll) + routing, theme, slip
npm run e2e:real       # LEGACY shell only (web/e2e/legacy/): checks that need real data (CY-3 + ISRO preset → Answer Strip ops state)
npm run lint && npm run typecheck
```

Layout, slot ids, density modes and the hot-path rules for teammates: `docs/ui_guide.md`.

## Status

Frontend Phase 4 (legacy shell, no longer mounted: Compare view, scenario rows, Mission Profile, Profile & Battery accordion) built for Abhinav's scope, on top of Phase 3 (Site Explorer, Definitions Bar, glossary tooltips) — see `plan/FRONTEND_BUILD_GUIDE.md` §6 and the per-person "Order of work" tables in
`plan/WORK_DISTRIBUTION (1).md` for the build sequence and checkpoints (CP0–CP3).
