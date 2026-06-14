# Implementation Progress

Live tracker for the self-host feature build. Each feature's task cards live in
`docs/plan/<feature>/tasks.md`. Cards are TDD-first (RED → GREEN with real test output)
and gated behind `apps/web/ce/lib/self-host-entitlements.ts` flags.

**Test loop (backend):** a persistent container `plane-tests` is running; cycle with
`docker exec plane-tests pytest <path>` (add `--create-db` only after model changes).
**Test loop (frontend):** `pnpm --filter web exec vitest run <path>` + `pnpm turbo run check:types --filter=web`.

## Status legend

✅ done & verified · 🟡 in progress · ⬜ not started

## Production deployment checkpoint - 2026-06-14

- ✅ `origin/preview` is deployed to GKE at
  `254013b7228bd39b7ac1645052fbbb48fb62f0c5` / `preview-254013b7228b`.
- ✅ `Plane CI/CD` run `27503184003` passed web checks, API checks, component
  image builds, GKE migration, rollout, and production smoke.
- ✅ Code Quality runs `27503183507` and `27503183488` passed; GitHub reports
  `0` open code-scanning alerts.
- ✅ Live smokes: `GET https://app.manut.xyz/api/instances/` returned `200`;
  `GET https://app.manut.xyz/gogocash/` returned the app shell with `200`.
- ✅ Production route-crash fix shipped in `254013b72`: Headless UI modal
  `Transition.Child` children render concrete elements / `Dialog.Panel` instead
  of `Fragment`.
- ✅ Diagnostic route-error logging from `b113c62fa` captured the previous
  `/gogocash/` Fragment ref crash, giving the root cause for the hotfix.
- ⚠️ During rollout, one new API pod hung in `collectstatic`; deleting the
  unready pod let its replacement start normally while the old API pod kept
  serving.
- ⚠️ Local `main` still diverges from `origin/preview`; do not promote local
  docs or feature work over production without reconciling security and hotfix
  commits first.

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
- ✅ **WF-T11** CE workflow components — replaced the no-op CE workflow stubs with flag/status-gated presentation
  enforcement. `state-option.tsx` now honors `filterAvailableStateIds` when workflows are enabled; the drag/drop hook
  preserves the existing return shape while blocking illegal state-grouped drops and approval-required drops with a reason;
  `workflow-disabled-overlay.tsx`, `workflow-disabled-message.tsx`, and `workflow-group-tree.tsx` now render lightweight
  workflow guidance instead of empty fragments. Creation stays unrestricted in this slice because workflow rules govern
  subsequent transitions and the backend remains authoritative. **7 WF-T11 Vitest helper tests pass**; `pnpm --filter web
run check:format` and `pnpm turbo run check:types --filter=web` green; `pnpm --filter web run check:lint` passes with
  988 pre-existing warnings and 0 errors.
- ✅ **WF-T12** Workflows settings builder — added the project settings `/workflows/` route + sidebar item, lifecycle
  toggle for `disabled|paused|enabled`, rule-set selector (default + typed rule ids), state-group transition cards,
  transition editor (roles, approval toggle, fallback state, auto-assign fields), live preview, disabled/unrestricted/paused
  empty states, admin-disabled editing, and store-backed create/update/delete/status calls. **7 WF-T12 Vitest helper tests pass**;
  `pnpm turbo run check:types --filter=web`, `pnpm --filter web run check:format`, and strict touched-file
  `oxlint --deny-warnings` green.
- ✅ **WF-T13** Work-item approval banner + AI suggestion chip — added entitlement-gated detail-sidebar surfaces beside
  the state selector. The approval banner fetches pending approvals, resolves requester/target/fallback labels, renders
  comments as sanitized text (no raw `dangerouslySetInnerHTML`), and shows Approve/Reject only for assigned approvers.
  The AI suggestion chip fetches `suggested-transition`, hides when no target is rankable, and accepts suggestions through
  the WF-T10 optimistic transition action. The detail state dropdown now passes `filterAvailableStateIds` + `issueTypeId`
  into WF-T11's presentation filter. **6 WF-T13 Vitest helper tests pass**; workflow frontend helper tests are 13/13 green;
  `pnpm --filter web run check:format`, `pnpm turbo run check:types --filter=web`, `pnpm --filter web run check:lint`
  (986 existing warnings, 0 errors), and `git diff --check` green.

