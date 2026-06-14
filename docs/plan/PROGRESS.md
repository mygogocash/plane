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
  - a few misc. Too large to complete-and-verify safely in one session (no git), so **reverted to keep `web check:types` green (11/11)**.
  * Kept (harmless on 18, needed for 19): widened `containerRef` to `RefObject<HTMLDivElement | null>` in
    `packages/editor/src/ce/components/link-container.tsx` + `…/core/components/editors/link-view-container.tsx`.
  * Added to `pnpm-workspace.yaml` overrides: `react`/`react-dom`/`@types/react`/`@types/react-dom` → `catalog:`
    (pins the React stack to 18.3.1; restored green after lockfile churn; makes a future React-19 bump a clean catalog flip).
  * **Still TODO (own focused sessions):** React 19 (~73 fixes), Zod 3→4, Headless UI 1→2, + safe minors (mobx, turbo, lucide).
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
- ✅ **WF-T6** approval gates — approval-required transitions return **202 + pending `WorkItemApproval`** (snapshotting
  target/fallback) instead of moving; approvals list + decision endpoints; full-approve advances via the gated path,
  reject routes to `fallback_state` (or 400 if none); approver-only decisions w/ logged workspace-admin override;
  comment sanitized via shared nh3 helper; per-approver notifications; gated by `WORKFLOW_APPROVALS_ENABLED`
  (independent of enforcement). **7 contract tests pass.** Files: `utils/workflow.py`, `app/views/workflow/base.py`,
  `app/views/issue/base.py`, `app/urls/workflow.py`, `settings/common.py`, `.env.example`, `tests/contract/app/test_approvals.py`.
- ✅ **WF-T7** api-key `/api/v1/` mirror of workflow-transitions CRUD + state-transition — 5 contract tests pass
  (admin-keyed→201, member-keyed→403, illegal→409 and guest-keyed disallowed→403 identical to session, list scoped
  to the key's workspace+project). Reuses the same `enforce_state_transition` gate. Files: `apps/api/plane/api/views/workflow.py`,
  `api/urls/workflow.py`, `api/views/__init__.py`, `api/urls/__init__.py`, `tests/contract/api/test_workflow_v1.py`.
  (Minor follow-up: v1 list returns a bare array like session, not the v1 `{results}` paginated envelope — one-line `paginate()` swap if desired.)
- ⬜ WF-T8+ type-specific rules, lifecycle controls; then frontend (MobX store, settings workflow builder, gating UI)
  (see `workflows-approvals/tasks.md` for the full card list)

**Tally:** 7 cards done (WF-T1–T7), **42 workflow tests passing** (17 unit + 25 contract), migrations `0125`+`0126` clean.
Regression: full contract/app suite green except 8 pre-existing magic-link rate-limit flakes (unrelated; pass in isolation).

> Migration note: `0126` reconciles model-state drift from the Django 5.2 + pytz 2026.2 upgrade (timezone `choices` +
> M2M field re-serialization). `sqlmigrate` confirms it is **state-only / no-op DDL** — non-destructive.

## Git

- `28f98cd` chore: initial commit (fork baseline + sessions 1–N work)
- `697ef6d` feat: workflow approval gates (WF-T6)
- `3273f6c` fix: reconcile migration state after Django 5.2 + pytz upgrade (0126)
- `5e060e9` feat: workflow-transitions + state-transition v1 API mirror (WF-T7)

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
2. Initiatives → 4. Wiki gaps → 5. Plane AI expansion.

> Update this file as cards complete so any session (or subagent) can resume cleanly.
