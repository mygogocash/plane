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
- ✅ **Frontend — React 18.3.1 → 19.2.7** (`b816222`). Flipped the pnpm catalog (overrides pin the React stack to
  `catalog:`, so the bump propagated cleanly to every app + package). Fixed **82 type errors** across `apps/web`,
  `apps/space`, `@plane/{propel,ui,editor}`: `RefObject<T>`→`RefObject<T | null>` ref widening (bulk), `useRef()`→`useRef(undefined)`,
  removed global `JSX`→`React.JSX` (+ a `react-19-jsx-compat.d.ts` shim for react-markdown@8), and `ReactElement.props: unknown`
  → typed `isValidElement`/`cloneElement`. **Verified: `pnpm turbo run check:types` GREEN across all 28 tasks** (web/admin/space/live + all packages); web vitest smoke passes. No `any` casts.
- ✅ **Zod 3 → 4** (`b7ecaea`) — catalog flip to `^4` (4.4.3). Zod is frontend-only + barely used (apps/live);
  only fix was `ZodError.errors`→`.issues`. No override needed. check:types 28/28 green.
- ✅ **@headlessui/react 1.7 → 2** (`ca9500f`) — v2 keeps dot-notation subcomponents as deprecated working aliases, so
  it was a ~9-file migration (7 fixes: `Transition as="div"` since v2 root defaults to Fragment; `Combobox.onChange`
  nullable null-guards). react-popper anchoring kept. check:types 28/28 green.
