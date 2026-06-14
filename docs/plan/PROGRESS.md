# Implementation Progress

Live tracker for the self-host feature build. Each feature's task cards live in
`docs/plan/<feature>/tasks.md`. Cards are TDD-first (RED → GREEN with real test output)
and gated behind `apps/web/ce/lib/self-host-entitlements.ts` flags.

**Test loop (backend):** a persistent container `plane-tests` is running; cycle with
`docker exec plane-tests pytest <path>` (add `--create-db` only after model changes).
**Test loop (frontend):** `pnpm --filter web exec vitest run <path>` + `pnpm turbo run check:types --filter=web`.

## Status legend
✅ done & verified · 🟡 in progress · ⬜ not started

## Dependency upgrades (separate from feature work)
- ✅ **Backend — full upgrade incl. Django 5** (`apps/api/requirements/base.txt`). Django 4.2.30→**5.2.15**,
  DRF 3.15.2→3.17.1, + every backend dep to latest (psycopg 3.3.4, redis 8.0.0, django-redis 7.0.0, celery-beat 2.9.0,
  cors-headers 4.9.0, filter 25.2, storages 1.14.6, boto3 1.43.29, otel 1.42.1, posthog 7.18.3, openai 2.41.1,
  google-genai 2.8.0, …). Verified: `manage.py check` clean + **327 tests pass** (only pre-existing magic-link
  rate-limit flakes fail, identical on 4.2). Codebase was already Django-5-clean (no removed-API usage; uses `STORAGES`).
  ⚠️ openai/google-genai **majors** are mocked in tests → live copilot LLM round-trip needs a provider smoke before GKE deploy.
  ⚠️ Final confirmation = clean Docker image rebuild from the new requirements (deploy step).
- 🟡 **Frontend majors — measured, deferred (NOT applied).** React 19 was attempted in a bounded/reversible way:
  installs cleanly (peer warnings only) but the web app needs **~73 type fixes** — 58×TS2322 (`RefObject<T>`→`RefObject<T|null>`
  ref props + `ReactNode`), 6×TS2554 (`useRef()` now needs an arg), 4×TS2503 (global `JSX` namespace removed → `React.JSX`),
  + a few misc. Too large to complete-and-verify safely in one session (no git), so **reverted to keep `web check:types` green (11/11)**.
  - Kept (harmless on 18, needed for 19): widened `containerRef` to `RefObject<HTMLDivElement | null>` in
    `packages/editor/src/ce/components/link-container.tsx` + `…/core/components/editors/link-view-container.tsx`.
  - Added to `pnpm-workspace.yaml` overrides: `react`/`react-dom`/`@types/react`/`@types/react-dom` → `catalog:`
    (pins the React stack to 18.3.1; restored green after lockfile churn; makes a future React-19 bump a clean catalog flip).
  - **Still TODO (own focused sessions):** React 19 (~73 fixes), Zod 3→4, Headless UI 1→2, + safe minors (mobx, turbo, lucide).
    Recommend worktree-isolated agents, one major at a time, each verified to `turbo check:types` green.

## Workflows & Approvals — `workflows-approvals/tasks.md`
- ✅ **WF-T1** Workflow data models + additive migration `0125` — 4 models (`WorkflowTransition`,
  `WorkflowTransitionActor`, `WorkItemApproval`, `WorkItemApprovalApprover`) + `Project.workflow_status`.
  5 unit tests pass; `makemigrations --check` clean. Files: `apps/api/plane/db/models/workflow.py`,
  `db/models/__init__.py`, `db/models/project.py`, migration `0125_*`, test `tests/unit/models/test_workflow_models.py`.
- ✅ **WF-T2** DRF serializers (4) + export — 4 unit tests pass. Files: `apps/api/plane/app/serializers/workflow.py`,
  `serializers/__init__.py`. (Note: fork has no Django admin registration anywhere — verified by grep — so admin step skipped, not invented.)
- ✅ **WF-T3** `enforce_state_transition` core service (the single authorization gate) — 8 unit tests pass incl.
  disabled-allows, no-rules-allows, role/explicit-actor grants, IllegalTransition (409), ActorNotAllowed (403),
  multi-tenant isolation, fail-closed. Files: `apps/api/plane/utils/workflow.py`, `tests/unit/utils/test_enforce_state_transition.py`.
- ✅ **WF-T4** `WorkflowTransitionViewSet` CRUD + routes (admin-only writes) — 7 contract tests pass incl.
  Member→403, list multi-tenant isolation, cross-project state→400, nested actors upsert, soft-delete.
  Files: `apps/api/plane/app/views/workflow/{__init__,base}.py`, `app/urls/workflow.py`, `app/urls/__init__.py`,
  `app/views/__init__.py`, `tests/contract/app/test_workflow_transitions_crud.py`.
- ✅ **WF-T5** wired `enforce_state_transition` into `IssueViewSet.partial_update` + new `IssueStateTransitionEndpoint`
  (`POST .../issues/<id>/state-transition/`) — 6 contract tests pass: allowed→204+state moved, illegal→409 unchanged,
  guest→403 unchanged, disabled→unrestricted, both seams→409 (single gate), non-state edit untouched.
  Files: `app/views/issue/base.py` (gate), `app/views/workflow/base.py` (endpoint), `app/urls/workflow.py`,
  `app/views/__init__.py`, `app/views/workflow/__init__.py`, `tests/contract/app/test_state_transition_enforcement.py`.
  **→ Workflows & Approvals is now functional end-to-end (rules enforce on real issue updates).**
- ⬜ WF-T6 approval gates (approval_required → 202 + WorkItemApproval), decide API, fallback routing, comment sanitization
- ⬜ WF-T7+ frontend: MobX store, settings workflow builder, transition gating UI, entitlement wiring
  (see `workflows-approvals/tasks.md` for the full card list)

**Tally:** 5 cards done, 30 workflow tests passing (17 unit + 13 contract), migration `0125` clean.
Regression: full contract/app suite green except 8 pre-existing magic-link rate-limit flakes (unrelated; pass in isolation).

## Epics & Initiatives — `epics-initiatives/tasks.md`
- ⬜ all cards (Initiatives model is greenfield; epics UI completion)

## Work Items & Work Item Types — `work-items/tasks.md`
- ⬜ all cards (custom properties, templates, recurring — mostly unlock + finish)

## Wiki & Pages — `wiki/tasks.md`
- ⬜ all cards (live cursors flag unlock, content search, comments, export, templates)

## Plane AI — `ai/tasks.md`
- ⬜ all cards (Build mode, connectors, semantic actions — largest; do last)

## Build order (from README)
1. Work Item Types / custom properties → 2. **Workflows & Approvals (in progress)** →
3. Initiatives → 4. Wiki gaps → 5. Plane AI expansion.

> Update this file as cards complete so any session (or subagent) can resume cleanly.
