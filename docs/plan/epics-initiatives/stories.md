# Epics & Initiatives — User Stories

> Decomposes [`docs/prd-epics-initiatives-2026-06-07.md`](./prd-epics-initiatives-2026-06-07.md) and [`docs/plan/epics-initiatives/epics.md`](./plan/epics-initiatives/epics.md) into implementable user stories. Story IDs group under their parent epic (`EPIC-1`…`EPIC-7`, aligned 1:1 with PRD Milestones M1–M7).
>
> **Conventions.** Acceptance criteria are Given/When/Then and always include an authorization-failure path and an empty/edge path. TDD-first: each story is small enough that the first failing test is obvious from its first acceptance criterion. All reads/writes are workspace-/project-scoped and permission-checked server-side (`allow_permission`/`ROLE`, `WorkspaceViewerPermission`). New schema is additive only with forward + reverse migrations. Features gate behind `epics`/`initiatives` in `apps/web/ce/lib/self-host-entitlements.ts`. Backend = Django/DRF in `apps/api/plane/{db,app,api}`; frontend = React Router 7 + MobX in `apps/web/{core,ce}`; shared = `@plane/{types,services,ui,constants}`.
>
> **Roles referenced:** *workspace admin*, *project lead*, *project member*, *guest*, *viewer*. Epic writes require project member with edit role; epic reads require project viewer. Initiative writes require workspace Admin/Member; initiative reads require Workspace Viewer.

---

## EPIC-1 — Epic management frontend foundation (store, modal, route)

### EI-1.1 (epic EPIC-1) — Add `epics`/`initiatives` entitlement flags and resolver coverage

**Story**
As a workspace admin, I want `epics` and `initiatives` self-host feature flags to exist and resolve through the existing entitlement resolver so that every later epic can gate its surface behind a single, instant kill switch.

**Acceptance criteria**
- **Given** `SELF_HOSTED_FEATURE_FLAGS` in `apps/web/ce/lib/self-host-entitlements.ts`, **When** the module is loaded, **Then** it exposes an `epics` key and an `initiatives` key, both shipped `false` in this story, and `TSelfHostedFeatureFlag` picks both up automatically (no manual type edit).
- **Given** the Vitest suite `self-host-entitlements.test.ts`, **When** it calls `isSelfHostedFeatureEnabled("epics")` and `isSelfHostedFeatureEnabled("initiatives")`, **Then** both resolve to the configured boolean without throwing.
- **Given** an unknown flag string is passed to `isSelfHostedFeatureEnabled`, **When** TypeScript is type-checked, **Then** the call is a compile error (the union type rejects non-member keys).

**Size** S
**Priority** P0
**Depends on** []

### EI-1.2 (epic EPIC-1) — `EpicService` typed client in `packages/services`

**Story**
As a project member, I want a typed `EpicService` that mirrors existing service conventions so that the store and modal can call epic endpoints through one tested contract instead of ad-hoc fetches.

**Acceptance criteria**
- **Given** `EpicService` in `packages/services`, **When** `create`, `list`, `retrieve`, `update`, and `destroy` are invoked, **Then** each issues a request to the EPIC-2 session path shape (`/api/workspaces/<slug>/projects/<projectId>/epics/...`) with the typed payload/response from `@plane/types`.
- **Given** the EPIC-2 endpoints are not yet live (flag `false`), **When** `EpicService` is unit-tested, **Then** its request building and response parsing are verified in isolation against a mocked transport (no live network).
- **Given** the API returns a 403/empty body, **When** `EpicService.list` resolves, **Then** the error is surfaced to the caller (rejected promise) and an empty list is never silently fabricated.

**Size** M
**Priority** P0
**Depends on** [EI-1.1]

### EI-1.3 (epic EPIC-1) — Real epic MobX store (remove `@ts-nocheck`)

**Story**
As a project member, I want a functional epic store so that epic data loads, caches, and updates reactively in the UI like work items do.

**Acceptance criteria**
- **Given** `apps/web/ce/store/issue/epic/issue.store.ts`, **When** the file is type-checked, **Then** there is no `@ts-nocheck` and no "this class will never be used" placeholder, and the store compiles under strict typing.
- **Given** the store is instantiated and `fetchEpics(workspaceSlug, projectId)` is called, **When** `EpicService.list` resolves, **Then** the store holds the returned epics in an observable map keyed by id and exposes them to observers.
- **Given** a create succeeds via the store, **When** the response returns, **Then** the new epic is added to the observable map without a full refetch (optimistic-consistent state).
- **Given** `EpicService.list` rejects, **When** `fetchEpics` runs, **Then** the store records an error state and does not leave a partially-populated map.

**Size** M
**Priority** P0
**Depends on** [EI-1.2]

### EI-1.4 (epic EPIC-1) — Persisted epic filter store across layout switches

**Story**
As a project member, I want my epic list filters to survive switching between list, kanban, and gantt so that I do not lose context every time I change the view.

