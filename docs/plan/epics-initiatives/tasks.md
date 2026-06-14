# Epics & Initiatives — Tasks (Claude Code subagent cards)

These are **self-contained** task cards for execution by Claude Code subagents (one task per subagent, dispatched via the Agent/Workflow tooling). **Each executing subagent has NO memory of this planning conversation or of the PRD/epics docs** — every card therefore repeats all file paths, fork patterns, and context inline. Do not assume a subagent has read anything else.

Source-of-truth references (a subagent MAY open these for deeper context but must not depend on them being loaded):
- PRD: `docs/prd-epics-initiatives-2026-06-07.md`
- Epics: `docs/plan/epics-initiatives/epics.md`

**How to run these:**
- Assign **one task per subagent**. Tasks within the same parallel batch that touch overlapping files MUST run in **separate git worktrees** (marked `Worktree isolation: yes`) and be merged in dependency order.
- Backend = Django/DRF in `apps/api/plane/{db,app,api}`. Frontend = React Router 7 + MobX in `apps/web/{core,ce}`. Shared code in `packages/{types,services,ui,constants,i18n}`.
- TDD-first (RED → GREEN → REFACTOR): write the named failing test first, watch it fail for the right reason, then write the minimum code to pass, then run the full relevant suite.
- All new reads/writes are workspace/project-scoped and permission-checked **server-side** (reuse `allow_permission`/`ROLE` and `WorkspaceViewerPermission` — never ad-hoc checks).
- New schema is **additive only**: new tables/columns, forward + reverse migration, never edit an applied migration.
- Feature gating uses the existing flags in `apps/web/ce/lib/self-host-entitlements.ts` (`epics`, `initiatives`). No new gating mechanism.
- Stable ID prefixes for cross-reference: `INIT` (initiatives), `EPIC` (epics), `WIT` (work-item-types / work-items), `WF` (workflows/approvals), `WIKI` (wiki).

**Verified fork facts (true as of fork root, cite these in cards):**
- API tests live under `apps/api/plane/tests/{unit,contract,smoke}/`. `pytest.ini` defines markers `unit`, `contract`, `smoke`, `slow`; runs with `--reuse-db --nomigrations --strict-markers`. Contract tests use `@pytest.mark.contract` + `@pytest.mark.django_db`, fixtures `session_client` and `create_user` (see `apps/api/plane/tests/contract/app/test_workspace_app.py`).
- Test stack runner: `docker-compose-test.yml` at **repo root**, service `api-tests`.
- App (session) URLs in `apps/api/plane/app/urls/` (e.g. `cycle.py`); api-key v1 URLs in `apps/api/plane/api/urls/` (e.g. `work_item.py`). URL scoping pattern: `workspaces/<str:slug>/projects/<uuid:project_id>/<resource>/` and `.../<uuid:pk>/` (see `apps/api/plane/app/urls/cycle.py`).
- Workspace-aggregation pattern: `WorkspaceCyclesEndpoint` in `apps/api/plane/app/views/workspace/cycle.py` — `permission_classes = [WorkspaceViewerPermission]`, annotate-based rollup with `Count(... filter=Q(...deleted_at__isnull=True...))`.
- Permission decorator usage: `from plane.app.permissions import ROLE, allow_permission` then `@allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="PROJECT")` / `level="WORKSPACE"` (see `apps/api/plane/app/views/copilot.py:17,64`).
- Copilot LLM helpers: `apps/api/plane/app/views/copilot.py` exposes `COPILOT_MODES`, `is_llm_configured`, `get_llm_config`, `get_vertex_ai_config`, classes `CopilotMessagesEndpoint`/`CopilotConversationsEndpoint`.
- Web tests: vitest, run via `pnpm --filter web exec vitest run <path>`. Existing test: `apps/web/ce/lib/self-host-entitlements.test.ts` (imports `SELF_HOSTED_FEATURE_FLAGS`, `isSelfHostedFeatureEnabled`).
- Epic modal stub: `apps/web/ce/components/epics/epic-modal/modal.tsx` exports `CreateUpdateEpicModal(_props: EpicModalProps)` returning `<></>`; `EpicModalProps` already typed (data/isOpen/onClose/beforeFormSubmit/onSubmit/fetchIssueDetails/primaryButtonText/isProjectSelectionDisabled).
- Epic store stub: `apps/web/ce/store/issue/epic/issue.store.ts` (`@ts-nocheck`, "this class will never be used"); filter store `apps/web/ce/store/issue/epic/filter.store.ts`; timeline store `apps/web/ce/store/timeline/base-timeline.store.ts`.
- `packages/services/src/` already has `cycle/`, `issue/`, `module/`, `project/` service dirs + `index.ts` — follow these conventions for `EpicService`/`InitiativeService`.
- Epic-ness = `Issue` with `IssueType(is_epic=True)`; bundling = `Issue.parent`. Models: `apps/api/plane/db/models/issue.py` (`parent` at ~114-120), `apps/api/plane/db/models/issue_type.py` (`is_epic` at ~19).
- Reserved slug `"initiatives"` already in `RESTRICTED_WORKSPACE_SLUGS` (`apps/api/plane/utils/constants.py:47`) — no constants change for initiatives.
- Threading/reaction reuse models: `IssueComment` (self-FK `parent` `related_name="parent_issue_comment"`, `comment_html`/`comment_stripped`/`comment_json`), `IssueReaction`/`CommentReaction` (emoji `reaction`, unique-when-not-deleted).

---

## TASK-1 — Add `epics` + `initiatives` entitlement flags (shipped OFF)

- **Implements**: EPIC-1, EPIC-4 (flag scaffolding). **Depends on**: none. **Risk tier**: R2. **Worktree isolation**: no.
- **Context**: The self-host instance gates paid CE features through `apps/web/ce/lib/self-host-entitlements.ts`, which exports a `SELF_HOSTED_FEATURE_FLAGS` const object and an `isSelfHostedFeatureEnabled(feature)` helper; the `TSelfHostedFeatureFlag` type is `keyof typeof SELF_HOSTED_FEATURE_FLAGS`. Epics and Initiatives need two new flag keys, both shipped `false` so the inert UI/route work in later tasks stays hidden until its backend is live. This is the foundation flag wiring; later tasks flip the values.
- **Files**: modify `apps/web/ce/lib/self-host-entitlements.ts`; modify `apps/web/ce/lib/self-host-entitlements.test.ts`.
- **TDD — failing test first**: in `apps/web/ce/lib/self-host-entitlements.test.ts` add `it("registers epics and initiatives feature flags defaulting to false")` asserting `SELF_HOSTED_FEATURE_FLAGS.epics === false`, `SELF_HOSTED_FEATURE_FLAGS.initiatives === false`, `isSelfHostedFeatureEnabled("epics") === false`, and `isSelfHostedFeatureEnabled("initiatives") === false`. It must FAIL because the keys do not yet exist (type/runtime error), not a typo.
- **Implementation outline**: Add `epics: false,` and `initiatives: false,` keys to the `SELF_HOSTED_FEATURE_FLAGS` object literal (keep the existing alpha-ordered style). `TSelfHostedFeatureFlag` picks them up automatically via `keyof typeof`. Do not change `isSelfHostedFeatureEnabled`.
- **Acceptance criteria**:
  - **Given** the entitlements module, **When** `isSelfHostedFeatureEnabled("epics")` is called, **Then** it returns `false`; same for `"initiatives"`.
  - **Given** TypeScript strict checking, **When** the test passes `"epics"`/`"initiatives"` to `isSelfHostedFeatureEnabled`, **Then** they are accepted as valid `TSelfHostedFeatureFlag` members (compiles).
  - **Edge case**: existing flag keys (e.g. `ai_copilot`) remain unchanged and the existing tests still pass.
- **Verify**: `pnpm --filter web exec vitest run ce/lib/self-host-entitlements.test.ts` ; `pnpm turbo run check:types --filter=web`.
- **Done when**: both new keys present and `false`, new + existing vitest cases green, web type check passes.

---

## TASK-2 — `EpicService` typed client in `packages/services`