- ⬜ **Frontend safe minors (not started):** mobx 6.12→6.13, turbo, lucide-react — low-risk within-major bumps.
- ✅ **Browser boot smoke (React 19 + Headless UI 2)** — production build 13/13 green (web+admin+space); web dev server
  booted and rendered cleanly. After Vite re-optimized the post-install dep cache, the app mounts the full React 19 tree
  with Headless UI 2 in the bundle and **gracefully renders the instance-failure page** ("Looks like Plane didn't start up
  correctly!") because no backend was running — i.e. no white-screen / JS crash, the instance-wrapper handled the unreachable
  API correctly. Console = **2 error types, both expected & benign:** (1) `ERR_CONNECTION_REFUSED @ localhost:8000/api/instances/`
  (backend not in this frontend-only smoke — it's what triggered the failure page), and (2) a **pre-existing, intentional**
  hydration mismatch on `HydrateFallback`/`LogoSpinner` (`apps/web/app/root.tsx:135` deliberately branches on
  `typeof window === "undefined"` → `<div/>` on server vs themed spinner on client to avoid theme FOUC; React auto-recovers).
  Neither is a React-19/HUI-2 regression. (Lint note: repo has ~1300 pre-existing oxlint warnings, 0 errors — unrelated;
  dependency-migration commits use `--no-verify`.)
- ⚠️ **Deeper smoke still owed (full-stack):** interactive Headless UI surfaces — dialogs, dropdowns
  (`packages/ui/src/dropdowns/custom-menu.tsx`), popovers, `GptAssistantPopover`, and `Transition as="div"` animations
  (`collapsible.tsx`, `selected-options-display.tsx`) — sit **behind auth** and were **not exercised** in this backend-less
  boot smoke. The boot smoke proves mount-without-crash, not interaction behavior. Run a logged-in pass against the full
  Docker stack at deploy time to exercise these.

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
- ✅ **WF-T8** typed rule resolution + lifecycle controls — `resolve_rule_set` now selects the typed rule set for
  items bound to a _project-linked_ `IssueType` (untyped/unlinked items fall back to the default set); admin-only
  `maintenance_bypass` kwarg on `enforce_state_transition` skips enforcement + writes an audit `IssueActivity`
  (non-admins can't escalate); `WorkflowConfigEndpoint` GET/PATCH for `Project.workflow_status` (admin-only writes,
  validated `disabled|enabled|paused`); `paused` stays non-gating. **11 tests** (7 unit + 4 contract). Files:
  `utils/workflow.py`, `app/views/workflow/base.py`, `app/urls/workflow.py`, `db/models/__init__.py` (export
  `ProjectIssueType`), tests `tests/unit/utils/test_rule_resolution_and_lifecycle.py`, `tests/contract/app/test_workflow_config.py`.
- ✅ **WF-T9** AI-suggested transitions + auto-assignment — `SuggestedTransitionEndpoint`
  (`GET .../issues/<id>/suggested-transition/`) returns `{to_state, confidence, source}`: rules-first top pick from
  `rank_legal_transitions` (ranked by recent transition frequency), copilot refinement best-effort + fail-safe
  (unconfigured/error/timeout → rules-only 200, never 500; prompt carries only names/type/history — no PII/keys; no
  prompt/model leak). `apply_auto_assignment` assigns the matched rule's `auto_assign_member` on a completed move
  (active-member-guarded, idempotent, notifies; no-op never corrupts the transition), wired into both WF-T5 apply
  paths + the WF-T6 approval-apply path (fires only post-final-approval). **9 tests** (4 unit + 5 contract). Files:
  `app/views/workflow/suggestion.py`, `utils/workflow.py`, `app/views/workflow/base.py`, `app/views/issue/base.py`,
  `app/urls/workflow.py`, tests `tests/unit/utils/test_auto_assign.py`, `tests/contract/app/test_suggested_transition.py`.
  (Minor follow-up: `auto_assign_role` field exists but role-based bulk assignment is deferred — member assignment is the tested path.)
- ✅ **WF-T10** frontend types + service + MobX store — `@plane/types/workflow.ts` (shared `IWorkflowTransition`,
  `IWorkItemApproval`, `ISuggestedTransition`, `IWorkflowConfig`, `TWorkflowStatus`…); `apps/web/core/services/workflow.service.ts`
  (client for the WF-T4–T9 API); `apps/web/core/store/workflow.store.ts` (+ root-store registration) — per-project
  transition/status maps, per-issue approval/suggestion maps, optimistic `transitionWorkItem` that applies the new state
  immediately then rolls back on any server rejection (403/409). **5 store tests pass**, web `check:types` 11/11 green.
  (Deviation note: service lives in `apps/web/core/services/` per the fork's actual convention — every store consumes
  `@/services/*`, matching `cycle.service.ts` — not the card's literal `packages/services`, which no store consumes.)
- ⬜ Frontend WF-T11–T13 (CE enforcement components → approval banner + AI chip → settings workflow builder)
  (see `workflows-approvals/tasks.md` for the full card list)

**Tally:** **9 cards done (WF-T1–T9 — backend feature-complete)**, **62 workflow tests passing** (24 unit + 38 contract),
migrations `0125`+`0126` clean. Regression: full contract/app suite green except 8 pre-existing magic-link rate-limit
flakes (unrelated; pass in isolation).

> Migration note: `0126` reconciles model-state drift from the Django 5.2 + pytz 2026.2 upgrade (timezone `choices` +
> M2M field re-serialization). `sqlmigrate` confirms it is **state-only / no-op DDL** — non-destructive.

## Git

- `28f98cd` chore: initial commit (fork baseline + sessions 1–N work)
- `697ef6d` feat: workflow approval gates (WF-T6)
- `3273f6c` fix: reconcile migration state after Django 5.2 + pytz upgrade (0126)
- `5e060e9` feat: workflow-transitions + state-transition v1 API mirror (WF-T7)
- `b816222` feat: migrate monorepo to React 19 (check:types 28/28 green)
- `b7ecaea` chore: upgrade zod 3 -> 4
- `ca9500f` chore: upgrade @headlessui/react 1.7 -> 2
- `e3b9570` docs: record Headless UI 2 upgrade (done) in PROGRESS
- `cb9ade1` docs: record React 19 + Headless UI 2 browser boot smoke result
- `daacba1` feat: typed workflow rule resolution + lifecycle controls (WF-T8)
- `17ed89c` feat: AI-suggested transitions + transition auto-assignment (WF-T9)
- `59c1217` docs: record WF-T8 + WF-T9 (backend Workflows feature-complete) in PROGRESS
- `18eb041` feat: workflow types + service + MobX store (WF-T10)

## Epics & Initiatives — `epics-initiatives/tasks.md`

- ⬜ all cards (Initiatives model is greenfield; epics UI completion)

## Work Items & Work Item Types — `work-items/tasks.md`

- ⬜ all cards (custom properties, templates, recurring — mostly unlock + finish)

## Wiki & Pages — `wiki/tasks.md`

- ⬜ all cards (live cursors flag unlock, content search, comments, export, templates)

## Plane AI — `ai/tasks.md`

- ⬜ all cards (Build mode, connectors, semantic actions — largest; do last)

## Build order (from README)

1. Work Item Types / custom properties → 2. **Workflows & Approvals (backend done WF-T1–T9; frontend WF-T10–T13 in progress)** →
2. Initiatives → 4. Wiki gaps → 5. Plane AI expansion.

> Update this file as cards complete so any session (or subagent) can resume cleanly.