**Acceptance criteria**
- **Given** `apps/web/ce/store/issue/epic/filter.store.ts` with a filter applied in the list layout, **When** the user switches to kanban and back, **Then** the same filter is still active (filter state retained across the switch).
- **Given** no filters are set, **When** a layout renders, **Then** the unfiltered full epic set is shown (empty-filter path returns all, not none).
- **Given** a filter references a value that no longer exists (e.g., a deleted label), **When** the layout re-renders, **Then** the stale filter is ignored gracefully without crashing the view.

**Size** M
**Priority** P1
**Depends on** [EI-1.3]

### EI-1.5 (epic EPIC-1) — Functional create/update epic modal

**Story**
As a project member, I want a working epic create/update modal built on the existing issue-create form so that I can capture an epic's name, lead, description, and timeline.

**Acceptance criteria**
- **Given** the epic modal is opened (replacing the `<></>` stub in `apps/web/ce/components/epics/epic-modal/modal.tsx`), **When** a member fills name, lead (assignee), description, start date, and target date and submits, **Then** the modal calls `EpicService.create` with the typed payload and closes on success.
- **Given** `isProjectSelectionDisabled` is true, **When** the modal renders, **Then** the project selector is locked to the current project and not user-editable.
- **Given** the required name field is empty, **When** the member submits, **Then** the modal blocks submission with an inline validation message and does not call the service.
- **Given** description rich text is entered, **When** the payload is built, **Then** the modal sends raw HTML to the server for sanitization and never marks the entered HTML as trusted client-side.

**Size** M
**Priority** P0
**Depends on** [EI-1.3]

### EI-1.6 (epic EPIC-1) — Project epics route + empty state gated on `epics`

**Story**
As a project member, I want a project-level epics route that mounts the existing layouts so that I can browse epics the same way I browse work items.

**Acceptance criteria**
- **Given** the `epics` entitlement flag is `false`, **When** a user navigates to `apps/web/app/(all)/[workspaceSlug]/(projects)/projects/[projectId]/epics/`, **Then** the empty-state (reusing `apps/web/app/assets/empty-state/epics`) with an "Enable epics in project settings" CTA renders and no live epic data is requested.
- **Given** the `epics` flag is `true` and epics exist, **When** the route loads, **Then** the list/kanban/gantt layouts mount via `base-timeline.store.ts`, parameterized for epics (not forked).
- **Given** a user without project viewer access (guest with no project membership), **When** they hit the route, **Then** the route does not request or display epic data for that project.
- **Given** the flag is `true` but the project has zero epics, **When** the route loads, **Then** an empty list state renders with a create-epic affordance and no error.

**Size** M
**Priority** P0
**Depends on** [EI-1.1, EI-1.3, EI-1.5]

---

## EPIC-2 — Epic backend: progress, bulk-attach, convert, duplicate

### EI-2.1 (epic EPIC-2) — Epic CRUD session endpoints (`is_epic`-filtered)

**Story**
As a project member, I want create/read/update/delete epic endpoints so that epics persist as `is_epic`-typed Issues scoped to my workspace and project.

**Acceptance criteria**
- **Given** a project member with edit role, **When** they `POST /api/workspaces/<slug>/projects/<project_id>/epics/` with name, lead, and timeline, **Then** an Issue is created with an `is_epic` IssueType and returned; `GET .../epics/` lists only `is_epic` Issues for that project, paginated (`results`/`count`).
- **Given** a project viewer (read-only) token, **When** they `POST`/`PATCH`/`DELETE` an epic, **Then** the request is rejected with 403; **and** a viewer `GET` succeeds.
- **Given** a non-member of the project, **When** they call any epic endpoint, **Then** 403.
- **Given** a `slug`/`project_id` from a different workspace than the caller's membership, **When** any epic endpoint is called, **Then** the queryset filters by `workspace__slug` + `project_id` and returns 403/404 (no cross-tenant leakage).
- **Given** description HTML is submitted, **When** the epic persists, **Then** `_stripped` is `strip_tags(html)` and the HTML is server-side sanitized before save (stored-XSS prevented).

**Size** L
**Priority** P0
**Depends on** [EI-1.2]

### EI-2.2 (epic EPIC-2) — Epic progress rollup endpoint

**Story**
As a project member, I want an epic progress endpoint so that I can see completion as a rollup of its child work items' states.

**Acceptance criteria**
- **Given** an epic with N child work items across state groups, **When** a viewer `GET`s `.../epics/<epic_id>/progress/`, **Then** the response returns counts grouped by state group and a percent-complete computed via annotate-based aggregation (modeled on `WorkspaceCyclesEndpoint`).
- **Given** an epic with zero work items, **When** progress is requested, **Then** percent-complete is `0` with no divide-by-zero error.
- **Given** a non-viewer of the project, **When** they request progress, **Then** 403.
- **Given** a child work item is soft-deleted, **When** progress recomputes, **Then** the deleted child is excluded from both counts and the denominator.

**Size** M
**Priority** P0
**Depends on** [EI-2.1]

### EI-2.3 (epic EPIC-2) — Bulk-attach work items (one-epic-per-item)