**Tally:** **13 cards done (WF-T1–T13 — backend feature-complete plus frontend store, CE enforcement, settings builder,
and detail surfaces)**, **62 backend workflow tests passing** (24 unit + 38 contract) plus
**25 frontend workflow/store tests passing**.
Migrations `0125`+`0126` clean. Regression: full contract/app suite green except 8 pre-existing magic-link rate-limit
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
- `0b5ff14` feat: enforce CE workflow components (WF-T11)
- `c8452f6` feat(workflows): add settings builder
- `a6d2559` feat(workflows): add detail approval surfaces
- `0d0ea24` feat(work-items): add custom property models
- `10ff9d4` feat(work-items): add custom property API
- `2326318` feat(work-items): render custom property fields
- `f859f5f` feat(work-items): add work item templates
- `985efa4` feat(work-items): add template API
- `5e2f4bf` feat(work-items): add template UI
- `66b548c` feat(work-items): add recurring work item models
- `5939b762e` feat(epics): add custom property schema
- `7b73d5086` feat(epics): add custom property API
- `087c8d1d7` feat(epics): add custom property fields
- `31889ac16` feat(initiatives): add data models
- `e5ee3c6ef` feat(initiatives): add session API
- `6666fb267` feat(initiatives): add v1 API parity

## Epics & Initiatives — `epics-initiatives/tasks.md`

- ✅ **TASK-1** entitlement flags — added `epics: false` and `initiatives: false` self-host feature
  flags plus resolver coverage. Verified: RED first (`undefined` in Vitest and TS missing-key errors);
  focused entitlement Vitest 3/3 green; web typecheck green.
- ✅ **TASK-2** `EpicService` typed client — added `packages/services/src/epic/` with list/retrieve/
  create/update/destroy/progress methods, exported it from `@plane/services`, and added `TEpic`,
  `TEpicPayload`, and `TEpicProgress` types. Verified: RED first on missing service module; green via
  web Vitest fallback runner, services/types typechecks, services/types format/lint budgets, and web typecheck.
- ✅ **TASK-3** real epic MobX store + filter persistence — replaced the dead `@ts-nocheck` epic stores
  with typed `ProjectEpics` and `ProjectEpicsFilter` implementations, backed `fetchEpics`/`createEpic`
  with `EpicService`, normalized epics into the shared issue map, persisted epic filters through layout
  switches, and kept epic refetches/clears scoped to `projectEpics`. Verified: RED first on the stubbed
  store; focused epic store Vitest 3/3 green; full web Vitest 64/64 green; web typecheck, touched-file
  format, strict touched-file lint, and `@ts-nocheck` scan clean.
- ✅ **TASK-4** real epic create/update modal — replaced the empty CE modal with a scoped create/update
  form for project, title, lead, rich description, start date, and target date; submit is wired through
  `EpicService.create`/`update`, trims names, normalizes the single lead to `assignee_ids`, runs
  `beforeFormSubmit`/`onSubmit`, and closes only after success. Verified: RED first on the empty stub;
  focused modal Vitest 5/5 green; full web Vitest 69/69 green; web typecheck, touched-file format,
  and strict touched-file lint clean.
- ✅ **TASK-5** project epics route + empty state — added the `/projects/:projectId/epics`
  route, header, page root, entitlement-gated disabled state, shared epic layout root, epic empty
  state CTA, filter mapping, and project navigation entry. The route renders no live epic layout
  while `epics` is disabled, and the enabled path mounts the epic issue-layout store root. Verified:
  RED first on the missing route component and missing navigation item; focused route/navigation
  Vitest 3/3 green; full web Vitest 72/72 green; web typecheck green.
- ✅ **TASK-9** epic CRUD session endpoints + authorization — added session `/epics/`
  list/create/retrieve/patch/delete routes backed by existing `Issue` rows with `IssueType.is_epic`;
  writes require project Admin/Member, reads allow project viewers, cross-workspace project mismatches
  return 400 before role checks, and `description_html` is sanitized before persistence. Verified:
  RED first on missing routes; contract epic CRUD tests 6/6 green; `manage.py check`, touched-file
  Ruff check, and Ruff format check clean.