- **Implements**: EPIC-1. **Depends on**: none (consumes EPIC-2 endpoint contract, but the contract is fixed in this card). **Risk tier**: R2. **Worktree isolation**: no.
- **Context**: The epic MobX store needs a real service to call the (TASK-9..13) session endpoints. `packages/services/src/` already contains service dirs (`cycle/`, `issue/`, `project/`) + a barrel `index.ts`; follow those conventions (class extending the shared `APIService`, methods returning typed promises). The endpoints this service targets are: `GET|POST /api/workspaces/<slug>/projects/<project_id>/epics/`, `GET|PATCH|DELETE .../epics/<pk>/`, `GET .../epics/<epic_id>/progress/`. Because the `epics` flag stays `false` in TASK-1, this service can ship and be unit-tested in isolation before the backend exists.
- **Files**: create `packages/services/src/epic/epic.service.ts` and `packages/services/src/epic/index.ts`; modify `packages/services/src/index.ts` (export new module); create test `packages/services/src/epic/epic.service.test.ts`; add epic payload types in `packages/types` (create `packages/types/src/epic.d.ts` or extend the existing types barrel — inspect `packages/types/src/index.ts` first).
- **TDD — failing test first**: `packages/services/src/epic/epic.service.test.ts` (vitest) — mock the HTTP layer (axios/`APIService` base) and assert: `list(workspaceSlug, projectId)` issues `GET /api/workspaces/:slug/projects/:projectId/epics/`; `create(...)` issues `POST` to the same; `getProgress(slug, projectId, epicId)` hits `.../epics/:epicId/progress/`. Tests FAIL because the file/methods don't exist.
- **Implementation outline**: Read an existing service (`packages/services/src/cycle/`) for the exact base-class import and method style. Define `EpicService` with `list`, `retrieve`, `create`, `update`, `destroy`, `getProgress`. Type payloads off existing `TIssue` from `@plane/types` (epics are Issues) plus an `TEpicProgress` type (counts by state group + percent). Export from the package barrel.
- **Acceptance criteria**:
  - **Given** an `EpicService` instance, **When** `list("ws","proj")` is called, **Then** it requests `GET /api/workspaces/ws/projects/proj/epics/` and resolves the typed list.
  - **Given** `getProgress`, **When** called, **Then** it requests the `.../progress/` path and returns a typed `{ percent_complete, counts_by_group }` shape.
  - **Edge case**: methods accept the workspace slug + project id and never hardcode a tenant.
- **Verify**: `pnpm --filter @plane/services exec vitest run src/epic/epic.service.test.ts` (confirm the package name in `packages/services/package.json`; fall back to `pnpm --filter web exec vitest run` if services has no vitest script) ; `pnpm turbo run check:types --filter=@plane/services`.
- **Done when**: service methods map to the documented paths, tests green, types exported and type-check clean.

---

## TASK-3 — Real epic MobX store + filter store (remove `@ts-nocheck`)

- **Implements**: EPIC-1. **Depends on**: TASK-2 (`EpicService`). **Risk tier**: R2. **Worktree isolation**: yes (touches `apps/web/ce/store/issue/epic/*` concurrently with TASK-4/5).
- **Context**: The epic issue store at `apps/web/ce/store/issue/epic/issue.store.ts` is a dead stub (`@ts-nocheck`, comment "this class will never be used"). The filter store `apps/web/ce/store/issue/epic/filter.store.ts` must persist filters across layout switches (list ↔ kanban ↔ gantt). Mirror the existing issue store pattern (inspect a sibling such as `apps/web/ce/store/issue/project-issues/` or `cycle/` under `apps/web/ce/store/issue/` for the MobX shape: observable maps, actions, computed selectors). The store is backed by `EpicService` (TASK-2). Flag `epics` is `false`, so the store compiles/tests in isolation.
- **Files**: rewrite `apps/web/ce/store/issue/epic/issue.store.ts`; modify `apps/web/ce/store/issue/epic/filter.store.ts`; create `apps/web/ce/store/issue/epic/issue.store.test.ts`.
- **TDD — failing test first**: `apps/web/ce/store/issue/epic/issue.store.test.ts` (vitest) — assert (a) `fetchEpics(slug, projectId)` populates the observable map by calling a mocked `EpicService.list`; (b) `createEpic` adds to the map; (c) the filter store retains an applied filter object across a simulated `setLayout("kanban")` call. Tests FAIL because the store is a stub.
- **Implementation outline**: Remove `@ts-nocheck` and the dead-class comment. Implement a MobX store class mirroring a sibling issue store: `makeObservable` with an observable `Map<epicId, TIssue>`, `runInAction` updates, actions wrapping `EpicService`. Implement filter persistence in `filter.store.ts` keyed by project so switching layout does not clear filters (follow the existing filter-store persistence approach used by other layouts).
- **Acceptance criteria**:
  - **Given** the epic store, **When** TypeScript is checked, **Then** there is **no** `@ts-nocheck` and it compiles under strict typing.
  - **Given** a filter applied in list layout, **When** layout switches to kanban, **Then** the filter store still returns the same filter (persisted).
  - **Edge case**: `fetchEpics` on an empty project yields an empty map without throwing.
- **Verify**: `pnpm --filter web exec vitest run ce/store/issue/epic/issue.store.test.ts` ; `pnpm turbo run check:types --filter=web`.
- **Done when**: `@ts-nocheck` gone, store + filter persistence implemented and tested green, web type check passes.

---

## TASK-4 — Real epic create/update modal

- **Implements**: EPIC-1. **Depends on**: TASK-2 (`EpicService`), TASK-3 (store). **Risk tier**: R2. **Worktree isolation**: yes (shares `apps/web/ce/components/epics/*` with TASK-5).
- **Context**: `apps/web/ce/components/epics/epic-modal/modal.tsx` currently exports `CreateUpdateEpicModal(_props: EpicModalProps)` returning `<></>`. `EpicModalProps` is already typed (`data`, `isOpen`, `onClose`, `beforeFormSubmit`, `onSubmit`, `fetchIssueDetails`, `primaryButtonText`, `isProjectSelectionDisabled`). Build the real modal on the **existing issue-create form components** (find them under `apps/web/core/components/issues/` — do not scaffold a new form) with fields: project selector honoring `isProjectSelectionDisabled`, name, lead (assignee), description editor, start date, target date. On submit, call `EpicService.create`/`update` and `onSubmit(res)`; close on success. Do NOT add custom-property fields (that is TASK-15) or status-update/NLQ affordances (TASK-19/TASK-23).
- **Files**: rewrite `apps/web/ce/components/epics/epic-modal/modal.tsx`; create `apps/web/ce/components/epics/epic-modal/modal.test.tsx`.
- **TDD — failing test first**: `apps/web/ce/components/epics/epic-modal/modal.test.tsx` (vitest + Testing Library) — `it("renders name, lead, description, start/target fields and submits via EpicService")`: render with `isOpen`, fill fields, click submit, assert mocked `EpicService.create` called with the typed payload and `onClose` fired on success. FAILS because the stub renders `<></>`.
- **Implementation outline**: Reuse the issue-create form building blocks (project selector, assignee dropdown, rich-text description editor, date pickers) already present in `apps/web/core/components/issues/`. Wire form state to submit through the TASK-3 store / TASK-2 service. Honor `isProjectSelectionDisabled`. Keep description as rich text — note the HTML is sanitized **server-side** on persist (TASK-9), so the frontend must not treat it as pre-sanitized.
- **Acceptance criteria**:
  - **Given** the modal open, **When** a member fills name/lead/description/start/target and submits, **Then** `EpicService.create` is called with the payload and the modal closes on success.
  - **Given** `isProjectSelectionDisabled` is true, **When** the modal renders, **Then** the project selector is disabled/hidden.
  - **Edge case**: submitting with an empty name surfaces a validation error and does not call the service.
- **Verify**: `pnpm --filter web exec vitest run ce/components/epics/epic-modal/modal.test.tsx` ; `pnpm turbo run check:types --filter=web`.
- **Done when**: no `<></>` stub, fields render + submit wired, tests green, type check passes.

---

## TASK-5 — Project epics route + empty state (entitlement-gated)

- **Implements**: EPIC-1. **Depends on**: TASK-1 (flag), TASK-3 (store), TASK-4 (modal). **Risk tier**: R2. **Worktree isolation**: yes.
- **Context**: There is no route mounting epics in a project. Add `apps/web/app/(all)/[workspaceSlug]/(projects)/projects/[projectId]/epics/` mounting the existing list/kanban/gantt layouts via the timeline store (`apps/web/ce/store/timeline/base-timeline.store.ts`) — **reuse** the layout components, do not fork them. Epic empty-state assets exist at `apps/web/app/assets/empty-state/epics`. When the `epics` entitlement flag (TASK-1, currently `false`) is off, render the empty-state with an "Enable epics in project settings" CTA and request **no** live epic data.
- **Files**: create route files under `apps/web/app/(all)/[workspaceSlug]/(projects)/projects/[projectId]/epics/` (page + layout wiring; inspect a sibling route such as the project `cycles` route for the exact React Router 7 file conventions in this repo); create `apps/web/ce/components/epics/epics-route.test.tsx` (or co-located test) for the gating logic.
- **TDD — failing test first**: gating test — `it("renders the enable-epics empty state and fetches no data when the epics flag is false")`: render the route container with `isSelfHostedFeatureEnabled` mocked to return `false` for `"epics"`, assert the empty-state CTA renders and the store's `fetchEpics` is NOT called. FAILS because the route/component doesn't exist.
- **Implementation outline**: Inspect the existing project `cycles` route to copy the route segment + layout-mount conventions. Mount list/kanban/gantt via `base-timeline.store.ts`. Gate live-data fetch behind `isSelfHostedFeatureEnabled("epics")`; when off, render the `empty-state/epics` asset + CTA.
- **Acceptance criteria**:
  - **Given** `epics` flag `false`, **When** a user opens the route, **Then** the "Enable epics in project settings" empty-state renders and no epic data is requested.
  - **Given** `epics` flag `true` (simulated), **When** the route mounts, **Then** the list/kanban/gantt layouts render via the timeline store.
  - **Edge case**: a filter applied in list persists when switching to kanban (delegates to TASK-3 filter store).
