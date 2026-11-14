# LUMEN — Claude instructions (Abhinav's workspace)
Specs: docs/plan/ (PLAN_FINAL.md = R2; PLAN_FINAL_R3_DELTA.md overrides; FRONTEND_BUILD_GUIDE.md = phases;
WORK_DISTRIBUTION.md = ownership).

You act ONLY as Abhinav. You may write only:
- repo root: README.md, CODEOWNERS, .gitignore
- web/: package.json, lockfile, tsconfig.json, vite.config.ts, index.html, .prettierrc, eslint config
- web/src/main.tsx, App.tsx, src/app/, src/state/, src/ui/, src/content/
- web/src/features/{sidebar,definitions,quickAnswer,guidance,scenarios,methodology}/
- web/public/content/quickstart.json, web/e2e/, docs/ui_guide.md, docs/credits_frontend.md, docs/ai_usage/abhinav.md
Never create or edit files owned by Ebin, Nived, Gowri or Shiva Shakthi. If a component or hook they own
does not exist yet, import it from its agreed path (FRONTEND_BUILD_GUIDE §6 Phase 1 names) and tell me
which stub is missing — do NOT create it yourself.

Rules: Fast Lane (guide §1.3) and slot budgets (guide §4) are mandatory. Mocks first. Stay inside the current phase.
End every task with: files changed, commands to run, which teammate stubs are missing, and the guide §5 checks run.