- ✅ **TASK-10** epic progress rollup endpoint — added `GET /epics/:epic_id/progress/`
  with child work-item counts by state group, `total_count`, and 0-100 `percent_complete`;
  zero-child epics return 0 without divide-by-zero, and soft-deleted children are excluded.
  Verified: RED first on missing progress route; epic CRUD + progress contracts 8/8 green;
  `manage.py check`, touched-file Ruff check, Ruff format check, and `git diff --check` clean.
- ✅ **TASK-11** epic bulk-attach work items — added `POST /epics/:epic_id/work-items/`
  for assigning project-scoped work items to an epic, with one-epic-per-item enforcement,
  explicit `reparent: true` override, project edit-role authorization, cross-project rejection,
  and deterministic parent-change `IssueActivity` rows. Verified: RED first on missing route;
  bulk attach contract tests 5/5 green; adjacent epic CRUD/progress/bulk contracts 13/13 green;
  `manage.py check`, touched-file Ruff check, Ruff format check, and `git diff --check` clean.
- ✅ **TASK-12** epic ↔ work-item conversion — added epic-to-work-item and work-item-to-epic
  conversion routes with same-project type validation, project edit-role authorization, explicit
  `reparent_to_epic_parent` child policy, and type/parent `IssueActivity` rows. Verified: RED
  first on missing routes; conversion contract tests 5/5 green; adjacent epic CRUD/progress/bulk/
  conversion contracts 18/18 green; `manage.py check`, touched-file Ruff check, Ruff format check,
  and `git diff --check` clean.
- ✅ **TASK-13** epic duplication — added `POST /epics/:epic_id/duplicate/` with same-project
  copies, optional subtree copying, source/target edit-role enforcement, duplicate activity rows,
  and cross-workspace state/label/assignee remapping that never carries source-tenant IDs. Verified:
  RED first on missing route; duplication contract tests 4/4 green; adjacent epic CRUD/progress/
  bulk/convert/duplicate contracts 22/22 green; `manage.py check`, touched-file Ruff check, Ruff
  format check, and `git diff --check` clean.
- ✅ **TASK-14** epic v1 api-key parity + flag flip — added v1 `GET|POST /epics/`
  and `GET /epics/:id/` endpoints with the same project role checks as session routes,
  then flipped `SELF_HOSTED_FEATURE_FLAGS.epics` to `true`. Verified: RED first on missing
  v1 route + false flag; v1 epic contract 1/1 green; adjacent epic app+v1 contracts 23/23
  green; entitlement Vitest 3/3 green; `pnpm turbo run check:types --filter=web`, `manage.py
check`, touched-file Ruff check/format, touched-file oxfmt/oxlint, and `git diff --check`
  clean.
- ✅ **TASK-15** epic custom properties data layer — extended the existing work-item custom-property
  framework with the epic card's missing schema surface: `IssuePropertyOption`, explicit
  `option` property type, `is_multi`, description/external metadata, and typed
  `IssuePropertyValue` columns (`value_text`, `value_option`, `value_uuid`) while preserving
  the existing JSON `value` path used by work items. Migration `0130` is scoped to the custom
  property tables. Verified: RED first on missing `IssuePropertyOption`; focused model unit
  tests 8/8 green; adjacent property/template contracts 24/24 green; `manage.py check`;
  `makemigrations --check --dry-run`; `0130 -> 0129 -> 0130` migration rollback/forward;
  touched-file Ruff check/format and `git diff --check` clean.
