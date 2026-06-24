# Phase Acceptance Criteria Audit — 2026-06-24 (refreshed)

Auditor: orchestrator follow-up session
Checkout: `/Users/kunanonjarat/Developer/mygogocash-plane`
Branch: `codex/followup-mcp-audit-promote` (includes workflow kanban routing + MCP stdio deploy)
Prior promotion: **PR #32 merged** — `origin/main` tree matches `origin/preview`
Source plans:

- `process/general-plans/active/pending-continuation-lanes_PLAN_23-06-26.md`
- `process/general-plans/active/ai-parity-followup_PLAN_23-06-26.md`
- Task checklists: `docs/plan/ai/tasks.md` (AI-T1..AI-T31), `docs/plan/wiki/tasks.md` (WIKI-T1..T21)

## Evidence conventions (honesty)

- **PASS** = test/command run in this refresh session with output cited.
- **PASS (prior)** = code + tests exist; not re-run this session.
- **PARTIAL** = implemented but missing sub-requirements or live-only verification.
- **FAIL** = required artifact absent.
- **BLOCKED** = external prerequisite (credentials, browser, hosted deploy).

## Session verification (this refresh)

| Command                                                                                                                                                     | Result                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `pnpm --filter web exec vitest run ce/components/workflow core/components/ai core/store/ai core/services/__tests__ core/components/integrations/connectors` | **19 files, 126 tests passed** |
| `pytest apps/mcp/tests/ -q` (with `mcp` SDK installed)                                                                                                      | **9 passed**                   |
| `docker compose -f docker-compose-test.yml run --rm api-tests pytest` (AI contract slice: build_project, automation, intake, slack, sentry)                 | **55 passed**                  |

---

## Phase 0 — Process & checkout recovery

Phase 0 verdict: **COMPLETE** (unchanged).

---

## Phase 1 — Ops authenticated smoke

Phase 1 verdict: **BLOCKED** — authenticated prod smoke still credential-gated. See `pending-operator-gates_24-06-26.md`.

---

## Phase 2 — Product parity reconciliation

Phase 2 verdict: **COMPLETE** (documentation artifact).

---

## Phase 3 — Workflows & approvals UI

| Lane | Acceptance criterion                                                   | Status  | Evidence                                                                                                     |
| ---- | ---------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------ |
| P3   | Automated frontend enforcement + approval UI                           | PASS    | 126 vitest incl. `workflow-enforcement`, `workflow-state-update`, `approval-banner` (this session).          |
| P3   | Kanban drag routes through `/state-transition/` when workflows enabled | PASS    | `tryWorkflowRoutedIssueUpdate` + `BaseIssuesStore.issueUpdate` wiring (PR #33 / cherry-pick on this branch). |
| P3   | Manual authenticated browser smoke                                     | BLOCKED | Operator checklist in `pending-operator-gates_24-06-26.md`.                                                  |

Phase 3 verdict: **PASS (automated); manual browser smoke BLOCKED.**

---

## Phase 4 — Wiki (WIKI-T1..T7)

Unchanged from prior audit: **T2/T3 PARTIAL** (`parent_path` + functional GIN index). Other scoped wiki tasks PASS/PASS-prior.

---

## Phase 5 — AI / ai-parity Phases A–E

| Phase                                | Verdict                                                  | Notes                                                                                                                                              |
| ------------------------------------ | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| A (duplicate detection)              | PASS (frontend) / PASS (prior backend) / BLOCKED browser | `DuplicateWarning` vitest green; manual override smoke pending.                                                                                    |
| B (embeddings)                       | PASS (prior)                                             | Unchanged.                                                                                                                                         |
| C (retrieval)                        | PASS (prior)                                             | Unchanged.                                                                                                                                         |
| D (summaries/context-assist)         | PASS                                                     | Backend + frontend tests green this session.                                                                                                       |
| E (automation/intake/connectors/MCP) | **PASS (automated)** / **PARTIAL (live MCP)**            | Models, routes, workers, UI implemented; 55 backend contract tests green; MCP stdio server deployable; live `/api/v1/` token smoke operator-gated. |

### AI-T1..AI-T31 checklist (refreshed)

| Task        | Status       | Evidence                                                                                                                                   |
| ----------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| AI-T1..T3   | PASS         | Models + migrations + db tests (prior + present in tree).                                                                                  |
| AI-T4       | PASS         | `AutomationRule`/`AutomationRun`/`AuditLog` + CRUD/worker tests (55-test slice).                                                           |
| AI-T5       | PASS         | `AutomationAgent`, intake triage models, Slack/Sentry bindings in tree + tests.                                                            |
| AI-T6..T8   | PASS (prior) | similar.py, copilot_context, duplicate-check.                                                                                              |
| AI-T9       | PASS         | `build_project` + `build_project_apply` — 10 tests in `test_build_project.py` (prior slice).                                               |
| AI-T10..T12 | PASS (prior) | summarize, share, brief/translate.                                                                                                         |
| AI-T13..T20 | PASS         | CRUD views, bgtasks, connector contract tests (55-test slice this session).                                                                |
| AI-T21      | **PARTIAL**  | `apps/mcp/` with stdio MCP server, Dockerfile, README, 9 pytest; **live deploy smoke** against production `/api/v1/` still operator-gated. |
| AI-T22..T26 | PASS         | Types/constants + duplicate/summary/brief vitest (this session).                                                                           |
| AI-T27..T31 | PASS         | Build mode, automations, agents, intake triage, connectors UI — vitest green (this session).                                               |

AI summary: **PASS = 30 tasks.** **PARTIAL = T21 live verification (1).** **FAIL = 0** for in-scope T1–T31 code surfaces.

---

## Top blockers (updated)

1. **Phase 1 authenticated/operator smoke** — credentials required (`cutover:readiness`, auth smoke template).
2. **Phase 3 manual workflow browser smoke** — after PR #33 / workflow routing merges.
3. **MCP live token smoke** — run `apps/mcp` against `PLANE_API_BASE_URL` with a scoped personal API token; document result under `process/features/cloudflare-stack-migration/reports/` or AI feature reports.
4. **Wiki T2/T3 depth** — `parent_path` breadcrumb + functional GIN index still PARTIAL.
5. **Re-promote `preview` → `main`** after follow-up PR merges (bridge commit pattern from PR #32).

---

## Related PRs

| PR     | State  | Purpose                                         |
| ------ | ------ | ----------------------------------------------- |
| #31    | MERGED | AI parity + Cloudflare cutoff → `preview`       |
| #32    | MERGED | Bridge promote `preview` → `main`               |
| #33    | OPEN   | Workflow kanban routing                         |
| (next) | —      | MCP stdio deploy + audit refresh + includes #33 |
