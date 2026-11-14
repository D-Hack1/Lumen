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
npm run dev
```

## Status

Repository scaffold only — see the per-person "Order of work" tables in
`plan/WORK_DISTRIBUTION (1).md` for the build sequence and checkpoints (CP0–CP3).