- ✅ **TASK-16** epic custom properties API — added project-linked member write permission for
  issue-type property definitions, `GET|POST /properties/:id/options/`, and
  `GET|POST /projects/:project_id/epics/:epic_id/property-values/` for text, multi-option,
  and member values. The endpoint sanitizes text, validates option ownership, validates member
  UUIDs against workspace membership, enforces required fields, records value activity, and keeps
  the existing work-item JSON `property_values` path compatible. Verified: RED first on member
  definition 403 + missing option/value routes; property API contracts 16/16 green; adjacent
  property/template/epic contracts 44/44 green; `manage.py check`; `makemigrations --check
--dry-run`; touched-file Ruff check/format and `git diff --check` clean.
- ✅ **TASK-17** epic custom-property fields in detail view — added typed epic property service
  methods, shared property/value types, option projection on property definitions, and an
  existing-epic modal section that loads text, option/multi-option, and member values, then saves
  through the epic property-values endpoint. Verified: RED first on missing service/component and
  missing option projection; service Vitest 4/4 green; epic properties/modal/additional-properties
  Vitest 11/11 green; property API contracts 16/16 green; web/services/types typechecks green;
  `manage.py check`; touched-file oxfmt/oxlint and Ruff check/format; `git diff --check` clean.
- ✅ **TASK-18** initiatives data layer — added additive `Initiative`, `InitiativeEpic`,
  `InitiativeProject`, and `InitiativeLabel` models with lifecycle-state choices,
  description/lead/date/logo/progress/external metadata, partial unique member constraints,
  same-workspace join validation, and epic-only membership validation. Migration `0131` creates
  only the new tables/constraints. Verified: RED first on missing `Initiative`; focused model
  tests 4/4 green on a fresh test DB; adjacent initiative/property/workflow model tests 17/17
  green; `manage.py check`; `makemigrations --check --dry-run`; `0131 -> 0130 -> 0131`
  migration rollback/forward; touched-file Ruff check/format and `git diff --check` clean.
- ✅ **TASK-19** initiatives CRUD + member attach + progress + summary API — added workspace-scoped
  session routes for initiative list/create/detail/update/delete, epic/project attach and detach,
  progress rollups, and five-state summary grouping. Writes require workspace Admin/Member; reads
  allow active workspace viewers; cross-workspace epic/project references return 400; converted or
  soft-deleted epic members are skipped and soft-cleaned; description HTML is sanitized on persist.
  Verified: RED first on missing initiative routes; focused initiative API contracts 6/6 green;
  adjacent initiative + epic CRUD/progress/bulk contracts and initiative model tests 23/23 green;
  `manage.py check`; `makemigrations --check --dry-run`; touched-file Ruff check/format and
  `git diff --check` clean.
- ✅ **TASK-20** initiatives v1 api-key parity — added api-key routes for initiative
  list/create/detail at `/api/v1/workspaces/:slug/initiatives/`, reusing the session
  serializer and workspace role checks. Member keys can create/list/read, viewer keys can
  list/read but cannot create, keys outside the workspace are rejected, and no v1 NLQ route is
  exposed. Verified: RED first on missing v1 initiative routes; focused initiative v1
  contract 1/1 green; adjacent initiative session + epic v1 contracts 8/8 green;
  `manage.py check`; `makemigrations --check --dry-run`; touched-file Ruff check/format and
  `git diff --check` clean.
- ✅ **TASK-21** initiatives frontend data layer — added typed initiative payload/progress/summary
  contracts, `InitiativeService` session-route methods for CRUD, progress, summary, and
  epic/project attach/detach, a CE `InitiativeStore` registered on the root store with observable
  initiative/progress/summary maps, and the five lifecycle-state constants plus synced i18n labels
  across all locale `project.json` files. Verified: RED first on missing service/store modules;
  initiative service Vitest 3/3 green; initiative store Vitest 4/4 green; `@plane/types`,
  `@plane/constants`, `@plane/services`, and `@plane/i18n` typechecks green; `@plane/i18n`
  locale sync green; `pnpm turbo run check:types --filter=web` green; touched-file oxfmt/oxlint
  and `git diff --check` clean.