- **Verify**: `pnpm --filter web exec vitest run ce/components/epics/epics-route.test.tsx` ; `pnpm turbo run check:types --filter=web` ; `pnpm --filter web run build` (route compiles).
- **Done when**: route exists, gated empty-state works, layouts mount when enabled, tests + type check + build green.

---

## TASK-9 — Epic CRUD session endpoints + authorization

- **Implements**: EPIC-2. **Depends on**: none (backend foundation). **Risk tier**: R1. **Worktree isolation**: yes (shares `apps/api/plane/app/{urls,views}` with TASK-10..13).
- **Context**: Epics are `Issue` rows whose `issue_type` is an `IssueType(is_epic=True)` (`apps/api/plane/db/models/issue_type.py:~19`); bundling is `Issue.parent` (`apps/api/plane/db/models/issue.py:~114`). There is no epic table — do not create one. Add session endpoints scoped by `slug` + `project_id`, mirroring `apps/api/plane/app/urls/cycle.py` URL shape and the `CycleViewSet` view style. Write requires project edit role; read requires project viewer. Reuse `from plane.app.permissions import ROLE, allow_permission` with `@allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="PROJECT")` for writes and a viewer-level decorator for reads. Sanitize `description_html` on persist (`strip_tags` for `_stripped`, server-side HTML sanitize before save) like `IssueComment`.
- **Files**: create `apps/api/plane/app/urls/epic.py`; create view(s) in `apps/api/plane/app/views/epic.py` (or a new `apps/api/plane/app/views/epic/` package — match the existing views package layout); wire the urlconf into `apps/api/plane/app/urls/__init__.py`; create serializer in `apps/api/plane/app/serializers/epic.py`; create test `apps/api/plane/tests/contract/app/test_epic_crud.py`.
- **TDD — failing test first**: `apps/api/plane/tests/contract/app/test_epic_crud.py` with `@pytest.mark.contract` + `@pytest.mark.django_db`, fixtures `session_client`, `create_user`:
  - `test_create_epic_as_project_member_returns_201` (POST creates an Issue of an `is_epic` type).
  - `test_list_epics_filters_to_is_epic_type` (a non-epic Issue is excluded).
  - `test_create_epic_as_viewer_returns_403`.
  - `test_create_epic_as_non_member_returns_403`.
  - `test_epic_endpoint_cross_workspace_returns_400`.
  All FAIL initially (404/no route).
- **Implementation outline**: Copy the `cycle.py` urlpatterns shape for `GET|POST /api/workspaces/<slug>/projects/<project_id>/epics/` and `GET|PATCH|DELETE .../epics/<pk>/`. View filters `Issue.objects.filter(workspace__slug=slug, project_id=project_id, type__is_epic=True, deleted_at__isnull=True)`. Apply `allow_permission` per method. Serializer extends the issue serializer conventions. Sanitize description HTML before save.
- **Acceptance criteria**:
  - **Given** a project member, **When** they POST an epic, **Then** an `is_epic` Issue is created (201) and listing returns only `is_epic` rows.
  - **Given** a project viewer, **When** they POST/PATCH/DELETE, **Then** 403; **Given** a non-member, **Then** 403; **Given** a cross-workspace `slug`/`project_id` mismatch, **Then** 400.
  - **Edge case**: `description_html` is sanitized; `description_stripped` is the tag-stripped text.
- **Verify**: `docker compose -f docker-compose-test.yml run --rm api-tests pytest plane/tests/contract/app/test_epic_crud.py -m contract` ; backend lint/type on touched modules (`ruff check`, `mypy` if configured).
- **Done when**: CRUD + all authorization/edge tests green; description sanitized; no new model/migration introduced.

---

## TASK-10 — Epic progress rollup endpoint

- **Implements**: EPIC-2. **Depends on**: TASK-9. **Risk tier**: R1. **Worktree isolation**: yes.
- **Context**: Add `GET /api/workspaces/<slug>/projects/<project_id>/epics/<epic_id>/progress/` returning counts of child work items by state group plus percent-complete. Children are Issues whose `parent` is the epic. Use annotate-based aggregation modeled on `WorkspaceCyclesEndpoint` (`apps/api/plane/app/views/workspace/cycle.py`) which does `Count("...", filter=Q(...state__group="completed"..., deleted_at__isnull=True))`. Zero work items must return 0% with **no divide-by-zero**.
- **Files**: add the URL to `apps/api/plane/app/urls/epic.py`; add the view (e.g. `EpicProgressEndpoint`) to the epic views module; extend test `apps/api/plane/tests/contract/app/test_epic_crud.py` or new `test_epic_progress.py`.
- **TDD — failing test first**: `apps/api/plane/tests/contract/app/test_epic_progress.py`:
  - `test_progress_counts_children_by_state_group` (epic with N children across `backlog`/`started`/`completed` returns correct per-group counts + percent).
  - `test_progress_zero_children_returns_zero_percent_no_divzero` (epic with no children → `percent_complete == 0`, 200, no error).
  Both FAIL initially.
- **Implementation outline**: Query `Issue.objects.filter(parent_id=epic_id, deleted_at__isnull=True)`, annotate counts per `state__group` with `Count(... filter=Q(...))` as in `WorkspaceCyclesEndpoint`. Compute `percent_complete = completed/total` guarded by `if total else 0`. Return `{ "percent_complete": ..., "counts_by_group": {...} }`.
- **Acceptance criteria**:
  - **Given** an epic with children in several state groups, **When** a viewer GETs `.../progress/`, **Then** counts by state group + percent-complete return.
  - **Given** an epic with zero children, **When** progress is fetched, **Then** percent is `0` with no divide-by-zero.
  - **Edge case**: soft-deleted children (`deleted_at` set) are excluded from counts.
- **Verify**: `docker compose -f docker-compose-test.yml run --rm api-tests pytest plane/tests/contract/app/test_epic_progress.py -m contract`.
- **Done when**: progress math + zero-case tests green; deleted children excluded.

---

## TASK-11 — Epic bulk-attach work items (one-epic-per-item)

- **Implements**: EPIC-2. **Depends on**: TASK-9. **Risk tier**: R1. **Worktree isolation**: yes.
- **Context**: Add `POST /api/workspaces/<slug>/projects/<project_id>/epics/<epic_id>/work-items/` accepting `{ "issue_ids": [...], "reparent": bool? }`. It sets each item's `parent` to the epic. A work item's parent epic is single-valued (one-epic-per-item): if an item is already parented to a different epic, **default reject** with a clear error; only reparent when `reparent: true` is passed, and record the reparent in issue activity.
- **Files**: add URL to `apps/api/plane/app/urls/epic.py`; add view (e.g. `EpicWorkItemsEndpoint`); reuse the existing issue-activity logging utility (grep `issue_activity` / `track_*` under `apps/api/plane/bgtasks/` or `apps/api/plane/app/views/issue/`); test `apps/api/plane/tests/contract/app/test_epic_bulk_attach.py`.
- **TDD — failing test first**: `test_epic_bulk_attach.py`:
  - `test_bulk_attach_sets_parent_for_unparented_items`.
  - `test_bulk_attach_rejects_item_already_parented_without_flag` (400/clear error).
  - `test_bulk_attach_reparents_with_flag_and_logs_activity`.
  - `test_bulk_attach_requires_project_edit_role` (viewer → 403).
  Tests FAIL initially.
- **Implementation outline**: Validate `issue_ids` belong to the same workspace+project. For each, if `parent_id` already set to a different epic and `reparent` not set → collect into an error response (reject the batch or per-item per the explicit policy — default reject). On success set `parent_id = epic_id`, save, and emit issue activity. Enforce edit role via `allow_permission`.
- **Acceptance criteria**:
  - **Given** unparented work items, **When** bulk-attach runs, **Then** each item's `parent` is set to the epic.
  - **Given** an item already parented to another epic, **When** attach runs without `reparent`, **Then** rejected with a clear error; **When** with `reparent: true`, **Then** reparented and recorded in activity.
  - **Given** a viewer, **When** they call bulk-attach, **Then** 403.
  - **Edge case**: an `issue_id` from a different project/workspace is rejected (400).
- **Verify**: `docker compose -f docker-compose-test.yml run --rm api-tests pytest plane/tests/contract/app/test_epic_bulk_attach.py -m contract`.
- **Done when**: attach/reject/reparent + auth tests green; reparent writes activity.

---

## TASK-12 — Epic ↔ work-item conversion (R0 if untested)

