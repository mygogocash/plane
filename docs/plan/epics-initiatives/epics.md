# Epics & Initiatives — Epics

This document decomposes the **Epics & Initiatives** self-host parity work into delivery epics. It is the second-tier breakdown beneath the PRD: [`docs/prd-epics-initiatives-2026-06-07.md`](../../prd-epics-initiatives-2026-06-07.md). Read the PRD first — it holds the verified gap analysis, data models, API contracts, UX alignment, security model, and concrete fork file paths that each epic below references.

**Scope discipline.** These epics cover **only** the capabilities the PRD classifies as PARTIAL or MISSING. The visualization layouts (list/kanban/calendar/gantt/spreadsheet), the timeline store, cycle integration, and intake are PRESENT and reusable — they are *not* rebuilt here, only parameterized. No proprietary Plane Commercial source is copied; the missing commercial pieces (Initiatives, structured status updates, epic NLQ) are built as open first-party equivalents.

**Cross-cutting conventions (apply to every epic):**
- Acceptance criteria are written Given/When/Then.
- TDD-first: each epic names the first failing test to write; no production code lands without a failing test demanding it.
- All new reads/writes are workspace-/project-scoped and permission-checked server-side (reuse `allow_permission`/`ROLE` and `WorkspaceViewerPermission` — never ad-hoc checks).
- New schema is additive only; every schema epic ships forward + reverse migrations and never edits an applied migration.
- Features gate behind existing self-host entitlement flags in [`apps/web/ce/lib/self-host-entitlements.ts`](../../../apps/web/ce/lib/self-host-entitlements.ts) (`epics`, `initiatives`); no new gating mechanism is invented.
- Backend = Django/DRF in `apps/api/plane/{db,app,api}`; frontend = React Router 7 + MobX in `apps/web/{core,ce}`; shared code in `@plane/{types,services,ui,constants}`.
- Stable ID prefixes for cross-reference: `INIT` (initiatives), `EPIC` (epics), `WIT` (work-item-types / work-items), `WF` (workflows/approvals), `WIKI` (wiki). Epics ↔ work items are cross-referenced by ID.

The epic IDs below (`EPIC-1` … `EPIC-7`) align 1:1 with PRD Milestones M1–M7.

---

## EPIC-1 — Epic management frontend foundation (store, modal, route)

**User value.** A project member can see, create, and open epics inside a project using the same layouts they already use for work items. This turns the dead stub UI into a usable epic surface and is the foundation every later epic builds on.

**Scope (in).**
- Replace the empty stub modal (`apps/web/ce/components/epics/epic-modal/modal.tsx:24-26`, currently returns `<></>`) with a real create/update modal built on existing issue-create form components: project selector (honoring `isProjectSelectionDisabled`), name, lead (assignee), description editor, start/target date.
- Rewrite the non-functional epic store (`apps/web/ce/store/issue/epic/issue.store.ts`, currently `@ts-nocheck` + "this class will never be used") into a real MobX store backed by a new `EpicService` in `packages/services`.
- Wire the epic filter store (`apps/web/ce/store/issue/epic/filter.store.ts`) so filters persist across layout switches.
- Add a project epics route `apps/web/app/(all)/[workspaceSlug]/(projects)/projects/[projectId]/epics/` mounting the existing list/kanban/gantt layouts via the timeline store (`apps/web/ce/store/timeline/base-timeline.store.ts`).
- Render the epic empty-state (reuse `apps/web/app/assets/empty-state/epics`) with an "Enable epics in project settings" CTA gated on the `epics` entitlement.
- Add the `epics` key to `SELF_HOSTED_FEATURE_FLAGS`, shipped **`false`** for this epic (flipped `true` in EPIC-2 when the backend is live).

**Out of scope.** Backend endpoints, progress rollup, bulk-attach, convert, duplicate (EPIC-2). Custom-property fields in the modal (EPIC-3). Status-update thread / NLQ affordance in detail header (EPIC-6 / EPIC-7).