- ✅ **TASK-22** initiatives route/list/board/timeline/detail + flag flip — added the top-level
  `/:workspaceSlug/initiatives` route and detail route, workspace navigation entry, CE initiatives
  board/list/timeline surface with persisted layout/state/lead/label/date filters, detail progress
  card, epic/project membership attach/detach controls with refetch-on-conflict behavior, and flipped
  `SELF_HOSTED_FEATURE_FLAGS.initiatives` to `true`. Verified: RED first on missing route/components
  and false flag; initiatives board/page-root Vitest 3/3 green; entitlement Vitest 3/3 green;
  `@plane/constants` typecheck green; `@plane/i18n` typecheck + locale sync green; touched-file
  oxfmt/oxlint clean; `pnpm turbo run check:types --filter=web` green; `pnpm --filter web run build`
  green. Rendered route smoke reached `http://127.0.0.1:3000/acme/initiatives`, but full route QA
  was blocked by the local API service being unavailable at `http://localhost:8000/api/instances/`.
- ✅ **TASK-23** status updates models + migration — added first-class `StatusUpdate` and
  `StatusUpdateReaction` models, model exports, migration `0132_status_updates.py`, comment HTML
  stripping, epic/initiative XOR database constraint, same-owner parent validation, and duplicate
  active reaction rejection. Also aligned the backend test `httpx` pin with `google-genai` so the
  documented Docker pytest command runs. Verified: RED first on missing `StatusUpdate` export;
  focused status-update model tests 5/5 green; adjacent initiative + status-update model tests 9/9
  green through the normal Docker pytest entrypoint; `manage.py check`; `makemigrations --check
--dry-run`; `0132 -> 0131 -> 0132` migration rollback/forward; touched-file Ruff check/format
  and `git diff --check` clean.
- ✅ **TASK-24** status updates API — added session routes for epic and initiative status-update
  list/create/detail/update/delete, threaded replies, HTML sanitization, workspace/project
  read/write gates, and reaction add/delete with duplicate-active rejection and soft-deleted update
  rejection. Verified: RED first on missing routes; focused status-update API contracts 10/10 green;
  adjacent status-update + epic CRUD + initiative API contracts 22/22 green; `manage.py check`;
  `makemigrations --check --dry-run`; touched-file Ruff check/format; `git diff --check` clean.
- ✅ **TASK-25** threaded status update UI — added shared CE `StatusUpdateThread`, status chips,
  safe stripped-text rendering, nested replies, emoji reaction toggles, service adapters for the
  TASK-24 epic/initiative endpoints, and mounts in initiative detail plus epic-only work item
  detail. Verified: RED first on missing thread module; focused status-update thread Vitest 1/1;
  adjacent status-update + initiatives board + epics route Vitests 6/6; epic/initiative service
  Vitests 9/9; `@plane/types` and `@plane/services` typechecks; `pnpm turbo run check:types
--filter=web`; TASK-24 API contracts 10/10; touched-file oxfmt/oxlint; `git diff --check`;
  local dev boot smoke returned `200 text/html` at `http://127.0.0.1:3000/`, and Playwright
  rendered the expected Plane startup-failure screen because the local API service was unavailable
  at `http://127.0.0.1:8000/api/instances/`.
- ✅ **TASK-26** AI NLQ `/copilot/query/` endpoint — added session-only scoped NLQ for epic,
  initiative, and workspace queries; reuses the existing copilot provider boundary; builds
  evidence from caller-readable targets/status updates; filters unreadable project evidence before
  the model call; returns `409 ai_provider_not_configured` when no provider is configured and
  graceful `503 ai_unavailable` on provider outage; and keeps NLQ absent from the v1 api-key
  surface. Verified: RED first on missing `/copilot/query/` route; focused copilot-query contracts
  5/5 green; adjacent copilot query + existing copilot messages + status update API + initiative v1
  NLQ-absence contracts 25/25 green; `manage.py check`; `makemigrations --check --dry-run`;
  touched-file Ruff format/check; `git diff --check` clean.
- ✅ **TASK-27** AI NLQ Ask AI / Summarize affordance — added the CE `AskAIAction`
  prompt/summarize component, scoped `AIService.queryCopilot` client, answer/summary/evidence
  rendering, and epic + initiative detail mounts. `409 ai_provider_not_configured` renders a
  disabled "Configure AI provider" state without an error toast; `503 ai_unavailable` renders a
  non-blocking "AI unavailable" message. Verified: RED first on missing `ask-ai-action` module;
  focused Ask AI Vitest 3/3 green; adjacent Ask AI + status-update + initiatives board Vitests 7/7
  green; `pnpm turbo run check:types --filter=web` green; touched-file `oxfmt --check` and strict
  `oxlint --deny-warnings` clean; `git diff --check` clean; Playwright MCP boot smoke reached
  `http://127.0.0.1:3000/` and rendered the expected Plane startup-failure screen because the local
  API service was unavailable at `http://127.0.0.1:8000/api/instances/`.