- **Implements**: EPIC-2. **Depends on**: TASK-9. **Risk tier**: R1 (escalates to **R0** if any conversion path lacks test coverage — STOP and get sign-off). **Worktree isolation**: yes.
- **Context**: Conversion touches hierarchy data, so every path MUST be tested before merge. Add `POST /api/workspaces/<slug>/projects/<project_id>/epics/<epic_id>/convert/` (epic → standard work item, body `{ "target_issue_type_id": ... }`) and `POST /api/workspaces/<slug>/projects/<project_id>/work-items/<issue_id>/convert-to-epic/`. Converting an epic that has children must apply an explicit child-reparenting policy (reparent children to the epic's parent, or orphan to null) and record it in issue activity — **block silent data loss**.
- **Files**: add URLs to `apps/api/plane/app/urls/epic.py`; add conversion views; reuse issue-activity logging; test `apps/api/plane/tests/contract/app/test_epic_convert.py`.
- **TDD — failing test first**: `test_epic_convert.py`:
  - `test_convert_epic_to_work_item_flips_type_to_target`.
  - `test_convert_epic_with_children_reparents_per_policy_and_logs` (children moved to epic's parent/null; activity written; no child silently lost).
  - `test_convert_work_item_to_epic_sets_is_epic_type`.
  - `test_convert_requires_project_edit_role` (viewer → 403).
  - `test_convert_cross_workspace_target_type_rejected` (400).
  All FAIL initially.
- **Implementation outline**: For epic→work-item: validate `target_issue_type_id` is a non-epic type in the same workspace; reparent children per policy in a transaction; flip `issue.type`; write activity. For work-item→epic: validate the work item, set its type to the project's epic `IssueType`; write activity. Wrap in `transaction.atomic`.
- **Acceptance criteria**:
  - **Given** an epic, **When** converted to a target non-epic type, **Then** its type flips and the change is in activity.
  - **Given** an epic with children, **When** converted, **Then** children are reparented per the recorded policy and the conversion is logged (no silent loss).
  - **Given** a work item, **When** convert-to-epic runs, **Then** it becomes an `is_epic` Issue.
  - **Given** a viewer, **Then** 403; **Given** a cross-workspace target type, **Then** 400.
- **Verify**: `docker compose -f docker-compose-test.yml run --rm api-tests pytest plane/tests/contract/app/test_epic_convert.py -m contract`.
- **Done when**: all conversion + reparenting + auth/edge paths green (untested path = R0 stop); activity logged.

---

## TASK-13 — Epic duplication (cross-project / cross-workspace remap) (R0 if untested)

- **Implements**: EPIC-2. **Depends on**: TASK-9. **Risk tier**: R1 (escalates to **R0** if the remap path lacks test coverage — STOP and get sign-off). **Worktree isolation**: yes.
- **Context**: Add `POST /api/workspaces/<slug>/projects/<project_id>/epics/<epic_id>/duplicate/` with body `{ "target_project_id"?, "target_workspace_slug"?, "include_subtree": bool }`. Cross-workspace duplication MUST re-resolve members/labels/states **in the target tenant** — never carry source-tenant IDs across. When a target state/label/member is missing, fall back to the target's defaults and return a remap summary. This mirrors the template-clone edge-case handling in `spec.md`.
- **Files**: add URL to `apps/api/plane/app/urls/epic.py`; add duplication view; test `apps/api/plane/tests/contract/app/test_epic_duplicate.py`.
- **TDD — failing test first**: `test_epic_duplicate.py`:
  - `test_duplicate_into_same_project_copies_epic`.
  - `test_duplicate_with_subtree_copies_children` (`include_subtree: true`).
  - `test_duplicate_cross_workspace_remaps_state_label_member_to_target_defaults_and_returns_summary` (missing targets → defaults + remap summary; assert **no source-tenant IDs** present in the created rows).
  - `test_duplicate_requires_edit_role_on_source_and_target`.
  All FAIL initially.
- **Implementation outline**: In `transaction.atomic`, resolve target workspace/project (validate membership/edit role on both). Create a new `is_epic` Issue in the target; if `include_subtree`, copy children. Remap state/labels/assignees by matching on name/identity in the target; on miss, use target defaults and append to a `remap_summary` list returned in the response. Never copy raw source UUIDs for state/label/member into another workspace.
- **Acceptance criteria**:
  - **Given** an epic, **When** duplicated into another project, **Then** a copy is created in the target.
  - **Given** `include_subtree: true`, **When** duplicated, **Then** children are copied.
  - **Given** a cross-workspace target with missing state/label/member, **When** duplication runs, **Then** it falls back to target defaults, returns a remap summary, and contains no source-tenant IDs.
  - **Given** a caller lacking edit role on source or target, **Then** rejected.
- **Verify**: `docker compose -f docker-compose-test.yml run --rm api-tests pytest plane/tests/contract/app/test_epic_duplicate.py -m contract`.
- **Done when**: same-project, subtree, and cross-workspace-remap paths all green (untested remap = R0 stop); remap summary returned; no cross-tenant ID leakage.

---

## TASK-14 — Epic v1 api-key parity + flip `epics` flag ON

- **Implements**: EPIC-2. **Depends on**: TASK-9..13. **Risk tier**: R1. **Worktree isolation**: yes.
- **Context**: Expose api-key v1 parity for epic list/create/detail in `apps/api/plane/api/urls/epic.py`, enforcing the **same** role checks as the session routes (no NLQ over v1). v1 url/view style follows `apps/api/plane/api/urls/work_item.py` + `apps/api/plane/api/views/`. Once the full epic backend (TASK-9..14) is green, flip the `epics` entitlement flag from `false` to `true` in `apps/web/ce/lib/self-host-entitlements.ts` so the project epics route (TASK-5) serves live data.
- **Files**: create `apps/api/plane/api/urls/epic.py` + v1 views in `apps/api/plane/api/views/`; wire into `apps/api/plane/api/urls/__init__.py`; modify `apps/web/ce/lib/self-host-entitlements.ts` (`epics: true`); modify `apps/web/ce/lib/self-host-entitlements.test.ts` (update the epics assertion to `true`); test `apps/api/plane/tests/contract/api/test_epic_v1.py`.
- **TDD — failing test first**: API: `test_epic_v1.py` — `test_v1_list_create_detail_enforce_same_roles` (api-key with member role can create; viewer-equivalent token cannot; cross-workspace → 400). Web: update the TASK-1 test to assert `SELF_HOSTED_FEATURE_FLAGS.epics === true` and `isSelfHostedFeatureEnabled("epics") === true` — this RED edit fails until the flag flips. Both FAIL initially.
- **Implementation outline**: Mirror `work_item.py` v1 url patterns scoped by `slug` + `project_id`, reuse the v1 base API view auth. Map list/create/detail to epic querysets (`type__is_epic=True`). Then flip `epics: true`.
- **Acceptance criteria**:
  - **Given** an api-key with member role, **When** it lists/creates/reads epics over v1, **Then** it succeeds with the same gating as session; viewer-equivalent is rejected; cross-workspace → 400.
  - **Given** all epic backend tests pass, **When** `epics` flips `true`, **Then** `isSelfHostedFeatureEnabled("epics")` returns `true` and the route serves live data.
- **Verify**: `docker compose -f docker-compose-test.yml run --rm api-tests pytest plane/tests/contract/api/test_epic_v1.py -m contract` ; `pnpm --filter web exec vitest run ce/lib/self-host-entitlements.test.ts` ; `pnpm turbo run check:types --filter=web`.
- **Done when**: v1 parity tests green with identical role enforcement; `epics` flag `true`; web entitlement test updated and green.

---

## TASK-15 — Epic custom properties: models + migration

- **Implements**: EPIC-3. **Depends on**: TASK-9. **Risk tier**: R1 (additive schema; reviewed reverse migration). **Worktree isolation**: yes.
- **Context**: Add three additive models in `apps/api/plane/db/models/issue_property.py` (no change to `issues`/`issue_types`). `IssueProperty`: FK `issue_type` (`related_name="properties"`), FK `workspace`, `name`, `display_name`, `description`, `property_type` (`text`/`option`/`member`), `is_multi` bool, `is_required` bool, `sort_order` float, `settings` JSON, `external_source`/`external_id`. `IssuePropertyOption`: FK `IssueProperty`, `name`, `sort_order`, `is_default`. `IssuePropertyValue`: FK `Issue`, FK `IssueProperty`, `value_text` TextField, `value_option` FK `IssuePropertyOption` (null), `value_uuid` (member id, null); unique per `(issue, property, value)` where `deleted_at` is null. All extend the existing base mixins (`BaseModel` workspace-scoped / `ProjectBaseModel` project-scoped — inspect `apps/api/plane/db/models/base.py`) and inherit soft-delete. Partial unique constraint uses `UniqueConstraint(... condition=Q(deleted_at__isnull=True))`, matching the existing project-issue-type constraint style (grep an existing model for `condition=Q(deleted_at__isnull=True)`).
- **Files**: create `apps/api/plane/db/models/issue_property.py`; export from `apps/api/plane/db/models/__init__.py`; generate migration in `apps/api/plane/db/migrations/`; test `apps/api/plane/tests/unit/models/test_issue_property.py`.
- **TDD — failing test first**: `apps/api/plane/tests/unit/models/test_issue_property.py` (`@pytest.mark.unit` + `@pytest.mark.django_db`):
  - `test_create_text_option_member_properties_persist_with_type_and_is_multi`.
  - `test_duplicate_property_value_for_issue_rejected_by_partial_unique` (second identical `(issue, property, value)` with `deleted_at` null raises IntegrityError).
  All FAIL initially (models don't exist).
- **Implementation outline**: Define the three models with FKs, choices for `property_type`, the partial `UniqueConstraint`. Run `makemigrations` to generate the additive migration; confirm it only `CreateModel`s (no `AlterField` on existing tables). Provide reverse-migration note in the card's DoD.
- **Acceptance criteria**:
  - **Given** an epic `IssueType`, **When** `text`/`option`(multi)/`member` properties are created, **Then** they persist with correct `property_type`/`is_multi`.
  - **Given** an existing `(issue, property, value)` row, **When** an identical non-deleted row is inserted, **Then** the partial unique constraint rejects it.
  - **Edge case**: forward migration is additive only (no `issues`/`issue_types` alteration); reverse migration drops the three tables cleanly.
- **Verify**: `docker compose -f docker-compose-test.yml run --rm api-tests pytest plane/tests/unit/models/test_issue_property.py -m unit` ; migration forward/reverse check: `docker compose -f docker-compose-test.yml run --rm api-tests python manage.py migrate db <new> && ... migrate db <prev>` (substitute the actual app label/migration numbers).
- **Done when**: three models + additive migration in place, unit + constraint tests green, reverse migration verified to drop only the new tables.

---

## TASK-16 — Epic custom properties: API (definitions, options, values)

- **Implements**: EPIC-3. **Depends on**: TASK-15, TASK-9. **Risk tier**: R1. **Worktree isolation**: yes.
- **Context**: Expose CRUD for property definitions, options, and per-epic values. Property definition/edit requires project edit role; reads require project viewer. Member `value_uuid` references must be validated as members of the owning workspace. `value_text` sanitized on persist consistent with issue text handling. Routes: `GET|POST /api/workspaces/<slug>/issue-types/<type_id>/properties/`, `GET|PATCH|DELETE .../properties/<pk>/`, `GET|POST .../properties/<pk>/options/`; values at `GET|POST /api/workspaces/<slug>/projects/<project_id>/epics/<epic_id>/property-values/`.
- **Files**: add URLs (extend `apps/api/plane/app/urls/epic.py` or new `apps/api/plane/app/urls/issue_property.py`, wire into `__init__.py`); add views + serializers (`apps/api/plane/app/views/issue_property.py`, `apps/api/plane/app/serializers/issue_property.py`); test `apps/api/plane/tests/contract/app/test_issue_property_api.py`.
- **TDD — failing test first**: `test_issue_property_api.py`:
  - `test_define_property_and_set_values_persist_and_reload`.
  - `test_required_property_missing_value_rejected` (validation error).
  - `test_member_value_uuid_must_be_workspace_member` (non-member uuid → 400).
  - `test_property_write_requires_edit_role` (viewer → 403).
  All FAIL initially.
- **Implementation outline**: ViewSets for properties/options/values scoped by workspace (and project for values). Validate `is_required` on value save. Validate `value_uuid` membership. Sanitize `value_text`. Enforce roles via `allow_permission`.
- **Acceptance criteria**:
  - **Given** an epic IssueType, **When** a member defines text/option(multi)/member properties and sets values, **Then** values persist and re-render on reload.
  - **Given** an `is_required` property with no value, **When** saving, **Then** 400.
  - **Given** a `member`-type value referencing a non-workspace-member uuid, **Then** 400.
  - **Given** a viewer, **When** defining/editing a property, **Then** 403.
- **Verify**: `docker compose -f docker-compose-test.yml run --rm api-tests pytest plane/tests/contract/app/test_issue_property_api.py -m contract`.
- **Done when**: property/option/value CRUD + validation + auth tests green.

---

## TASK-17 — Epic custom-property fields in detail view (frontend)

- **Implements**: EPIC-3. **Depends on**: TASK-4 (modal/detail), TASK-16 (API). **Risk tier**: R2. **Worktree isolation**: no.
- **Context**: Add property-definition + per-epic value-editing fields to the epic detail/modal (built in TASK-4). Render `text` (input), `option` single/multi (dropdown), and `member` (member picker) field types from the property definitions, and persist values through a service method hitting the TASK-16 `property-values` endpoint. Extend `EpicService` (TASK-2) with `getProperties`/`getPropertyValues`/`setPropertyValue`.
- **Files**: extend `packages/services/src/epic/epic.service.ts` (+ test); add detail-view fields under `apps/web/ce/components/epics/` (e.g. `epic-properties/`); test `apps/web/ce/components/epics/epic-properties/properties.test.tsx`.
- **TDD — failing test first**: `properties.test.tsx` — `it("renders text/option-multi/member property fields and persists a value")`: render with mocked property definitions, set a text value + two options + a member, submit, assert `EpicService.setPropertyValue` called per field. FAILS (no component).
- **Implementation outline**: Fetch definitions via service, map `property_type` → field component, edit and persist values. Multi-option renders multi-select.
- **Acceptance criteria**:
  - **Given** defined properties, **When** the epic detail renders, **Then** text/option/member fields appear per definition.
  - **Given** a member edits values, **When** saved, **Then** the service persists and values re-render on reload.
  - **Edge case**: a multi-option property allows selecting more than one option.
- **Verify**: `pnpm --filter web exec vitest run ce/components/epics/epic-properties/properties.test.tsx` ; `pnpm turbo run check:types --filter=web`.
- **Done when**: three field types render + persist, tests + type check green.

---

## TASK-18 — Initiatives: models + migration

- **Implements**: EPIC-4. **Depends on**: none (model layer). **Risk tier**: R1 (additive schema). **Worktree isolation**: yes.
- **Context**: No `Initiative` model exists in the fork. Add additive models in `apps/api/plane/db/models/initiative.py`. `Initiative` extends `BaseModel`: FK `workspace` (`related_name="initiatives"`), `name`, `description`/`description_html`/`description_stripped`/`description_json`, FK `lead` → `AUTH_USER_MODEL` (null), `start_date`/`end_date` (null), `state` CharField choices `DRAFT`/`PLANNED`/`ACTIVE`/`COMPLETED`/`CLOSED` (default `DRAFT`), `sort_order` float, `logo_props` JSON, `progress_snapshot` JSON cache, `external_source`/`external_id`. `InitiativeEpic`: FK `Initiative`, FK `Issue` (must be `is_epic`), unique-when-not-deleted. `InitiativeProject`: FK `Initiative`, FK `Project`, unique-when-not-deleted. `InitiativeLabel`: FK `Initiative`, FK `Label` (workspace-scoped). The reserved slug `"initiatives"` is already in `RESTRICTED_WORKSPACE_SLUGS` (`apps/api/plane/utils/constants.py:47`) — no constants change. Join tables use `UniqueConstraint(... condition=Q(deleted_at__isnull=True))`.
- **Files**: create `apps/api/plane/db/models/initiative.py`; export from `apps/api/plane/db/models/__init__.py`; generate migration; test `apps/api/plane/tests/unit/models/test_initiative.py`.
- **TDD — failing test first**: `test_initiative.py` (`@pytest.mark.unit` + `@pytest.mark.django_db`):
  - `test_create_initiative_defaults_state_draft`.
  - `test_initiative_state_choices_enforced` (invalid state rejected at validation).
  - `test_duplicate_initiative_epic_join_rejected_by_partial_unique`.
  All FAIL initially.
- **Implementation outline**: Define models + choices + partial unique constraints. `makemigrations`; confirm additive-only (`CreateModel` only). Note reverse migration drops new tables.
- **Acceptance criteria**:
  - **Given** an initiative created without `state`, **Then** it defaults to `DRAFT`.
  - **Given** an invalid `state`, **Then** validation rejects it.
  - **Given** a duplicate non-deleted `(initiative, epic)` join, **Then** the partial unique constraint rejects it.
  - **Edge case**: forward migration is additive only; reverse drops only the new tables.
- **Verify**: `docker compose -f docker-compose-test.yml run --rm api-tests pytest plane/tests/unit/models/test_initiative.py -m unit` ; forward/reverse migration check as in TASK-15.
- **Done when**: models + additive migration in place, unit + constraint tests green, reverse migration verified.

---

## TASK-19 — Initiatives: CRUD + member-attach + progress + summary endpoints

- **Implements**: EPIC-4. **Depends on**: TASK-18, TASK-10 (epic progress feeds rollup). **Risk tier**: R1. **Worktree isolation**: yes.
- **Context**: Workspace-scoped endpoints in `apps/api/plane/app/urls/initiative.py`, scoped by `slug` only. Read requires `WorkspaceViewerPermission`; create/update/delete + member-attach require Workspace Admin/Member (`@allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")`). Mirror `WorkspaceCyclesEndpoint` (`apps/api/plane/app/views/workspace/cycle.py`) for the annotate-based aggregation. Member-attach validates referenced epics/projects belong to the **same workspace** — reject cross-workspace with `400`. `description_html` sanitized on persist (same path as `IssueComment`). Initiative progress composes epic progress (TASK-10) with project progress; member epics that are converted to non-epic or soft-deleted are **skipped**. Routes: `GET|POST /api/workspaces/<slug>/initiatives/`, `GET|PATCH|DELETE .../initiatives/<pk>/`, `POST|DELETE .../initiatives/<initiative_id>/epics/` and `.../projects/`, `GET .../initiatives/<initiative_id>/progress/`, `GET /api/workspaces/<slug>/initiatives-summary/` (grouped by the five lifecycle states with progress annotations).
- **Files**: create `apps/api/plane/app/urls/initiative.py` (wire into `__init__.py`); views `apps/api/plane/app/views/initiative.py` (or `workspace/initiative.py` next to `cycle.py`); serializer `apps/api/plane/app/serializers/initiative.py`; test `apps/api/plane/tests/contract/app/test_initiative_api.py`.
- **TDD — failing test first**: `test_initiative_api.py`:
  - `test_member_create_initiative_attach_epics_project_and_progress_rollup`.
  - `test_attach_cross_workspace_epic_returns_400`.
  - `test_viewer_cannot_write_or_attach_403` and `test_non_member_403`.
  - `test_progress_skips_converted_or_deleted_member_epic`.
  - `test_initiatives_summary_groups_by_five_lifecycle_states`.
  All FAIL initially.
- **Implementation outline**: ViewSet/endpoints scoped by `workspace__slug`. Member-attach validates same-workspace membership of referenced epic/project. Progress aggregates member epics (reusing TASK-10 rollup) + project progress, skipping non-epic/deleted members; cache into `progress_snapshot` optionally. Summary endpoint annotates + groups by `state`. Apply `WorkspaceViewerPermission` for reads, `allow_permission` for writes.
- **Acceptance criteria**:
  - **Given** a Workspace Member, **When** they create an initiative + attach two epics and a project, **Then** join rows persist and progress returns an aggregated rollup.
  - **Given** a cross-workspace epic attach, **Then** 400.
  - **Given** a Workspace Viewer or non-member, **When** they write/attach, **Then** rejected.
  - **Given** a member epic later converted/soft-deleted, **When** progress recomputes, **Then** it is skipped (no error/stale member).
  - **Given** `initiatives-summary`, **Then** initiatives are grouped by the five lifecycle states with progress annotations.
- **Verify**: `docker compose -f docker-compose-test.yml run --rm api-tests pytest plane/tests/contract/app/test_initiative_api.py -m contract`.
- **Done when**: CRUD + attach + progress + summary + all auth/edge tests green; description sanitized.

---

## TASK-20 — Initiatives v1 api-key parity

- **Implements**: EPIC-4. **Depends on**: TASK-19. **Risk tier**: R1. **Worktree isolation**: yes.
- **Context**: Expose api-key v1 parity for initiative list/create/detail in `apps/api/plane/api/urls/initiative.py`, enforcing the same workspace role checks as session (no NLQ over v1). Style follows `apps/api/plane/api/urls/work_item.py` + `apps/api/plane/api/views/`.
- **Files**: create `apps/api/plane/api/urls/initiative.py` + v1 views; wire into `apps/api/plane/api/urls/__init__.py`; test `apps/api/plane/tests/contract/api/test_initiative_v1.py`.
- **TDD — failing test first**: `test_initiative_v1.py` — `test_v1_list_create_detail_enforce_workspace_roles` (member api-key creates; viewer-equivalent rejected; cross-workspace attach → 400). FAILS initially.
- **Implementation outline**: Mirror the v1 work-item url/view auth, scoped by `slug`, mapping list/create/detail to the initiative queryset; reuse the same permission gating as TASK-19.
- **Acceptance criteria**:
  - **Given** a member api-key, **When** it lists/creates/reads initiatives over v1, **Then** it succeeds with the same gating as session; viewer-equivalent rejected; cross-workspace → 400.
- **Verify**: `docker compose -f docker-compose-test.yml run --rm api-tests pytest plane/tests/contract/api/test_initiative_v1.py -m contract`.
- **Done when**: v1 parity tests green with identical workspace role enforcement.

---

## TASK-21 — Initiatives UI: store, service, types, constants

- **Implements**: EPIC-5. **Depends on**: TASK-19 (endpoints). **Risk tier**: R2. **Worktree isolation**: yes.
- **Context**: Build the frontend data layer for initiatives. New MobX store under `apps/web/ce/store/initiative/`, `InitiativeService` in `packages/services/src/initiative/` (follow the `cycle/` service conventions), initiative + lifecycle-state types in `packages/types`, and lifecycle-state/status labels in `packages/constants` (+ `packages/i18n` strings). The five lifecycle states are `DRAFT`/`PLANNED`/`ACTIVE`/`COMPLETED`/`CLOSED`. Filter persistence reuses the same persisted-filter approach as the epic filter store (TASK-3).
- **Files**: create `packages/services/src/initiative/initiative.service.ts` (+ `index.ts`, export from `packages/services/src/index.ts`); create `apps/web/ce/store/initiative/initiative.store.ts`; add types in `packages/types`; add constants in `packages/constants` (lifecycle states) + i18n keys; tests `packages/services/src/initiative/initiative.service.test.ts` and `apps/web/ce/store/initiative/initiative.store.test.ts`.
- **TDD — failing test first**: service test asserts `list(slug)` → `GET /api/workspaces/:slug/initiatives/`, `getProgress(slug,id)` → `.../progress/`, `attachEpic`/`attachProject` → the member-attach endpoints. Store test asserts `fetchInitiatives` populates the observable map and that the lifecycle-state constant has exactly the five values. Both FAIL initially.
- **Implementation outline**: Define `InitiativeService` methods mapping to TASK-19 routes; MobX store mirroring sibling stores; a `INITIATIVE_STATES` constant of the five states used by the board columns (TASK-22).
- **Acceptance criteria**:
  - **Given** `InitiativeService.list("ws")`, **Then** it requests `GET /api/workspaces/ws/initiatives/`.
  - **Given** the lifecycle constant, **Then** it contains exactly `DRAFT`,`PLANNED`,`ACTIVE`,`COMPLETED`,`CLOSED`.
  - **Given** the store, **When** `fetchInitiatives` runs, **Then** the observable map populates from the mocked service.
- **Verify**: `pnpm --filter web exec vitest run ce/store/initiative/initiative.store.test.ts` ; service test via its package's vitest ; `pnpm turbo run check:types --filter=web`.
- **Done when**: service + store + types + constants implemented, tests + type check green.

---

## TASK-22 — Initiatives UI: route, list/board/timeline layouts, detail + flip flag ON

- **Implements**: EPIC-5. **Depends on**: TASK-21, TASK-1 (flag), TASK-5 (route/layout precedent). **Risk tier**: R2. **Worktree isolation**: yes.
- **Context**: Add a top-level workspace route `apps/web/app/(all)/[workspaceSlug]/(projects)/initiatives/` (slug already reserved server-side). Reuse the existing list/board/timeline layout stack + timeline store (`apps/web/ce/store/timeline/base-timeline.store.ts`) — board columns = the five lifecycle states (`DRAFT`/`PLANNED`/`ACTIVE`/`COMPLETED`/`CLOSED`); timeline zoom week/month/quarter; filter/group by lead/state/labels/dates persisted across view switches. Initiative detail: card-based progress (rollup from epics + projects) + a members panel to attach/detach epics and projects. Empty state: "Create your first initiative" gated on the `initiatives` entitlement. After this surface is functional, flip `initiatives` from `false` to `true` in `apps/web/ce/lib/self-host-entitlements.ts`.
- **Files**: create route under `apps/web/app/(all)/[workspaceSlug]/(projects)/initiatives/`; components under `apps/web/ce/components/initiatives/`; modify `apps/web/ce/lib/self-host-entitlements.ts` (`initiatives: true`) + update `apps/web/ce/lib/self-host-entitlements.test.ts`; test `apps/web/ce/components/initiatives/initiatives-board.test.tsx`.
- **TDD — failing test first**:
  - `initiatives-board.test.tsx` — `it("renders exactly five lifecycle columns and places initiatives in their state column")`.
  - `it("renders the create-your-first-initiative empty state and fetches no data when the initiatives flag is false")`.
  - `it("persists a state/lead filter when switching board → timeline")`.
  - Web entitlement test: update the TASK-1 assertion to `SELF_HOSTED_FEATURE_FLAGS.initiatives === true` (RED until flag flips).
  All FAIL initially.
- **Implementation outline**: Copy the project layout-mount conventions from TASK-5 / the cycles route. Board column set = the five-state constant from TASK-21. Detail view composes the progress card + members panel calling `InitiativeService`. Concurrent membership edits → refetch on conflict (last-write-wins). Flip flag last.
- **Acceptance criteria**:
  - **Given** `initiatives` flag `true`, **When** a Workspace Viewer opens the board, **Then** exactly five lifecycle columns render and initiatives appear in their state column.
  - **Given** an initiative detail, **When** a member attaches an epic + project, **Then** the members panel updates and the progress card re-renders.
  - **Given** a state/lead filter on the board, **When** switching to timeline, **Then** the filter persists.
  - **Given** `initiatives` flag `false`, **When** the route opens, **Then** the empty-state renders and no live data is requested.
  - **Edge case**: a conflicting concurrent membership write triggers a refetch without crashing.
- **Verify**: `pnpm --filter web exec vitest run ce/components/initiatives/initiatives-board.test.tsx` ; `pnpm --filter web exec vitest run ce/lib/self-host-entitlements.test.ts` ; `pnpm turbo run check:types --filter=web` ; `pnpm --filter web run build`.
- **Done when**: route + five-column board + timeline + detail render, filter persists, empty-state gated, `initiatives` flag `true`, all tests + type check + build green.

---

## TASK-23 — Status updates: models + migration (epic XOR initiative)

- **Implements**: EPIC-6. **Depends on**: TASK-18 (`Initiative` model). **Risk tier**: R1 (additive schema + CheckConstraint). **Worktree isolation**: yes.
- **Context**: Add additive models in `apps/api/plane/db/models/status_update.py`. `StatusUpdate` extends `BaseModel`: FK `workspace`; nullable FK `epic` → `Issue` and nullable FK `initiative` → `Initiative`, **exactly one set, enforced by a `CheckConstraint`** (epic XOR initiative); `status` CharField choices `ON_TRACK`/`AT_RISK`/`OFF_TRACK`; `comment_html`/`comment_stripped`/`comment_json`; self-FK `parent` (`related_name="replies"`) for threading; FK `actor`. `StatusUpdateReaction`: FK `StatusUpdate`, FK `actor`, `reaction` Text, unique-when-not-deleted (mirror `CommentReaction`). Threading/text tracking mirrors `IssueComment` (self-FK `parent`, `comment_html`/`comment_stripped`/`comment_json`). No change to `issue_comments`.
- **Files**: create `apps/api/plane/db/models/status_update.py`; export from `apps/api/plane/db/models/__init__.py`; generate migration; test `apps/api/plane/tests/unit/models/test_status_update.py`.
- **TDD — failing test first**: `test_status_update.py` (`@pytest.mark.unit` + `@pytest.mark.django_db`):
  - `test_status_update_epic_only_persists` and `test_status_update_initiative_only_persists`.
  - `test_status_update_both_epic_and_initiative_rejected_by_checkconstraint`.
  - `test_status_update_neither_set_rejected_by_checkconstraint`.
  - `test_duplicate_reaction_same_actor_rejected_by_partial_unique`.
  All FAIL initially.
- **Implementation outline**: Define models, `status` choices, self-FK `parent`, the `CheckConstraint` `Q(epic__isnull=False, initiative__isnull=True) | Q(epic__isnull=True, initiative__isnull=False)`, and the partial unique reaction constraint. `makemigrations`; confirm additive-only. Note reverse migration drops new tables.
- **Acceptance criteria**:
  - **Given** an `AT_RISK` update on an epic only (initiative null), **Then** it persists with `comment_html`/`comment_stripped`/`comment_json` set.
  - **Given** both epic+initiative set, or neither, **Then** the `CheckConstraint` rejects it.
  - **Given** a duplicate non-deleted reaction by the same actor, **Then** the partial unique constraint rejects it.
  - **Edge case**: forward migration additive only (no `issue_comments` change); reverse drops only the new tables.
- **Verify**: `docker compose -f docker-compose-test.yml run --rm api-tests pytest plane/tests/unit/models/test_status_update.py -m unit` ; forward/reverse migration check as in TASK-15.
- **Done when**: models + CheckConstraint + partial-unique + additive migration in place, all tests green, reverse migration verified.

---

## TASK-24 — Status updates: API (threaded, reactions)

- **Implements**: EPIC-6. **Depends on**: TASK-23, TASK-9 (epic endpoints), TASK-19 (initiative endpoints). **Risk tier**: R1. **Worktree isolation**: yes.
- **Context**: Endpoints: `GET|POST /api/workspaces/<slug>/projects/<project_id>/epics/<epic_id>/status-updates/` and `GET|PATCH|DELETE .../status-updates/<pk>/`; `GET|POST /api/workspaces/<slug>/initiatives/<initiative_id>/status-updates/`; `POST|DELETE .../status-updates/<status_update_id>/reactions/`. Authorship requires membership of the owning epic's project / initiative's workspace; reads require the matching viewer role. Querysets filter by workspace (and project for epic-scoped updates). `comment_html` sanitized on persist via the same strip/sanitize path as `IssueComment`. Threaded replies attach via the self-FK `parent`. Reactions mirror `CommentReaction`. Space/public API must NOT surface status updates.
- **Files**: add URLs (extend `apps/api/plane/app/urls/epic.py` + `apps/api/plane/app/urls/initiative.py`); views `apps/api/plane/app/views/status_update.py`; serializer `apps/api/plane/app/serializers/status_update.py`; test `apps/api/plane/tests/contract/app/test_status_update_api.py`.
- **TDD — failing test first**: `test_status_update_api.py`:
  - `test_project_member_posts_at_risk_update_on_epic_sets_comment_fields_and_epic_fk` (initiative FK null).
  - `test_threaded_reply_attaches_via_parent_and_reaction_persists`.
  - `test_duplicate_reaction_rejected` (partial unique).
  - `test_non_member_cannot_author_403` and `test_read_requires_viewer_role`.
  All FAIL initially.
- **Implementation outline**: ViewSets for epic-scoped and initiative-scoped updates; reuse the issue-comment sanitize path; replies set `parent`; reaction endpoint mirrors comment-reaction add/remove. Enforce roles via `allow_permission` (project level for epic updates, workspace level for initiative updates).
- **Acceptance criteria**:
  - **Given** a project member, **When** they post an `AT_RISK` update on an epic with rich text, **Then** it persists with `comment_html`/`comment_stripped`/`comment_json` and `epic` FK set (initiative null).
  - **Given** a status update, **When** a member posts a reply + emoji reaction, **Then** the reply attaches via `parent` and the reaction persists; a duplicate reaction by the same actor is rejected.
  - **Given** a non-member, **When** authoring, **Then** 403; reads require the matching viewer role.
- **Verify**: `docker compose -f docker-compose-test.yml run --rm api-tests pytest plane/tests/contract/app/test_status_update_api.py -m contract`.
- **Done when**: epic + initiative status-update CRUD, threading, reactions, and auth tests green; `comment_html` sanitized.

---

## TASK-25 — Status updates: threaded UI in epic + initiative detail

- **Implements**: EPIC-6. **Depends on**: TASK-24 (API), TASK-4 (epic detail), TASK-22 (initiative detail). **Risk tier**: R2. **Worktree isolation**: no.
- **Context**: Add a status-update section to the epic and initiative detail views with On Track / At Risk / Off Track chips, a rich-text body, threaded replies, and emoji reactions reusing the existing reaction UI components (grep `reaction` components under `apps/web/core/components/`). Persist through a service hitting the TASK-24 endpoints. The UI must NOT treat `comment_html` as pre-sanitized (server sanitizes on persist).
- **Files**: components under `apps/web/ce/components/status-updates/`; extend `EpicService` (TASK-2) + `InitiativeService` (TASK-21) with status-update methods (+ service tests); test `apps/web/ce/components/status-updates/status-update-thread.test.tsx`.
- **TDD — failing test first**: `status-update-thread.test.tsx` — `it("posts an AT_RISK update, renders a threaded reply, and toggles an emoji reaction")`: assert the status chip renders, posting calls the service with `status: "AT_RISK"`, a reply nests under its parent, and the reaction toggles via the service. FAILS (no component).
- **Implementation outline**: Status chips map to `ON_TRACK`/`AT_RISK`/`OFF_TRACK`. Reuse the rich-text editor + reaction components. Render replies nested by `parent`. Wire post/reply/react to the service.
- **Acceptance criteria**:
  - **Given** an epic/initiative detail, **When** a member posts an `AT_RISK` update, **Then** the chip + body render and the service is called with the status.
  - **Given** an update, **When** a member replies and reacts, **Then** the reply nests under the parent and the reaction toggles.
  - **Edge case**: the same actor cannot add a duplicate reaction (server rejects; UI reflects single reaction).
- **Verify**: `pnpm --filter web exec vitest run ce/components/status-updates/status-update-thread.test.tsx` ; `pnpm turbo run check:types --filter=web`.
- **Done when**: status-update thread renders in both detail views with chips/replies/reactions, tests + type check green.

---

## TASK-26 — AI NLQ `/copilot/query/` endpoint (fail-closed, scoped evidence)

- **Implements**: EPIC-7. **Depends on**: TASK-9 (epic data), TASK-19 (initiative data), TASK-24 (status updates as evidence). **Risk tier**: R1 (new contract; no schema). **Worktree isolation**: yes.
- **Context**: Extend copilot routing with `POST /api/workspaces/<slug>/copilot/query/`, body `{ "scope": "epic"|"initiative"|"workspace", "object_id": uuid?, "question": str }`, returning `{ "answer", "summary", "evidence": [...] }`. Reuse the existing pipeline in `apps/api/plane/app/views/copilot.py`: `is_llm_configured`, `get_llm_config`, `get_vertex_ai_config`, `COPILOT_MODES`, and the `allow_permission`/`ROLE` import pattern. NLQ requires the same scope membership as **reading** the target object. Evidence MUST be filtered to caller-readable objects only — an object the caller cannot read (e.g. another workspace's data) is excluded from evidence and never appears in the answer. When no provider is configured (`is_llm_configured` false), **fail closed** with a `409`/feature-disabled response. On provider outage/quota exhaustion, return a graceful AI-unavailable (503-style) response — never block manual viewing. Never log raw prompts/responses containing secrets; never include API keys/tokens/other-workspace data in prompts. NLQ is NOT exposed over the v1 api-key surface.
- **Files**: add the endpoint to `apps/api/plane/app/views/copilot.py` (new `CopilotQueryEndpoint`); add URL (extend the copilot urlconf in `apps/api/plane/app/urls/`); test `apps/api/plane/tests/contract/app/test_copilot_query.py`.
- **TDD — failing test first**: `test_copilot_query.py` (mock the LLM call):
  - `test_epic_scope_returns_answer_summary_evidence_from_readable_objects` (with provider configured, mocked LLM).
  - `test_evidence_excludes_unreadable_objects` (an object the caller cannot read never appears in evidence/answer).
  - `test_fail_closed_when_llm_not_configured_returns_409` (patch `is_llm_configured` → False).
  - `test_provider_outage_returns_503_graceful` (mocked provider raises → 503-style; not a crash).
  - `test_non_member_of_scope_rejected` (same gating as reading the object).
  All FAIL initially.
- **Implementation outline**: Validate scope/object_id; resolve the target with the caller's read permissions; build the evidence set from epic/initiative data + readable status updates (TASK-24), filtering to caller-readable objects. If `is_llm_configured()` is False, return 409 feature-disabled. Otherwise call the provider via `get_llm_config`/`get_vertex_ai_config`; wrap the provider call so timeouts/quota errors return a 503-style graceful response. Return `{answer, summary, evidence}`. Do not log secrets.
- **Acceptance criteria**:
  - **Given** a configured provider, **When** a member who can read an epic POSTs a scoped question, **Then** the response has `answer`, `summary`, and `evidence` drawn only from caller-readable objects.
  - **Given** evidence would include an unreadable object, **Then** it is excluded and never appears in the answer.
  - **Given** `is_llm_configured` false, **Then** 409 feature-disabled (fail closed).
  - **Given** a provider timeout/quota error, **Then** a graceful 503-style response; manual viewing unaffected.
  - **Given** a non-member of the target scope, **Then** rejected with the same gating as reading the object.
- **Verify**: `docker compose -f docker-compose-test.yml run --rm api-tests pytest plane/tests/contract/app/test_copilot_query.py -m contract`.
- **Done when**: scoped answer/summary/evidence, evidence filtering, fail-closed 409, graceful 503, and scope-gating tests all green; no secret logging; not exposed over v1.

---

## TASK-27 — AI NLQ "Ask AI / Summarize" affordance (epic + initiative headers)

- **Implements**: EPIC-7. **Depends on**: TASK-26 (endpoint), TASK-4 (epic detail header), TASK-22 (initiative detail header). **Risk tier**: R2. **Worktree isolation**: no.
- **Context**: Add an "Ask AI / Summarize progress" action to the epic and initiative detail headers, wired to `POST /api/workspaces/<slug>/copilot/query/` (TASK-26). When the provider is unconfigured (the endpoint returns 409 feature-disabled), render a **disabled** state with a "configure AI provider" hint rather than an error toast. On a graceful 503 (provider outage), show an "AI unavailable" message without blocking manual viewing. Extend a service (`EpicService`/`InitiativeService` or a small `CopilotService`) with a `query({scope, object_id, question})` method.
- **Files**: components under `apps/web/ce/components/copilot/` (e.g. `ask-ai-action.tsx`); extend the relevant service (+ test); test `apps/web/ce/components/copilot/ask-ai-action.test.tsx`.
- **TDD — failing test first**: `ask-ai-action.test.tsx`:
  - `it("submits a scoped question and renders answer + summary on success")`.
  - `it("renders a disabled 'configure AI provider' state when the endpoint returns 409")`.
  - `it("renders an 'AI unavailable' message (no crash) on 503 without blocking the view")`.
  All FAIL initially.
- **Implementation outline**: Action button opens a prompt input; submit calls the service `query` with the detail object's scope/id; render `answer`+`summary`; handle 409 → disabled hint, 503 → unavailable message. No error toast for the unconfigured case.
- **Acceptance criteria**:
  - **Given** a configured provider, **When** a member asks a scoped question, **Then** answer + summary render.
  - **Given** the endpoint returns 409, **Then** the affordance shows a disabled "configure AI provider" state (no error toast).
  - **Given** a 503, **Then** an "AI unavailable" message renders and manual viewing is unaffected.
- **Verify**: `pnpm --filter web exec vitest run ce/components/copilot/ask-ai-action.test.tsx` ; `pnpm turbo run check:types --filter=web`.
- **Done when**: affordance works on both detail headers with configured/409/503 handling; tests + type check green.

---

## Execution order & parallelism

Build order follows PRD Milestones M1–M7 / EPIC-1…EPIC-7. Each task is ~1 PR. Tasks in the same batch with overlapping files run in **separate worktrees** and merge in dependency order.

**Text dependency graph:**

```
TASK-1 (flags OFF) ─┐
TASK-2 (EpicService)─┼─> TASK-3 (epic store) ─> TASK-4 (epic modal) ─> TASK-5 (epic route, gated)
                     │
        EPIC-1 frontend foundation (all R2; epics flag stays OFF)

TASK-9 (epic CRUD+authz) ─┬─> TASK-10 (progress)
                          ├─> TASK-11 (bulk-attach)
                          ├─> TASK-12 (convert)        [R0 if untested]
                          └─> TASK-13 (duplicate)      [R0 if untested]
                                   └────────────> TASK-14 (v1 parity + flip epics ON)
        EPIC-2 epic backend (R1)

TASK-15 (property models+migration) ─> TASK-16 (property API) ─> TASK-17 (property fields UI)
        EPIC-3 epic custom properties (R1 schema)   [branches off TASK-9; parallel with EPIC-4]

TASK-18 (initiative models+migration) ─> TASK-19 (initiative API) ─> TASK-20 (v1 parity)
        EPIC-4 initiatives backend (R1 schema; initiatives flag added OFF in TASK-1)
        (TASK-19 depends on TASK-10 for epic-progress rollup)

TASK-21 (initiative store/service/types/constants) ─> TASK-22 (initiative route/board/detail + flip initiatives ON)
        EPIC-5 initiatives UI (R2)

TASK-23 (status-update models+migration) ─> TASK-24 (status-update API) ─> TASK-25 (status-update UI)
        EPIC-6 structured status updates (R1 schema)
        (TASK-23 depends on TASK-18; TASK-24 depends on TASK-9 + TASK-19; TASK-25 depends on TASK-4 + TASK-22)

TASK-26 (copilot/query endpoint) ─> TASK-27 (Ask AI affordance)
        EPIC-7 AI NLQ (R1, no schema, fail-closed)
        (TASK-26 depends on TASK-9 + TASK-19 + TASK-24; TASK-27 depends on TASK-4 + TASK-22)
```

**Critical path:** TASK-1/2 → TASK-3 → TASK-4 → TASK-5 (EPIC-1), then TASK-9 → TASK-10 → TASK-14 (EPIC-2 flip), → TASK-18 → TASK-19 (EPIC-4), → (EPIC-5 TASK-21/22 ‖ EPIC-6 TASK-23/24/25), → TASK-26 → TASK-27 (EPIC-7).

**Parallel batches (each task in its own worktree):**
- **Batch A — EPIC-1 foundation, runs first.** TASK-1 and TASK-2 in parallel (independent). Then TASK-3 → TASK-4 → TASK-5 serially (each depends on the prior). All R2, `epics` flag OFF — safe to land before any backend.
- **Batch B — EPIC-2 epic backend, after Batch A merges.** TASK-9 first (foundation). Then TASK-10, TASK-11, TASK-12, TASK-13 run in **parallel worktrees** (each depends only on TASK-9; they touch overlapping `urls/epic.py` + epic views, so isolate and merge sequentially). TASK-14 last (depends on all four + flips `epics` ON). TASK-12/TASK-13 are R0 if their conversion/remap paths land without test coverage — STOP for sign-off.
- **Batch C — EPIC-3 ‖ EPIC-4, after Batch B's TASK-9/TASK-10 merge.** EPIC-3 chain (TASK-15 → TASK-16 → TASK-17) and EPIC-4 chain (TASK-18 → TASK-19 → TASK-20) run as two parallel tracks in separate worktrees (TASK-19 needs TASK-10's epic-progress rollup; both schema tracks are additive and independent). Two additive migrations — sequence their migration numbers to avoid collisions on merge.
- **Batch D — EPIC-5 ‖ EPIC-6, after EPIC-4 backend merges.** EPIC-5 UI chain (TASK-21 → TASK-22, flips `initiatives` ON) in parallel with EPIC-6 chain (TASK-23 → TASK-24 → TASK-25). TASK-24 needs TASK-9 + TASK-19; TASK-25 needs the detail views from TASK-4 + TASK-22 (sequence TASK-25 after TASK-22).
- **Batch E — EPIC-7, last.** TASK-26 (needs epic/initiative/status-update data) → TASK-27 (needs both detail headers). Serial.

Migration-number sequencing note: TASK-15, TASK-18, and TASK-23 each add migrations under `apps/api/plane/db/migrations/`. When their batches run in parallel worktrees, assign non-colliding migration numbers and rebase/regenerate the dependency chain before merge so Django's migration graph stays linear.