**Technical requirements (reuse).**
- Build the modal on existing issue-create form components rather than net-new form scaffolding.
- Reuse layout components (list/kanban/gantt) and `base-timeline.store.ts` — parameterize for epics, do not fork.
- `EpicService` follows the existing service conventions in `packages/services`; epic reads hit the (EPIC-2) session endpoints but in this epic can be shipped against a typed contract with the store/modal verified in isolation, since the flag stays `false`.
- Entitlement type `TSelfHostedFeatureFlag` in `self-host-entitlements.ts` picks up the new key automatically.

**Security.** No new server surface in this epic; the route and modal are inert behind the `false` flag. Description rich text entered in the modal must be sent through the same sanitize path used for issues when EPIC-2 persists it; the frontend must not assume HTML is safe.

**Dependencies.** None (foundation). Existing: `Issue`, `IssueType.is_epic`, issue-create form components, timeline store, empty-state assets.

**Epic acceptance criteria.**
- **Given** the epic create modal is opened, **When** a member fills name, lead, description, start/target date and submits, **Then** the modal calls `EpicService.create` with the typed payload and closes on success (no `<></>` stub, no `@ts-nocheck`).
- **Given** the `epics` entitlement flag is `false`, **When** a user navigates to the project epics route, **Then** the empty-state with the "Enable epics in project settings" CTA renders and no live epic data is requested.
- **Given** a member applies a filter in the epics list layout and switches to kanban, **When** the layout re-renders, **Then** the filter persists (filter store retains state across the switch).
- **Given** the epic store is instantiated, **When** TypeScript is checked, **Then** there is no `@ts-nocheck` and the store compiles under strict typing.

**Risk tier.** **R2.** Frontend-only, no schema, gated behind a `false` flag; reversible by reverting the commit (restores the stub) with green tests and a flag that stays off. No tenant or hierarchy data is touched.

**Entitlement flag.** `epics` (added here, value `false`).

---

## EPIC-2 — Epic backend: progress, bulk-attach, convert, duplicate

**User value.** Epics become real workflow objects: members can track an epic's progress as a rollup of its child work items, attach many work items at once, convert between epic and standard work item, and duplicate epics across projects/workspaces. This is the capability that flips epics from "viewable" to "usable" and turns the `epics` flag on.

**Scope (in).**
- Session endpoints in `apps/api/plane/app/urls/epic.py` and views:
  - `GET|POST /api/workspaces/<slug>/projects/<project_id>/epics/` and `GET|PATCH|DELETE .../epics/<pk>/` (Issues filtered to `is_epic` type).
  - `GET .../epics/<epic_id>/progress/` — rollup snapshot: counts by state group + percent complete; 0 work items returns 0% (no divide-by-zero).
  - `POST .../epics/<epic_id>/work-items/` — bulk-attach `{ "issue_ids": [...] }`, sets `parent`, enforces one-epic-per-item (default reject if already parented; reparent only on explicit flag).
  - `POST .../epics/<epic_id>/convert/` — convert epic → standard work item (`{ "target_issue_type_id": ... }`); child-reparenting policy recorded in issue activity; block silent data loss.
  - `POST .../work-items/<issue_id>/convert-to-epic/`.
  - `POST .../epics/<epic_id>/duplicate/` — `{ "target_project_id"?, "target_workspace_slug"?, "include_subtree": bool }`; remap states/labels/members with fallback to target defaults and a remap summary.
- api-key v1 parity in `apps/api/plane/api/urls/epic.py` for list/create/detail with identical role enforcement (no NLQ over v1).
- Issue activity logging for attach/convert/duplicate.
- Flip `epics` entitlement flag to `true`.

**Out of scope.** Custom properties (EPIC-3). Initiatives (EPIC-4/5). Status updates (EPIC-6). NLQ (EPIC-7). New layouts (PRESENT).

**Technical requirements (reuse).**
- No new model: epics are `Issue` + `IssueType(is_epic=True)` + `Issue.parent` (`apps/api/plane/db/models/issue.py:114-120`, `apps/api/plane/db/models/issue_type.py:19`). Lead = existing assignee; timeline = existing `start_date`/`target_date`.
- Progress rollup uses annotate-based aggregation modeled on `WorkspaceCyclesEndpoint` (`apps/api/plane/app/views/workspace/cycle.py`) and existing cycle progress math.
- URL/scoping shape mirrors `apps/api/plane/app/urls/cycle.py` (`slug` + `project_id`).
- Serializers/paginator follow existing DRF conventions (paginated `results`/`count`, grouped responses like cycles) — no custom envelope.
- Duplication remap mirrors the template-clone edge-case handling described in `spec.md`.