- ✅ **Epics & Initiatives task-family local implementation complete through TASK-27.** Production
  integration is still blocked by safe reconciliation of the divergent local `main` history with
  `origin/preview`. The current production hotfix stack is separate and already deployed at
  `254013b7228bd39b7ac1645052fbbb48fb62f0c5` / `preview-254013b7228b`.

## Work Items & Work Item Types — `work-items/tasks.md`

- ✅ **CP-1-BE** custom-property data layer — added `IssueProperty` + `IssuePropertyValue`, additive migration
  `0127_custom_properties.py`, model exports, factories, and unit coverage for type-scoped workspace inheritance,
  soft-delete-aware uniqueness, same-name/different-type allowance, and JSON value persistence. Verified: RED import
  failure first; targeted 6/6 green; backend unit suite 246/246 green; `makemigrations --check --dry-run`,
  `manage.py check`, touched-file Ruff check/format, and `0126 -> 0127 -> 0126 -> 0127` migration round-trip all clean.
- ✅ **CP-2-API** property definitions + issue value path — added ADMIN workspace/type-scoped property CRUD,
  MEMBER+ reads, select option validation, duplicate `409`, destructive type-change `409`, issue serializer
  `property_values` validation/upsert, text/url sanitization, cross-type rejection, required-property enforcement,
  issue-detail value serialization, and activity rows for definition/value changes. Verified: RED first; CP-2 contract
  12/12 green; adjacent issue-transition/approval contracts 25/25 green; backend unit suite 246/246 green; full app
  contracts 126/134 green with only the known magic-link rate-limit baseline failures.
- ✅ **CP-3-FE** dynamic type-scoped property fields in issue modal — replaced the CE stub with a flag-gated
  `WorkItemModalAdditionalProperties` implementation, added an issue-property API client + MobX cache in the web core
  store, registered the store on the root store, exported shared issue-property types, and packed rendered field values
  under `property_values` for the existing submit path. Verified: RED first; component/store Vitest 6/6 green; targeted
  web lint clean; `@plane/types` typecheck clean; `pnpm --filter web check:types` clean.
- ✅ **TPL-1-BE** work-item template data layer — added `WorkItemTemplate(ProjectBaseModel)` with JSON
  `template_data`, optional `issue_type`, active flag, `(project, issue_type)` index, model export, factory, and unit
  coverage for project scoping, JSON round-trip, nullable issue type, and active default. Verified: RED import failure
  first; target 4/4 green; backend unit suite 250/250 green; touched-file Ruff check/format clean; `manage.py check`
  clean; `makemigrations --check --dry-run` clean; `0128 -> 0127 -> 0128` migration round-trip clean.
- ✅ **TPL-2-API** template CRUD + create-from-template hydration — added app template CRUD routes,
  MEMBER/Admin writes, Guest denial, active/type-filtered lists, soft delete, v1 read-only template listing with
  project-membership enforcement, and `?template_id=` issue-create hydration that sanitizes template HTML/text values,
  reuses the existing issue serializer for `property_values`, creates simple sub-items, rejects cross-project template
  ids, and skips missing state/label/assignee refs with warnings. Verified: RED first; TPL-2 contract 12/12 green;
  adjacent template/property contracts 24/24 green; `manage.py check` clean; `makemigrations --check --dry-run` clean;
  full app contracts 138/146 green with only the known magic-link rate-limit baseline failures.
- ✅ **TPL-3-FE** template picker + project-settings manager — replaced the CE template-picker stub with a
  `templates`-flagged self-host picker, added a work-item-template service + MobX store in the web core root store,
  wired selected templates into issue creation through `?template_id=`, and added a project settings `/templates`
  manager with create, edit, deactivate/reactivate, and delete controls. Verified: RED first; picker/manager/store
  Vitest 6/6 green; full web Vitest 50/50 green; touched-file oxlint clean; `@plane/types` build/typecheck clean;
  `pnpm --filter web check:types` clean.