**Story**
As a project member, I want to attach many work items to an epic in one request so that I can bundle a backlog without per-item edits, while never silently moving an item out of another epic.

**Acceptance criteria**
- **Given** unattached work items, **When** a member `POST`s `.../epics/<epic_id>/work-items/` with `{ "issue_ids": [...] }`, **Then** each item's `parent` is set to the epic and the change is recorded in issue activity.
- **Given** a work item already parented to another epic, **When** bulk-attach is called without the explicit reparent flag, **Then** it is rejected with a clear error and no items are moved (one-epic-per-item enforced).
- **Given** the same already-parented item and the explicit reparent flag set, **When** bulk-attach runs, **Then** the item is reparented to the new epic and the reparent is written to activity.
- **Given** a project viewer (read-only) token, **When** they call bulk-attach, **Then** 403.
- **Given** an empty `issue_ids` array, **When** bulk-attach is called, **Then** it returns a no-op success (no error, nothing changed).
- **Given** an `issue_id` belonging to a different project/workspace, **When** bulk-attach runs, **Then** it is rejected with 400 (no cross-tenant parenting).

**Size** M
**Priority** P0
**Depends on** [EI-2.1]

### EI-2.4 (epic EPIC-2) — Convert epic ↔ standard work item with child-reparenting

**Story**
As a project lead, I want to convert an epic to a standard work item (and a work item to an epic) so that I can correct mis-classified hierarchy without losing or orphaning children silently.