**Security.** Epic write requires project member with edit role; read requires project viewer (`allow_permission`/`ROLE`). Every queryset filters by `workspace__slug` + `project_id`. Cross-workspace references rejected with `400`. Cross-workspace duplication re-resolves members/labels/states in the target tenant — never carries source-tenant IDs across. Description HTML sanitized on persist (`strip_tags` for `_stripped`, server-side sanitize before save) to prevent stored XSS. v1 routes enforce the same role checks as session routes. **Conversion and cross-workspace duplication touch hierarchy/tenant data — any conversion/remap path lacking test coverage is automatically R0 and stops for explicit sign-off.**

**Dependencies.** EPIC-1 (frontend store/modal/route consume these endpoints; flag flip depends on this epic). Existing models: `Issue`, `IssueType`, `Label`, `State`, `WorkspaceCyclesEndpoint` pattern.

**Epic acceptance criteria.**
- **Given** an epic with N child work items in various state groups, **When** a viewer GETs `.../epics/<id>/progress/`, **Then** the response returns counts by state group and a percent-complete; **and Given** the epic has zero work items, **Then** percent-complete is `0` with no divide-by-zero error.
- **Given** a work item already parented to another epic, **When** bulk-attach is called without the reparent flag, **Then** it is rejected with a clear error; **When** called with the explicit reparent flag, **Then** the work item is reparented and the change is recorded in activity.
- **Given** an epic with children, **When** it is converted to a standard work item, **Then** children are reparented per the recorded policy (to the epic's parent or null), the type flips to the target non-epic type, and the conversion is written to issue activity (no silent child loss).
- **Given** a project viewer (read-only) token, **When** it POSTs to create/convert/duplicate an epic, **Then** the request is rejected (403); **and Given** a non-member, **Then** 403; **and Given** a cross-workspace reference, **Then** 400.
- **Given** an epic duplicated into another workspace with a missing target state/label/member, **When** duplication runs, **Then** it falls back to target defaults and returns a remap summary; no source-tenant IDs appear in the target.
- **Given** all epic endpoints pass their contract tests, **When** the `epics` flag is flipped `true`, **Then** the project epics route serves live data.

**Risk tier.** **R1** overall (new API contracts, costly to reverse, must be announced/logged with a rollback path). Sub-paths for **conversion** and **cross-workspace duplication** are treated as R1-with-mandatory-coverage and escalate to **R0** if merged without test coverage on the hierarchy/remap logic. No schema migration to reverse (uses existing Issue tables); rollback = revert routes + set flag `false`.

**Entitlement flag.** `epics` (flipped to `true` in this epic).

---

## EPIC-3 — Epic custom properties (text / dropdown / member)

**User value.** Teams can attach structured, type-specific metadata to epics — free text, single/multi-select dropdowns, and member references — and edit those values in the epic detail view. This closes the commercial "epic custom properties" gap without building a general-purpose property framework.

**Scope (in).**
- New additive models in `apps/api/plane/db/models/issue_property.py`:
  - `IssueProperty` — FK `issue_type` (`related_name="properties"`), FK `workspace`; `name`, `display_name`, `description`; `property_type` (`text`/`option`/`member`); `is_multi`, `is_required` bools; `sort_order` float; `settings` JSON; `external_source`/`external_id`.
  - `IssuePropertyOption` — FK `IssueProperty`, `name`, `sort_order`, `is_default`.
  - `IssuePropertyValue` — FK `Issue`, FK `IssueProperty`; `value_text` TextField, `value_option` FK `IssuePropertyOption` (null), `value_uuid` (member id, null); unique per `(issue, property, value)` where `deleted_at` is null.
- Forward + reverse migration (new tables only; no change to `issues`/`issue_types`).
- Property CRUD API: `GET|POST /api/workspaces/<slug>/issue-types/<type_id>/properties/`, `.../properties/<pk>/`, `.../properties/<pk>/options/`; values at `/api/workspaces/<slug>/projects/<project_id>/epics/<epic_id>/property-values/`.
- Detail-view fields in the epic modal/detail to define properties (on the epic IssueType) and edit values per epic.

**Out of scope.** Custom properties on non-epic work items or any general-purpose property framework beyond the epic-scoped `text`/`option`/`member` types this milestone demands (explicit PRD non-goal). Initiatives, status updates, NLQ.

**Technical requirements (reuse).**
- Models extend existing base mixins (`BaseModel`/`ProjectBaseModel`) and inherit soft-delete (`deleted_at`).
- Partial unique constraint `UniqueConstraint(... condition=Q(deleted_at__isnull=True))` matches the existing project-issue-type constraint style.
- Properties scope to the epic work-item type via the `issue_type` FK (`IssueType.is_epic` already exists).
- Detail-view fields reuse the modal built in EPIC-1.

**Security.** Property definition/edit requires project edit role; reads require project viewer. Querysets filter by workspace (and project for values). `value_text` is sanitized on persist consistent with issue text handling. Member `value_uuid` references are validated to be members of the owning workspace.

**Dependencies.** EPIC-1 (detail view to host fields), EPIC-2 (epic endpoints the property-values path attaches to). Existing: `IssueType`, `Issue`, `Workspace`, base mixins.

**Epic acceptance criteria.**
- **Given** an epic IssueType, **When** a member defines a `text`, an `option` (multi), and a `member` property, **Then** all three persist with correct `property_type`/`is_multi` and appear in the epic detail view.
- **Given** an epic with defined properties, **When** a member sets a text value, selects two dropdown options on a multi-option property, and assigns a member, **Then** the values persist and re-render on reload; **and** a duplicate `(issue, property, value)` row (with `deleted_at` null) is rejected by the partial unique constraint.
- **Given** an `is_required` property with no value, **When** the epic is saved, **Then** the API rejects with a validation error.
- **Given** the forward migration is applied then reversed (`migrate <app> <prev>`), **When** the reverse runs, **Then** the three new tables drop with zero impact on existing `issues`/`issue_types` rows (additive-only verified).

**Risk tier.** **R1.** Additive schema migration (new tables) is costly-to-reverse and must ship with a reviewed reverse migration; mitigated because no existing table is altered. Rollback = reverse migration drops new tables + revert UI.

**Entitlement flag.** `epics` (no flag flip; this extends the already-enabled epic surface).

---

## EPIC-4 — Initiatives model + API + workspace aggregation

**User value.** Workspace leads gain a first-class, workspace-level object that aggregates any set of epics and projects under one of five lifecycle states, with automatic progress rolled up from member epics and projects. This is the core missing commercial capability (no Initiative model exists in the fork today).

**Scope (in).**
- New additive models in `apps/api/plane/db/models/initiative.py`:
  - `Initiative` (extends `BaseModel`) — FK `workspace` (`related_name="initiatives"`); `name`, `description`/`description_html`/`description_stripped`/`description_json`; FK `lead` → AUTH_USER_MODEL (null); `start_date`/`end_date` (null); `state` choices `DRAFT`/`PLANNED`/`ACTIVE`/`COMPLETED`/`CLOSED` (default `DRAFT`); `sort_order` float; `logo_props` JSON; `progress_snapshot` JSON cache; `external_source`/`external_id`.
  - `InitiativeEpic` — FK `Initiative`, FK `Issue` (must be `is_epic`), unique-when-not-deleted.
  - `InitiativeProject` — FK `Initiative`, FK `Project`, unique-when-not-deleted.
  - `InitiativeLabel` — FK `Initiative`, FK `Label` (workspace-scoped), for grouping/filtering.
- Forward + reverse migration (new tables only).
- Session endpoints in `apps/api/plane/app/urls/initiative.py`:
  - `GET|POST /api/workspaces/<slug>/initiatives/`; `GET|PATCH|DELETE .../initiatives/<pk>/`.
  - `POST|DELETE .../initiatives/<initiative_id>/epics/` and `.../projects/` — attach/detach members.
  - `GET .../initiatives/<initiative_id>/progress/` — aggregated rollup across member epics + projects (annotate-based).
  - `GET /api/workspaces/<slug>/initiatives-summary/` — workspace aggregation list with progress annotations + lifecycle-state grouping.
- api-key v1 parity in `apps/api/plane/api/urls/initiative.py` for list/create/detail (no NLQ over v1).

**Out of scope.** Initiatives UI / store / route (EPIC-5). Status updates on initiatives (EPIC-6). NLQ (EPIC-7). Teamspace membership — aggregation must not assume teamspaces and must degrade to workspace/project scoping (PRD non-goal).

**Technical requirements (reuse).**
- Workspace-aggregation views mirror `WorkspaceCyclesEndpoint` (`apps/api/plane/app/views/workspace/cycle.py`) — the proven workspace-level rollup pattern.
- URL/scoping by `slug` only; reserved `"initiatives"` slug already in `RESTRICTED_WORKSPACE_SLUGS` (`apps/api/plane/utils/constants.py:47`) — no constants change.
- Models extend `BaseModel`, inherit soft-delete; join tables use partial unique constraints matching existing style.
- Progress rollup composes epic progress (EPIC-2) with project progress; member epics that are converted to non-epic or deleted are skipped.

**Security.** Initiative read requires Workspace Viewer (`WorkspaceViewerPermission`); create/update/delete requires Workspace Admin or Member. Every queryset filters by `workspace__slug`. Member-attach validates that referenced epics/projects belong to the same workspace — reject cross-workspace refs with `400`. `description_html` sanitized on persist (same path as `IssueComment`). Space/public API must not surface initiatives. v1 routes enforce the same role checks.

**Dependencies.** EPIC-2 (epic progress feeds initiative rollup; `InitiativeEpic` requires `is_epic` Issues). Existing: `Workspace`, `Project`, `Label`, `WorkspaceCyclesEndpoint` pattern, `RESTRICTED_WORKSPACE_SLUGS`.

**Epic acceptance criteria.**
- **Given** a Workspace Member, **When** they POST an initiative with `state=DRAFT`, attach two epics and one project, **Then** the initiative and join rows persist and `GET .../initiatives/<id>/progress/` returns a rollup aggregating the member epics + project.
- **Given** an initiative, **When** a member attaches an epic from a different workspace, **Then** the request is rejected with `400` (same-workspace validation).
- **Given** a Workspace Viewer (read-only), **When** they POST/PATCH/DELETE an initiative or attach members, **Then** the request is rejected; **and Given** a non-member, **Then** rejected.
- **Given** an initiative whose member epic is later converted to a standard work item or soft-deleted, **When** progress is recomputed, **Then** the non-epic/deleted member is skipped and the `InitiativeEpic` soft-delete cascade-cleans (no error, no stale member).
- **Given** `GET /api/workspaces/<slug>/initiatives-summary/`, **When** called by a viewer, **Then** initiatives return grouped by their five lifecycle states with progress annotations.
- **Given** the forward migration is applied then reversed, **When** the reverse runs, **Then** the new tables drop with zero impact on existing data; the `CheckConstraint`/partial-unique constraints are present while applied.

**Risk tier.** **R1.** New API contracts + additive schema migration (new tables, join tables, constraints) — costly to reverse, announced/logged, reviewed reverse migration. Additive-only (no existing table altered) and the surface is unreachable from UI until EPIC-5, lowering blast radius. Rollback = reverse migration + revert routes.

**Entitlement flag.** `initiatives` (added here, value `false`; flipped `true` in EPIC-5 when the UI is functional).

---

## EPIC-5 — Initiatives UI (store, route, layouts, detail)

**User value.** Workspace leads can manage initiatives visually — see them grouped by lifecycle state on a board, on a timeline, or in a list; attach epics/projects; and read live progress in a detail view. This makes the EPIC-4 backend usable and turns the `initiatives` flag on.

**Scope (in).**
- New MobX initiative store under `apps/web/ce/store/initiative/` + `InitiativeService` in `packages/services`; types in `packages/types`; lifecycle-state and status labels in `packages/constants`/`packages/i18n`.
- New top-level workspace route `apps/web/app/(all)/[workspaceSlug]/(projects)/initiatives/` (slug already reserved server-side).
- List/board/timeline layouts reusing the existing layout stack + timeline store: board columns = the five lifecycle states; timeline zoom week/month/quarter; filtering/grouping by lead/state/labels/dates persisted across view switches.
- Initiative detail: card-based progress display (rollup from epics + projects) and members panel (attach/detach epics + projects).
- Empty state: "Create your first initiative" workspace-scoped CTA gated on the `initiatives` entitlement.
- Flip `initiatives` flag to `true`.

**Out of scope.** Backend endpoints (EPIC-4). Status-update section in detail (EPIC-6). NLQ affordance in detail header (EPIC-7). New layout primitives (PRESENT — reused).

**Technical requirements (reuse).**
- Reuse the existing list/board/timeline layout components and `base-timeline.store.ts` — parameterize for initiatives, do not fork.
- `InitiativeService` follows `packages/services` conventions and consumes EPIC-4 endpoints; store mirrors existing store patterns.
- Filter persistence reuses the same persisted-filter approach as the epic filter store (EPIC-1).
- Entitlement type `TSelfHostedFeatureFlag` picks up `initiatives` automatically.

**Security.** No new server surface; all reads/writes go through EPIC-4's permission-checked endpoints. The route renders only for users who can read the workspace's initiatives; the empty-state/route is inert while the flag is `false`. Initiative description rich text is sanitized on persist server-side (EPIC-4) — the UI must not treat HTML as safe.

**Dependencies.** EPIC-4 (all data + permissions), EPIC-1 (filter-persistence pattern, layout parameterization precedent). Existing: layout stack, timeline store, `packages/{types,services,constants,i18n}`.

**Epic acceptance criteria.**
- **Given** the `initiatives` flag is `true`, **When** a Workspace Viewer opens the initiatives route in board view, **Then** exactly five columns render for `DRAFT`/`PLANNED`/`ACTIVE`/`COMPLETED`/`CLOSED` and initiatives appear in their state column.
- **Given** a member viewing an initiative detail, **When** they attach an epic and a project, **Then** the members panel updates and the progress card re-renders the new rollup.
- **Given** a member applies a state/lead filter on the board and switches to timeline, **When** the layout re-renders, **Then** the filter persists across the switch.
- **Given** the `initiatives` flag is `false`, **When** a user navigates to the initiatives route, **Then** the "Create your first initiative" empty-state renders and no live initiative data is requested.
- **Given** concurrent edits to initiative membership while a detail view is open, **When** a conflicting write lands, **Then** the UI refetches (last-write-wins) without crashing.

**Risk tier.** **R2.** Frontend-only; reversible by reverting the UI commit, and the `initiatives` flag is an instant kill switch (no redeploy needed). No schema, no tenant-data writes beyond the already-tested EPIC-4 endpoints.

**Entitlement flag.** `initiatives` (flipped to `true` in this epic).

---

## EPIC-6 — Structured status updates (On Track / At Risk / Off Track)

**User value.** Members can post first-class status updates — On Track / At Risk / Off Track — on epics and initiatives, with a rich-text body, threaded replies, and emoji reactions. This replaces ad-hoc comments with the structured, scannable status semantics Plane markets, reusing the existing reaction infrastructure.

**Scope (in).**
- New additive models in `apps/api/plane/db/models/status_update.py`:
  - `StatusUpdate` (extends `BaseModel`) — FK `workspace`; nullable FK `epic` → `Issue` and nullable FK `initiative` → `Initiative`, **exactly one set, enforced by `CheckConstraint`**; `status` choices `ON_TRACK`/`AT_RISK`/`OFF_TRACK`; `comment_html`/`comment_stripped`/`comment_json`; self-FK `parent` (`related_name="replies"`) for threading; FK `actor`.
  - `StatusUpdateReaction` — FK `StatusUpdate`, FK `actor`, `reaction` Text; unique-when-not-deleted (mirrors `CommentReaction`).
- Forward + reverse migration (new tables only; `CheckConstraint` for the epic-XOR-initiative invariant; partial unique on reactions).
- Session endpoints:
  - `GET|POST /api/workspaces/<slug>/projects/<project_id>/epics/<epic_id>/status-updates/` and `GET|PATCH|DELETE .../status-updates/<pk>/`.
  - `GET|POST /api/workspaces/<slug>/initiatives/<initiative_id>/status-updates/`.
  - `POST|DELETE .../status-updates/<status_update_id>/reactions/`.
- Threaded UI: status-update section in epic and initiative detail views with On Track / At Risk / Off Track chips, threaded replies, and emoji reactions reusing existing reaction components.

**Out of scope.** Status updates on objects other than epics/initiatives. NLQ summarization of status updates (EPIC-7 may consume them as evidence). Workflow enforcement of lifecycle transitions (allowed but only logged — PRD edge case).

**Technical requirements (reuse).**
- `StatusUpdate` threading mirrors `IssueComment`'s nested self-FK (`parent`, `related_name`) and its `comment_html`/`comment_stripped`/`comment_json` tracking.
- `StatusUpdateReaction` mirrors `IssueReaction`/`CommentReaction` (unique-when-not-deleted, emoji `reaction` text); reuse the existing reaction UI components.
- `CheckConstraint` and partial `UniqueConstraint` follow existing constraint style.
- Models extend `BaseModel`, inherit soft-delete.

**Security.** Status-update authorship requires membership of the owning epic's project / initiative's workspace; reads require the matching viewer role. Querysets filter by workspace (and project for epic-scoped updates). `comment_html` sanitized on persist via the same strip/sanitize path as `IssueComment` to prevent stored XSS. Space/public API must not surface status updates.

**Dependencies.** EPIC-2 (epic endpoints to attach updates to), EPIC-4 (`Initiative` model + endpoints), EPIC-1/EPIC-5 (detail views that host the thread). Existing: `IssueComment`, `IssueReaction`/`CommentReaction`, `Issue`, base mixins.

**Epic acceptance criteria.**
- **Given** an epic, **When** a project member posts an `AT_RISK` status update with rich-text body, **Then** it persists with `comment_html`/`comment_stripped`/`comment_json` set and `epic` FK populated (initiative FK null).
- **Given** a `StatusUpdate` write attempting to set both `epic` and `initiative` (or neither), **When** it is saved, **Then** the `CheckConstraint` rejects it.
- **Given** a status update, **When** a member posts a threaded reply and adds an emoji reaction, **Then** the reply attaches via `parent` and the reaction persists; **and** a duplicate reaction by the same actor (with `deleted_at` null) is rejected by the partial unique constraint.
- **Given** a non-member of the owning project/workspace, **When** they attempt to author a status update, **Then** the request is rejected; reads require the matching viewer role.
- **Given** the forward migration is applied then reversed, **When** the reverse runs, **Then** the new tables drop with zero impact on existing `issue_comments` data; the `CheckConstraint` and partial unique constraint are present while applied.

**Risk tier.** **R1.** Additive schema migration (new tables + `CheckConstraint` + partial unique) — costly to reverse, reviewed reverse migration, announced/logged. Additive-only (no change to `issue_comments`). Rollback = reverse migration + revert UI.

**Entitlement flag.** `epics` and `initiatives` (no new flag; the status-update surface appears inside the already-gated epic and initiative detail views).

---

## EPIC-7 — AI NLQ + progress summarization (self-host, fail-closed)

**User value.** Members can ask natural-language questions about an epic, initiative, or the workspace ("what's blocking this?", "who owns this?", "what's the status?") and get an evidence-grounded answer plus an auto-generated progress summary — running entirely on the already-configured self-host LLM provider, with no Plane Cloud dependency.

**Scope (in).**
- Extend copilot routing with `POST /api/workspaces/<slug>/copilot/query/` — body `{ "scope": "epic"|"initiative"|"workspace", "object_id": uuid?, "question": str }`; returns `{ "answer", "summary", "evidence": [...] }`.
- Evidence retrieval scoped to the target object and filtered to caller-readable objects only.
- Reuse `is_llm_configured`/`get_llm_config`/`get_vertex_ai_config` from `apps/api/plane/app/views/copilot.py`; return a `409`/feature-disabled response when no provider is configured (fail closed).
- Graceful AI-unavailable handling (503-style) on provider outage/quota exhaustion — never blocks manual viewing.
- Frontend "Ask AI / Summarize progress" affordance in epic and initiative detail headers; when the provider is unconfigured, render a disabled state with a "configure AI provider" hint rather than an error toast.

**Out of scope.** Exposing NLQ over the v1 api-key surface (explicitly not in this milestone). Any external billing or Plane Cloud credentials (PRD non-goal). NLQ over objects the caller cannot read.

**Technical requirements (reuse).**
- Reuse the existing copilot LLM pipeline: `COPILOT_MODES`, evidence-gathering, `get_llm_config`/`get_vertex_ai_config`/`is_llm_configured` (`apps/api/plane/app/views/copilot.py`).
- Evidence draws from epic/initiative data + (EPIC-6) status updates the caller can read.
- Frontend affordance lives in the detail headers built in EPIC-1 (epic) and EPIC-5 (initiative).

**Security.** NLQ requires the same scope membership as reading the target object; the evidence set is filtered to caller-readable objects only. Prompts must never include API keys, tokens, or other workspaces' data. Do not log raw prompts/responses containing secrets. Fail closed to non-AI workflows when provider config is absent. NLQ is not exposed on the space/public API.

**Dependencies.** EPIC-2 (epic data), EPIC-4 (initiative data), EPIC-6 (status updates as evidence), EPIC-1/EPIC-5 (detail headers). Existing: `copilot.py` provider abstraction.

**Epic acceptance criteria.**
- **Given** a configured LLM provider, **When** a member who can read an epic POSTs a question scoped to that epic, **Then** the response returns an `answer`, a `summary`, and an `evidence` list drawn only from objects the caller can read.
- **Given** the evidence set would include an object the caller cannot read (e.g., a different workspace's data), **When** the query runs, **Then** that object is excluded from evidence and never appears in the answer.
- **Given** no LLM provider is configured (`is_llm_configured` false), **When** the endpoint is called, **Then** it fails closed with a `409`/feature-disabled response and the detail-header affordance shows a disabled "configure AI provider" state (no error toast, manual viewing unaffected).
- **Given** the provider is configured but times out or is quota-exhausted, **When** the query runs, **Then** the API returns a graceful AI-unavailable (503-style) response and manual viewing of the epic/initiative is not blocked.
- **Given** a non-member of the target's scope, **When** they call NLQ, **Then** the request is rejected with the same gating as reading the object.

**Risk tier.** **R1.** New API contract reusing the provider abstraction; no schema change. Treated R1 because it introduces a new contract that must be announced/logged with a rollback path, but it fails closed and degrades safely. Rollback = disable the AI feature flag + remove the route; manual workflows are unaffected.

**Entitlement flag.** `epics` and `initiatives` (the affordance lives inside their already-gated detail views); NLQ additionally fails closed on `is_llm_configured`, which acts as the AI kill switch.

---

## Dependency-ordered epic list

Build order follows PRD Milestones M1–M7. Each epic is one focused commit with its own rollback.

1. **EPIC-1 — Epic management frontend foundation** (R2; flag `epics=false`). No dependencies. Foundation: store, modal, route, layouts.
2. **EPIC-2 — Epic backend: progress, bulk-attach, convert, duplicate** (R1; flips `epics=true`). Depends on EPIC-1. Conversion/duplication paths are R0 if untested.
3. **EPIC-3 — Epic custom properties** (R1; additive schema). Depends on EPIC-1, EPIC-2.
4. **EPIC-4 — Initiatives model + API + aggregation** (R1; additive schema; flag `initiatives=false`). Depends on EPIC-2 (epic progress feeds rollup).
5. **EPIC-5 — Initiatives UI** (R2; flips `initiatives=true`). Depends on EPIC-4, EPIC-1 (patterns).
6. **EPIC-6 — Structured status updates** (R1; additive schema). Depends on EPIC-2, EPIC-4, EPIC-1/EPIC-5 (detail views).
7. **EPIC-7 — AI NLQ + progress summarization** (R1; no schema; fail-closed). Depends on EPIC-2, EPIC-4, EPIC-6, EPIC-1/EPIC-5.

**Critical path:** EPIC-1 → EPIC-2 → EPIC-4 → (EPIC-5, EPIC-6) → EPIC-7. EPIC-3 branches off EPIC-2 and can proceed in parallel with EPIC-4 once EPIC-2 lands.