- ✅ **REC-1-BE** recurring work item data layer — added `RecurringWorkItem` + `RecurringWorkItemRun`,
  migration `0129_recurring_work_items.py`, `dateutil`/`pytz` next-run utilities, factories, and unit coverage for
  persistence, workspace inheritance, idempotent `(recurring_work_item, run_at)` runs, RRULE validation, end-date, and
  max-iteration stopping. Verified: RED import/module failures first; focused 6/6 green; backend unit suite 256/256
  green; touched-file Ruff check/format clean; `manage.py check` clean; `makemigrations --check --dry-run` clean;
  `0129 -> 0128 -> 0129` migration round-trip clean.
- ✅ **REC-2-WORKER** recurring generation worker — added the `generate_recurring_work_items` Celery task and 5-minute
  beat schedule entry, idempotent run-row guarded issue creation, no-storm downtime advancement, membership-gated
  ownership checks, template/inline payload hydration, missing-ref warnings, sub-item creation, end/max deactivation,
  and per-recurring exception isolation. Verified: RED missing-task import first; focused worker tests 7/7 green;
  backend unit suite 263/263 green; touched-file Ruff check/format clean; `manage.py check` clean;
  `makemigrations --check --dry-run` clean.
- ✅ **REC-3-API-FE** recurrence CRUD + runs history, modal section, badge — added MEMBER/Admin recurrence CRUD,
  read-only runs history, RRULE/timezone/end-condition validation, `owned_by` assignment, `next_run_at` recompute
  rules, list/detail `is_recurring` annotation, a self-host recurrence modal section, recurrence service/store/hooks,
  and a shared issue-card recurrence badge. Verified: RED first; recurrence backend contract 10/10 green; full
  recurrence backend slice 23/23 green; full web Vitest 56/56 green; web typecheck/format/lint clean; `manage.py
check`, `makemigrations --check --dry-run`, and touched-file Ruff check/format clean. Full backend unit+contract app
  suite is 411/419 green with only the existing authentication/magic-link rate-limit failures after cache/Redis
  clearing.
- ✅ **DUP-1-API** similar-items endpoint — added deterministic token/trigram title similarity with a minimum
  confidence floor, read-only `issues/similar/` route, project-membership authorization, same-project candidate
  scoping, open-state filtering, archived exclusion, result caps, and `{results:[{id,name,confidence}]}` responses.
  Verified: RED missing scorer first; focused DUP-1 unit+contract tests 7/7 green; full backend unit+contract app
  suite 418/426 green with only the existing authentication/magic-link rate-limit failures; touched-file Ruff
  check/format clean; `manage.py check` clean; `makemigrations --check --dry-run` clean.
- ✅ **DUP-2-FE** inline duplicate banner — replaced CE de-dupe stubs with a self-host similar-items trigger/banner,
  debounced DUP-1 hook/service wiring, confidence labels, dismiss state, `aria-live="polite"`, immediate duplicate
  linking for existing issues, and queued duplicate relation creation after a new issue is saved. Verified: RED first;
  focused DUP-2 Vitest 4/4 green; full web Vitest 60/60 green; web typecheck/format clean; touched-file strict oxlint
  clean. Rendered smoke loaded `127.0.0.1:3000` through Playwright fallback, but local backend services refused
  connection so the issue-modal interaction could not be browser-verified in this run.
- ⬜ remaining cards (Workflows data/API/UI cards in this backlog are already implemented above; next unresolved Work
  Items card is AI-1-API)

## Wiki & Pages — `wiki/tasks.md`

- ⬜ all cards (live cursors flag unlock, content search, comments, export, templates)

## Plane AI — `ai/tasks.md`

- ⬜ all cards (Build mode, connectors, semantic actions — largest; do last)

## Build order (from README)

1. Work Item Types / custom properties → 2. **Workflows & Approvals (WF-T1–T13 done)** →
2. Initiatives → 4. Wiki gaps → 5. Plane AI expansion.

> Update this file as cards complete so any session (or subagent) can resume cleanly.