**Acceptance criteria**
- **Given** an epic with children, **When** a lead `POST`s `.../epics/<epic_id>/convert/` with `{ "target_issue_type_id": ... }`, **Then** the type flips to the target non-epic type, children are reparented per the recorded policy (to the epic's parent or null), and the conversion + reparenting is written to issue activity (no silent child loss).
- **Given** a standard work item, **When** `.../work-items/<issue_id>/convert-to-epic/` is called, **Then** the item's type becomes an `is_epic` type and the change is logged.
- **Given** a project viewer (read-only) token, **When** they call either convert endpoint, **Then** 403; **and** a non-member, **Then** 403.
- **Given** a `target_issue_type_id` that is itself an epic type (for epic→work-item), **When** convert runs, **Then** it is rejected with 400 (target must be non-epic).
- **Given** an epic with zero children, **When** it is converted, **Then** conversion succeeds with no reparenting step and is still logged.

**Size** L
**Priority** P0
**Depends on** [EI-2.1, EI-2.3]

### EI-2.5 (epic EPIC-2) — Duplicate epic across project/workspace with remap

**Story**
As a project member, I want to duplicate an epic (optionally its subtree) into another project or workspace so that I can reuse a structure, with states/labels/members re-resolved in the target rather than carrying source-tenant IDs.

**Acceptance criteria**
- **Given** an epic, **When** a member `POST`s `.../epics/<epic_id>/duplicate/` with `{ "target_project_id"?, "target_workspace_slug"?, "include_subtree": true }`, **Then** a new epic (and its subtree when requested) is created in the target and a remap summary of states/labels/members is returned.
- **Given** duplication into another workspace with a missing target state/label/member, **When** duplication runs, **Then** it falls back to target defaults, the remap summary reports the fallbacks, and no source-tenant IDs appear in the target rows.
- **Given** a caller who is not a member of the target project/workspace, **When** duplicate is called, **Then** 403; **and** a target slug in a workspace the caller cannot access, **Then** 400/403 (no cross-tenant write).
- **Given** `include_subtree: false`, **When** duplication runs, **Then** only the epic is copied and no child work items are created in the target.

**Size** L
**Priority** P1
**Depends on** [EI-2.1, EI-2.4]

### EI-2.6 (epic EPIC-2) — api-key v1 epic parity (list/create/detail)

**Story**
As an integration developer, I want v1 api-key epic endpoints with the same role enforcement so that automation can read and create epics without weaker auth than the session routes.

**Acceptance criteria**
- **Given** a v1 api key scoped to a workspace, **When** it calls `GET|POST /api/v1/workspaces/<slug>/projects/<project_id>/epics/` and detail, **Then** the same `is_epic`-filtered list/create/detail behavior as the session routes applies.
- **Given** a v1 key whose member lacks project edit role, **When** it `POST`s an epic, **Then** 403 (identical gating to session routes).
- **Given** a v1 key for a different workspace, **When** it targets this workspace's epics, **Then** 403/404 (no cross-tenant access).
- **Given** the v1 surface, **When** any NLQ-style path is requested, **Then** it is not exposed (AI NLQ is session-only in this milestone).

**Size** M
**Priority** P1
**Depends on** [EI-2.1]

### EI-2.7 (epic EPIC-2) — Flip `epics` flag to `true` after contract tests pass

**Story**
As a workspace admin, I want the `epics` flag enabled once the backend is fully tested so that the project epics route serves live data.

**Acceptance criteria**
- **Given** all EPIC-2 contract tests pass, **When** `epics` is set `true` in `SELF_HOSTED_FEATURE_FLAGS`, **Then** the project epics route (EI-1.6) loads live epic data from the session endpoints.
- **Given** the flag is flipped `true`, **When** the entitlement test runs, **Then** `isSelfHostedFeatureEnabled("epics")` returns `true`.
- **Given** an incident, **When** `epics` is set back to `false`, **Then** the route reverts to the empty-state with no redeploy and no data loss (instant kill switch).

**Size** S
**Priority** P0
**Depends on** [EI-2.1, EI-2.2, EI-2.3, EI-2.4, EI-2.5]

---

## EPIC-3 — Epic custom properties (text / dropdown / member)

### EI-3.1 (epic EPIC-3) — `IssueProperty`/`IssuePropertyOption`/`IssuePropertyValue` models + migration

**Story**
As a project lead, I want additive models for epic-scoped custom properties so that teams can define structured metadata without altering existing issue tables.

**Acceptance criteria**
- **Given** the new models in `apps/api/plane/db/models/issue_property.py`, **When** the forward migration runs, **Then** three new tables are created (FKs: `IssueProperty.issue_type`/`workspace`, `IssuePropertyOption.IssueProperty`, `IssuePropertyValue.Issue`/`IssueProperty`) with no change to `issues`/`issue_types`.
- **Given** an `IssuePropertyValue` row already exists for an `(issue, property, value)` with `deleted_at` null, **When** a duplicate is inserted, **Then** the partial `UniqueConstraint(... condition=Q(deleted_at__isnull=True))` rejects it.
- **Given** the forward migration is applied then reversed (`migrate <app> <prev>`), **When** the reverse runs, **Then** the three tables drop with zero impact on existing `issues`/`issue_types` rows (additive-only verified).
- **Given** a property of type `option` with `is_multi=false`, **When** two option values are written for one issue, **Then** the model/serializer rejects the second (single-select enforced).

**Size** L
**Priority** P1
**Depends on** [EI-2.1]

### EI-3.2 (epic EPIC-3) — Property definition CRUD API (text/option/member)

**Story**
As a project lead, I want to define text, dropdown (single/multi), and member properties on the epic IssueType so that I can shape the metadata my team captures per epic.

**Acceptance criteria**
- **Given** an epic IssueType, **When** a member with project edit role `POST`s `GET|POST /api/workspaces/<slug>/issue-types/<type_id>/properties/` defining a `text`, a multi `option` (with `.../properties/<pk>/options/`), and a `member` property, **Then** all three persist with correct `property_type`/`is_multi`.
- **Given** a project viewer (read-only) token, **When** they create or edit a property definition, **Then** 403; **and** a non-member, **Then** 403.
- **Given** a property definition whose `workspace` differs from the IssueType's workspace, **When** it is created, **Then** it is rejected with 400 (workspace-scoped).
- **Given** an `option` property created with zero options, **When** a value is later required, **Then** the API surfaces a clear "no options defined" validation error rather than a server error.

**Size** M
**Priority** P1
**Depends on** [EI-3.1]

### EI-3.3 (epic EPIC-3) — Per-epic property value CRUD with validation

**Story**
As a project member, I want to set and edit property values on an epic so that the structured metadata is captured and re-renders on reload.

**Acceptance criteria**
- **Given** an epic with defined properties, **When** a member `POST`s `.../epics/<epic_id>/property-values/` setting a text value, two options on a multi-option property, and a member, **Then** the values persist and re-render on reload.
- **Given** a `member` property value, **When** the `value_uuid` is not a member of the owning workspace, **Then** the API rejects it with 400 (member references validated).
- **Given** an `is_required` property with no value, **When** the epic is saved, **Then** the API rejects with a validation error.
- **Given** a project viewer (read-only) token, **When** they set a property value, **Then** 403.
- **Given** a `value_text` containing HTML, **When** it persists, **Then** it is sanitized consistent with issue text handling (no stored XSS).

**Size** M
**Priority** P1
**Depends on** [EI-3.1, EI-3.2]

### EI-3.4 (epic EPIC-3) — Epic detail-view property fields

**Story**
As a project member, I want to define and edit custom properties from the epic detail view so that I do not need API access to use structured metadata.

**Acceptance criteria**
- **Given** an epic with defined `text`/`option`/`member` properties, **When** the detail view renders, **Then** each property appears with the correct input (text box, single/multi select, member picker) reusing the EPIC-1 modal/detail components.
- **Given** a member edits a value in the detail view, **When** they save, **Then** the value persists via the EI-3.3 endpoint and re-renders.
- **Given** the `epics` flag is `false`, **When** the detail view is unreachable (route gated), **Then** no property API calls are made.
- **Given** a multi-option property with no selection, **When** the view renders, **Then** an empty (not error) state shows and saving an optional empty value succeeds.

**Size** M
**Priority** P2
**Depends on** [EI-1.5, EI-3.3]

---

## EPIC-4 — Initiatives model + API + workspace aggregation

### EI-4.1 (epic EPIC-4) — `Initiative` + join-table models + migration

**Story**
As a workspace admin, I want additive Initiative models so that initiatives, their epic/project membership, and labels persist without touching existing tables.

**Acceptance criteria**
- **Given** the new models in `apps/api/plane/db/models/initiative.py`, **When** the forward migration runs, **Then** `Initiative` (with `state` choices `DRAFT`/`PLANNED`/`ACTIVE`/`COMPLETED`/`CLOSED` default `DRAFT`, `workspace` FK `related_name="initiatives"`, `progress_snapshot` JSON) and `InitiativeEpic`/`InitiativeProject`/`InitiativeLabel` join tables are created with partial unique constraints (`condition=Q(deleted_at__isnull=True))`.
- **Given** an `InitiativeEpic` row referencing a non-`is_epic` Issue, **When** it is created, **Then** it is rejected (membership requires an `is_epic` Issue).
- **Given** the forward migration is applied then reversed, **When** the reverse runs, **Then** all new tables drop with zero impact on existing data; constraints are present while applied.
- **Given** an initiative created with no explicit state, **When** it persists, **Then** `state` defaults to `DRAFT`.

**Size** L
**Priority** P0
**Depends on** [EI-2.2]

### EI-4.2 (epic EPIC-4) — Initiative CRUD endpoints (Workspace-scoped, role-gated)

**Story**
As a workspace member, I want create/read/update/delete initiative endpoints so that I can manage workspace-level initiatives with correct role gating.

**Acceptance criteria**
- **Given** a Workspace Member, **When** they `POST /api/workspaces/<slug>/initiatives/` with name and `state`, **Then** the initiative persists and is returned; `GET|PATCH|DELETE .../initiatives/<pk>/` operate within the workspace.
- **Given** a Workspace Viewer (read-only), **When** they `POST`/`PATCH`/`DELETE` an initiative, **Then** rejected; **and** a viewer `GET` succeeds (`WorkspaceViewerPermission`).
- **Given** a non-member of the workspace, **When** they call any initiative endpoint, **Then** rejected.
- **Given** another workspace's `slug`, **When** the caller queries, **Then** the queryset filters by `workspace__slug` and returns no cross-tenant initiatives.
- **Given** `description_html` is submitted, **When** the initiative persists, **Then** it is sanitized on persist via the same path as `IssueComment` (stored-XSS prevented).

**Size** L
**Priority** P0
**Depends on** [EI-4.1]

### EI-4.3 (epic EPIC-4) — Attach/detach epic & project members (same-workspace validated)

**Story**
As a workspace member, I want to attach and detach epics and projects to an initiative so that an initiative aggregates the right work, while cross-workspace references are blocked.

**Acceptance criteria**
- **Given** an initiative, **When** a member `POST`s `.../initiatives/<initiative_id>/epics/` and `.../projects/`, **Then** `InitiativeEpic`/`InitiativeProject` rows persist; `DELETE` soft-detaches them.
- **Given** an epic or project from a different workspace, **When** a member attempts to attach it, **Then** the request is rejected with `400` (same-workspace validated server-side).
- **Given** a Workspace Viewer (read-only), **When** they attach/detach members, **Then** rejected; **and** a non-member, **Then** rejected.
- **Given** an already-attached epic, **When** it is attached again, **Then** the partial unique constraint prevents a duplicate active row (idempotent attach).

**Size** M
**Priority** P0
**Depends on** [EI-4.2]

### EI-4.4 (epic EPIC-4) — Initiative progress rollup endpoint

**Story**
As a workspace lead, I want aggregated initiative progress so that I can see one rollup number across member epics and projects, skipping members that no longer qualify.

**Acceptance criteria**
- **Given** an initiative with two epics and one project, **When** a viewer `GET`s `.../initiatives/<initiative_id>/progress/`, **Then** the response aggregates epic progress (EPIC-2) with project progress via annotate-based rollup.
- **Given** a member epic later converted to a standard work item or soft-deleted, **When** progress recomputes, **Then** that member is skipped and the `InitiativeEpic` soft-delete cascade-cleans (no error, no stale member).
- **Given** an initiative with zero members, **When** progress is requested, **Then** it returns 0% with no divide-by-zero.
- **Given** a non-viewer of the workspace, **When** they request progress, **Then** rejected.

**Size** M
**Priority** P0
**Depends on** [EI-4.2, EI-4.3]

### EI-4.5 (epic EPIC-4) — Workspace initiatives-summary aggregation endpoint

**Story**
As a workspace lead, I want a workspace-level initiatives summary grouped by lifecycle state so that I can scan portfolio health at a glance.

**Acceptance criteria**
- **Given** initiatives across the five lifecycle states, **When** a viewer `GET`s `/api/workspaces/<slug>/initiatives-summary/`, **Then** initiatives return grouped by their `DRAFT`/`PLANNED`/`ACTIVE`/`COMPLETED`/`CLOSED` state with progress annotations (mirrors `WorkspaceCyclesEndpoint`).
- **Given** a workspace with no initiatives, **When** the summary is requested, **Then** an empty grouped structure is returned (no error).
- **Given** a non-viewer of the workspace, **When** they request the summary, **Then** rejected.
- **Given** another workspace's `slug`, **When** queried, **Then** only the requesting workspace's initiatives appear (no cross-tenant leakage).

**Size** M
**Priority** P1
**Depends on** [EI-4.2, EI-4.4]

### EI-4.6 (epic EPIC-4) — api-key v1 initiative parity (list/create/detail)

**Story**
As an integration developer, I want v1 api-key initiative endpoints with the same role enforcement so that automation can manage initiatives without weaker auth.

**Acceptance criteria**
- **Given** a v1 api key, **When** it calls `GET|POST /api/v1/workspaces/<slug>/initiatives/` and detail, **Then** the same CRUD behavior as session routes applies with `WorkspaceViewer`/Member/Admin gating.
- **Given** a v1 key whose member lacks workspace write role, **When** it `POST`s an initiative, **Then** rejected (identical gating).
- **Given** a v1 key for a different workspace, **When** it targets this workspace, **Then** rejected (no cross-tenant access).
- **Given** the v1 surface, **When** NLQ is requested, **Then** it is not exposed.

**Size** M
**Priority** P2
**Depends on** [EI-4.2]

---

## EPIC-5 — Initiatives UI (store, route, layouts, detail)

### EI-5.1 (epic EPIC-5) — Initiative types, `InitiativeService`, constants/i18n

**Story**
As a frontend developer, I want shared initiative types, a service, and lifecycle/status labels so that the UI consumes EPIC-4 endpoints through one tested contract.

**Acceptance criteria**
- **Given** `@plane/types`, **When** initiative types are added, **Then** they model the five lifecycle states and the EPIC-4 payloads/responses; lifecycle-state and status labels live in `@plane/constants`/`@plane/i18n`.
- **Given** `InitiativeService` in `packages/services`, **When** `list`/`create`/`retrieve`/`update`/`destroy`/`attach`/`detach`/`progress`/`summary` are invoked, **Then** each calls the corresponding EPIC-4 path with the typed contract.
- **Given** an API error response, **When** any `InitiativeService` method runs, **Then** the error is surfaced to the caller (no fabricated empty success).
- **Given** the five lifecycle constants, **When** referenced, **Then** they are a single source of truth (board columns and detail chips both read from it, no duplication).

**Size** M
**Priority** P0
**Depends on** [EI-4.2]

### EI-5.2 (epic EPIC-5) — Initiative MobX store

**Story**
As a workspace member, I want an initiative store so that initiative data loads, caches, and updates reactively across views.

**Acceptance criteria**
- **Given** the store under `apps/web/ce/store/initiative/`, **When** `fetchInitiatives(workspaceSlug)` resolves, **Then** initiatives are held in an observable map keyed by id.
- **Given** an attach/detach succeeds, **When** the response returns, **Then** the membership and progress in the store update without a full page reload.
- **Given** `InitiativeService` rejects, **When** a fetch runs, **Then** the store records an error state and does not leave a partial map.
- **Given** the store mirrors existing store patterns, **When** type-checked, **Then** it compiles under strict typing with no `@ts-nocheck`.

**Size** M
**Priority** P0
**Depends on** [EI-5.1]

### EI-5.3 (epic EPIC-5) — Initiatives route + empty state gated on `initiatives`

**Story**
As a workspace member, I want a top-level initiatives route so that I can reach initiatives from the workspace, with the surface inert until the flag is on.

**Acceptance criteria**
- **Given** the `initiatives` flag is `false`, **When** a user navigates to `apps/web/app/(all)/[workspaceSlug]/(projects)/initiatives/`, **Then** the "Create your first initiative" empty-state renders and no live initiative data is requested.
- **Given** the `initiatives` flag is `true` and initiatives exist, **When** the route loads, **Then** the list/board/timeline layouts mount.
- **Given** a non-member of the workspace, **When** they hit the route, **Then** no initiative data is requested or displayed.
- **Given** the flag is `true` but the workspace has zero initiatives, **When** the route loads, **Then** an empty list state with a create affordance renders without error.

**Size** M
**Priority** P0
**Depends on** [EI-1.1, EI-5.2]

### EI-5.4 (epic EPIC-5) — Board/list/timeline with five lifecycle columns + persisted filters

**Story**
As a workspace lead, I want to see initiatives grouped by lifecycle state on a board, plus list and timeline views, so that I can manage the portfolio visually with filters that persist.

**Acceptance criteria**
- **Given** the `initiatives` flag is `true`, **When** a Workspace Viewer opens the route in board view, **Then** exactly five columns render for `DRAFT`/`PLANNED`/`ACTIVE`/`COMPLETED`/`CLOSED` and each initiative appears in its state column.
- **Given** a member applies a state/lead filter on the board and switches to timeline, **When** the layout re-renders, **Then** the filter persists across the switch (reusing the EPIC-1 persisted-filter approach).
- **Given** the timeline view, **When** the user changes zoom, **Then** week/month/quarter zoom works via the reused timeline store (not forked).
- **Given** a state column with zero initiatives, **When** the board renders, **Then** that column renders empty without error.

**Size** L
**Priority** P1
**Depends on** [EI-5.2]

### EI-5.5 (epic EPIC-5) — Initiative detail: progress card + members panel

**Story**
As a workspace member, I want an initiative detail view with a progress card and a members panel so that I can read live rollup and attach/detach epics and projects.

**Acceptance criteria**
- **Given** a member viewing an initiative detail, **When** they attach an epic and a project, **Then** the members panel updates and the progress card re-renders the new rollup.
- **Given** concurrent edits to membership while a detail view is open, **When** a conflicting write lands, **Then** the UI refetches (last-write-wins) without crashing.
- **Given** a Workspace Viewer (read-only), **When** they open detail, **Then** they can read progress/members but the attach/detach controls are disabled or rejected by the server.
- **Given** an initiative with zero members, **When** detail renders, **Then** the progress card shows 0% and the members panel shows an empty state.

**Size** L
**Priority** P1
**Depends on** [EI-5.2, EI-4.4]

### EI-5.6 (epic EPIC-5) — Flip `initiatives` flag to `true`

**Story**
As a workspace admin, I want the `initiatives` flag enabled once the UI is functional so that the initiatives surface goes live with an instant kill switch.

**Acceptance criteria**
- **Given** the EPIC-5 UI tests pass, **When** `initiatives` is set `true`, **Then** the initiatives route serves live data and the entitlement test resolves `true`.
- **Given** an incident, **When** `initiatives` is set back to `false`, **Then** the route reverts to the empty-state with no redeploy and no data loss.
- **Given** a workspace where AI is unconfigured, **When** the flag is flipped, **Then** the initiatives surface still works (the flag is independent of AI config).

**Size** S
**Priority** P0
**Depends on** [EI-5.3, EI-5.4, EI-5.5]

---

## EPIC-6 — Structured status updates (On Track / At Risk / Off Track)

### EI-6.1 (epic EPIC-6) — `StatusUpdate` + `StatusUpdateReaction` models + migration (XOR constraint)

**Story**
As a backend developer, I want additive status-update models with an epic-XOR-initiative invariant so that an update always belongs to exactly one owner without touching `issue_comments`.

**Acceptance criteria**
- **Given** the new models in `apps/api/plane/db/models/status_update.py`, **When** the forward migration runs, **Then** `StatusUpdate` (nullable `epic`/`initiative` FKs, `status` choices `ON_TRACK`/`AT_RISK`/`OFF_TRACK`, `comment_html`/`comment_stripped`/`comment_json`, self-FK `parent` `related_name="replies"`, `actor` FK) and `StatusUpdateReaction` are created with a `CheckConstraint` enforcing exactly one of `epic`/`initiative` set, and a partial unique constraint on reactions.
- **Given** a `StatusUpdate` write setting both `epic` and `initiative` (or neither), **When** it is saved, **Then** the `CheckConstraint` rejects it.
- **Given** a duplicate reaction by the same actor on the same update with `deleted_at` null, **When** inserted, **Then** the partial unique constraint rejects it (mirrors `CommentReaction`).
- **Given** the forward migration is applied then reversed, **When** the reverse runs, **Then** the new tables drop with zero impact on existing `issue_comments`; the constraints are present while applied.

**Size** L
**Priority** P0
**Depends on** [EI-2.1, EI-4.1]

### EI-6.2 (epic EPIC-6) — Status-update endpoints on epics & initiatives with threading

**Story**
As a project/workspace member, I want to post On Track / At Risk / Off Track updates with rich text and threaded replies on an epic or initiative so that status is structured and scannable.

**Acceptance criteria**
- **Given** an epic, **When** a project member `POST`s `.../epics/<epic_id>/status-updates/` with an `AT_RISK` status and rich-text body, **Then** it persists with `comment_html`/`comment_stripped`/`comment_json` set and `epic` FK populated (initiative FK null); `comment_html` is sanitized on persist.
- **Given** an initiative, **When** a workspace member `POST`s `.../initiatives/<initiative_id>/status-updates/`, **Then** it persists with `initiative` FK populated (epic FK null).
- **Given** a status update, **When** a member posts a reply, **Then** the reply attaches via `parent` and renders threaded.
- **Given** a non-member of the owning project/workspace, **When** they author a status update, **Then** rejected; reads require the matching viewer role.
- **Given** a request omitting `status`, **When** it is posted, **Then** it is rejected with a validation error (status is required and one of the three values).

**Size** M
**Priority** P0
**Depends on** [EI-6.1]

### EI-6.3 (epic EPIC-6) — Status-update reactions endpoint

**Story**
As a member, I want to add and remove emoji reactions on status updates so that the team can acknowledge status without adding noise replies.

**Acceptance criteria**
- **Given** a status update, **When** a member `POST`s `.../status-updates/<status_update_id>/reactions/`, **Then** a `StatusUpdateReaction` persists; `DELETE` removes it.
- **Given** the same actor reacts with the same emoji twice (active rows), **When** the second is posted, **Then** the partial unique constraint rejects it.
- **Given** a non-member of the owning scope, **When** they react, **Then** rejected.
- **Given** a reaction on a soft-deleted status update, **When** posted, **Then** it is rejected (no reactions on deleted updates).

**Size** S
**Priority** P1
**Depends on** [EI-6.1]

### EI-6.4 (epic EPIC-6) — Status-update thread UI in epic & initiative detail

**Story**
As a member, I want a status-update section in epic and initiative detail views so that I can post, reply to, and react to updates without leaving the object.

**Acceptance criteria**
- **Given** the epic detail view (EPIC-1) and initiative detail view (EPIC-5), **When** they render, **Then** a status-update section shows On Track / At Risk / Off Track chips, threaded replies, and emoji reactions reusing existing reaction components.
- **Given** a member posts an update with a status chip, **When** they submit, **Then** it appears in the thread via EI-6.2 and the chip reflects the chosen status.
- **Given** a Workspace/project Viewer (read-only), **When** they open the thread, **Then** they can read updates but cannot author or react (controls disabled or server-rejected).
- **Given** an epic/initiative with zero status updates, **When** the section renders, **Then** an empty "post the first update" state shows without error.

**Size** M
**Priority** P1
**Depends on** [EI-6.2, EI-6.3, EI-1.6, EI-5.5]

---

## EPIC-7 — AI NLQ + progress summarization (self-host, fail-closed)

### EI-7.1 (epic EPIC-7) — `/copilot/query/` NLQ endpoint with scoped, filtered evidence

**Story**
As a member, I want to ask a natural-language question about an epic, initiative, or the workspace and get an evidence-grounded answer plus a progress summary so that I can understand scope, blockers, ownership, and status quickly.

**Acceptance criteria**
- **Given** a configured LLM provider, **When** a member who can read an epic `POST`s `/api/workspaces/<slug>/copilot/query/` with `{ "scope": "epic", "object_id": <id>, "question": ... }`, **Then** the response returns `{ "answer", "summary", "evidence": [...] }` with evidence drawn only from objects the caller can read (reusing the `copilot.py` provider abstraction and EPIC-6 status updates as evidence).
- **Given** the evidence set would include an object the caller cannot read (e.g., a different workspace's data), **When** the query runs, **Then** that object is excluded from evidence and never appears in the answer or prompt.
- **Given** a non-member of the target's scope, **When** they call NLQ, **Then** rejected with the same gating as reading the object.
- **Given** any query, **When** the prompt is built and logged, **Then** it never includes API keys, tokens, or other workspaces' data, and raw secret-bearing prompts/responses are not logged.

**Size** L
**Priority** P1
**Depends on** [EI-2.2, EI-4.4, EI-6.2]

### EI-7.2 (epic EPIC-7) — Fail-closed and graceful-unavailable behavior

**Story**
As a workspace admin, I want NLQ to fail closed when no provider is configured and degrade gracefully on provider outage so that AI never blocks manual workflows.

**Acceptance criteria**
- **Given** no LLM provider is configured (`is_llm_configured` false), **When** the endpoint is called, **Then** it fails closed with a `409`/feature-disabled response (no partial answer, no provider call attempted).
- **Given** the provider is configured but times out or is quota-exhausted, **When** the query runs, **Then** the API returns a graceful AI-unavailable (503-style) response and does not block manual viewing of the epic/initiative.
- **Given** a non-member calls the endpoint while the provider is down, **When** the request is processed, **Then** authorization is still enforced (the 403 path is independent of provider availability).
- **Given** a malformed body (missing `scope` or invalid `scope`), **When** posted, **Then** it is rejected with a 400 validation error.

**Size** M
**Priority** P1
**Depends on** [EI-7.1]

### EI-7.3 (epic EPIC-7) — "Ask AI / Summarize progress" affordance in detail headers

**Story**
As a member, I want an "Ask AI / Summarize progress" action in epic and initiative detail headers so that I can run NLQ in context, with a clear disabled state when AI is not configured.

**Acceptance criteria**
- **Given** a configured provider, **When** a member opens an epic or initiative detail header (EPIC-1/EPIC-5) and triggers "Ask AI / Summarize progress", **Then** the answer and summary render in context wired to `/api/workspaces/<slug>/copilot/query/`.
- **Given** the provider is unconfigured (endpoint returns 409), **When** the detail header renders, **Then** the affordance shows a disabled state with a "configure AI provider" hint rather than an error toast.
- **Given** the provider is configured but the request returns a 503-style unavailable, **When** the user triggers the action, **Then** a non-blocking "AI unavailable, try later" message shows and manual viewing continues uninterrupted.
- **Given** a read-only viewer who can read the object, **When** they trigger NLQ, **Then** the request succeeds with the same read gating (NLQ is read-scoped, not write-scoped).

**Size** M
**Priority** P2
**Depends on** [EI-7.2, EI-1.6, EI-5.5]
