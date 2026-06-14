# Workflows & Approvals — Epics

These epics deliver the OPEN, first-party implementation of the PARTIAL and MISSING capabilities specified in [docs/prd-workflows-approvals-2026-06-07.md](docs/prd-workflows-approvals-2026-06-07.md): per-state-group transition rules with runtime enforcement, role/member transition permissions, approval gates with fallback routing, type-specific workflow binding, a functional visual builder, lifecycle controls, and a rules-first AI suggestion/auto-assignment layer.

Scope is strictly the gap-to-close. State groups, custom states, reorder, and default-state management are PRESENT and functional in the fork (`apps/api/plane/db/models/state.py`, `apps/api/plane/app/views/state/base.py`, the web states settings route) and are explicitly OUT OF SCOPE for every epic below. The entitlement flag `workflows_approvals` already returns `true` in `apps/web/ce/lib/self-host-entitlements.ts`; the work is to make that flag mean something rather than gate a no-op shell.

Enforcement is centralized at the single issue-update seam where `state_id` is written (`apps/api/plane/app/views/issue/base.py`) via a shared `enforce_state_transition(issue, new_state_id, actor)` service, so session API, api-key v1, bulk ops, and board drag-drop all pass through one authorization + approval gate. All new models extend `ProjectBaseModel` for workspace + project tenancy, mirroring `StateViewSet.get_queryset` scoping. The default project posture is `workflow_status="disabled"` with zero rules, which means unrestricted transitions — fully backward-compatible for existing projects.

ID prefix for these epics: `WF`.

---

## WF-1 — Workflow Data Model & Additive Migration

### User value
Establishes the persistent foundation (transition rules, actor grants, approvals, approver records, per-project lifecycle status) so every later capability has tables to read and write. Ships with zero behavior change: no enforcement, no UI surfaces — purely additive schema that leaves existing projects untouched.

### Scope (in)
- Four new models, all extending `ProjectBaseModel` (workspace, project, created_by, soft-delete):
  - `WorkflowTransition` (`db_table = "workflow_transitions"`): `from_state` FK→`db.State` (PROTECT, `related_name="outgoing_transitions"`), `to_state` FK→`db.State` (PROTECT, `related_name="incoming_transitions"`), `issue_type` FK→`db.IssueType` (nullable; null = project-default rule set), `allowed_roles` `ArrayField(PositiveSmallIntegerField, default=[])`, `approval_required` `BooleanField(default=False)`, `fallback_state` FK→`db.State` (nullable, SET_NULL, `related_name="fallback_for_transitions"`), `auto_assign_member` FK→`db.User` (nullable, SET_NULL), `auto_assign_role` `PositiveSmallIntegerField(null=True)`. Partial-unique constraint on `(project, issue_type, from_state, to_state, deleted_at)` mirroring the existing `State`/`ProjectIssueType` constraint style.
  - `WorkflowTransitionActor` (`db_table = "workflow_transition_actors"`): `transition` FK→`WorkflowTransition` (CASCADE, `related_name="actors"`), `member` FK→`db.ProjectMember` (CASCADE), unique `(transition, member, deleted_at)`.
  - `WorkItemApproval` (`db_table = "work_item_approvals"`): `issue` FK→`db.Issue` (CASCADE, `related_name="approvals"`), `transition` FK→`WorkflowTransition` (PROTECT), `requested_by` FK→`db.User`, `status` `CharField` choices `pending|approved|rejected` default `pending`, `decided_by` FK→`db.User` (nullable), `decided_at` `DateTimeField(null=True)`, `comment` `TextField(blank=True)`, `target_state` FK→`db.State` (SET_NULL), `fallback_state` FK→`db.State` (nullable, SET_NULL — snapshot of rule fallback at request time).
  - `WorkItemApprovalApprover` (`db_table = "work_item_approval_approvers"`): `approval` FK→`WorkItemApproval` (CASCADE, `related_name="approvers"`), `member` FK→`db.ProjectMember`, `responded` `BooleanField(default=False)`.
- Extend `Project` (`apps/api/plane/db/models/project.py`) with `workflow_status` `CharField` choices `disabled|enabled|paused` default `disabled`.
- DRF serializers and Django admin registration for the four new models.
- Single additive migration creating four tables + the `Project.workflow_status` column.

### Out of scope
- Any enforcement, viewset, API route, or UI (deferred to WF-2+).
- Data backfill — zero rules means unrestricted, so existing transitions keep working with no migration of issue state.
- Cross-project / workspace-level shared workflow library (project-scoped only, per PRD Non-Goals).

### Technical requirements (cite concrete fork files)
- New model modules under `apps/api/plane/db/models/` alongside `state.py` and `issue_type.py`; register in the models package `__init__` the same way `State`/`IssueType` are exported.
- FK targets: `db.State` (`apps/api/plane/db/models/state.py`), `db.IssueType` (`apps/api/plane/db/models/issue_type.py`), `db.Issue`, `db.User`, `db.ProjectMember` (`apps/api/plane/db/models/project.py`).
- `ArrayField` requires Postgres (the deploy DB per spec); use `django.contrib.postgres.fields.ArrayField`.
- Partial-unique constraint must follow the existing per-project unique-name-when-not-deleted pattern in `State` (condition on `deleted_at__isnull=True`).
- Migration generated under `apps/api/plane/db/migrations/`; `makemigrations --check` must be clean.
- Serializers under `apps/api/plane/app/serializers/` following the existing state/issue-type serializer module conventions.

### Security
- All models carry `workspace` + `project` via `ProjectBaseModel`, enabling the same `workspace__slug` + `project_id` + active-membership scoping `StateViewSet.get_queryset` uses — established at the schema layer so no later query can be unscoped by accident.
- `fallback_state`/`target_state` use SET_NULL so deleting a state can never block on or corrupt an approval record; `from_state`/`to_state` use PROTECT so a referenced state cannot be silently deleted out from under a rule.
- `WorkItemApproval.comment` is `TextField` only; sanitization is enforced at the write path (WF-3), not the column.

### Dependencies (epic IDs/models)
- None (foundational). Consumes existing PRESENT models: `State`, `IssueType`/`ProjectIssueType`, `Issue`, `User`, `ProjectMember`, `Project`.

### Epic acceptance criteria (Given/When/Then)
- **Given** an existing project created before this epic, **When** the migration is applied, **Then** its `workflow_status` is `disabled` and no transition rules exist, and issue state changes behave exactly as before (regression guard).
- **Given** the migration is applied and then reversed, **When** `migrate` runs forward then backward on a test DB, **Then** the four tables and the `workflow_status` column are dropped cleanly with no orphaned issue-state rows and no PROTECT violations.
- **Given** a `WorkflowTransition` referencing a `from_state`, **When** an admin attempts to delete that state, **Then** the delete is blocked (PROTECT) and the rule remains intact.
- **Given** a `WorkflowTransition` whose `fallback_state` is later deleted, **When** the state delete succeeds, **Then** the rule's `fallback_state` becomes null (SET_NULL) and no record is corrupted.
- **Given** two transitions in the same project with identical `(issue_type, from_state, to_state)` and neither soft-deleted, **When** the second is created, **Then** the partial-unique constraint rejects it; **When** the first is soft-deleted, **Then** an identical new rule is permitted.
- **Given** `makemigrations --check`, **When** CI runs after this epic, **Then** it reports no missing migrations.

### Risk tier
R1. Schema migration is "costly to reverse." Mitigated by: additive-only (no backfill), default `disabled`, clean reverse migration verified in CI, PROTECT/SET_NULL FK design guaranteeing no dangling state references on rollback. Not R0 — no enforcement is wired yet, so no critical path is affected by this epic alone.

### Entitlement flag
`workflows_approvals` (`apps/web/ce/lib/self-host-entitlements.ts`). No frontend gating in this epic; schema lands regardless of flag, but no behavior is reachable until enforcement (WF-2) is enabled.

---

## WF-2 — Transition-Rule Enforcement with Role & Member Permissions

### User value
Makes transition rules real: a move from one state to another is permitted only if a rule allows it AND the acting member is in the rule's allowed actor set (union of `allowed_roles` and explicit member grants). Closes the MISSING "State Transitions" gap and the PARTIAL "Role-Based Transition Permissions" gap. A Member can be allowed A→B yet blocked B→C, enforced identically across session API, api-key v1, bulk update, and board drag-drop.

### Scope (in)
- `enforce_state_transition(issue, new_state_id, actor)` service in `apps/api/plane/utils/`, the single authoritative gate:
  - FR1: no rule for the project (for the item's resolved rule set) → transition unrestricted (backward-compatible).
  - FR2: rule's allowed actors = union of `allowed_roles` (resolved against the actor's `ProjectMember` role) and `WorkflowTransitionActor.member` grants; empty allowed set = any project member.
  - Returns an allow/deny outcome; raises a typed error on illegal transition (409) vs. disallowed actor (403); fails closed (state change rejected) on any internal error.
- Wire the service into the issue-update seam in `apps/api/plane/app/views/issue/base.py` (single-item and bulk paths) so every `state_id` write passes through it.
- New `WorkflowViewSet` (`apps/api/plane/app/views/workflow/`) + session routes (`apps/api/plane/app/urls/workflow.py`) scoped `workspaces/<slug>/projects/<project_id>/`:
  - `GET/POST .../workflow-transitions/` (list filterable by `issue_type`, `from_state`; create), `GET/PATCH/DELETE .../workflow-transitions/<pk>/` (manage rule + actors) — all writes `allow_permission([ROLE.ADMIN])`.
  - `POST .../issues/<issue_id>/state-transition/` body `{ to_state }` — returns `200` + updated issue on allow, `403` (actor not allowed), `409` (illegal transition). (Approval `202` path lands in WF-3.)
- api-key v1 mirror (`apps/api/plane/api/urls/workflow.py`, `/api/v1/...`) for `workflow-transitions` CRUD and `state-transition`, resolving the api key to a `ProjectMember` and applying the same `ROLE` checks.
- Gating: enforcement active only when `Project.workflow_status == "enabled"` AND a rule exists for the resolved set.

### Out of scope
- Approval gates, fallback routing, notifications/activity emission (WF-3).
- Type-specific resolution beyond "use project-default (`issue_type=null`) rule set" — typed binding lands in WF-4 but the service is written to accept a resolved rule set so WF-4 only changes resolution input.
- Any UI (WF-5).

### Technical requirements (cite concrete fork files)
- Reuse `ROLE` enum and `allow_permission(...)` from `apps/api/plane/app/permissions/base.py` for config writes (AR2). Transition execution uses a dedicated per-rule actor check (AR3), NOT blanket `allow_permission`.
- Roles sourced from `ROLE_CHOICES = ((20,"Admin"),(15,"Member"),(5,"Guest"))` in `apps/api/plane/db/models/project.py`.
- Seam: the `state_id` write in `apps/api/plane/app/views/issue/base.py`; ensure bulk update routes through the same service per-item.
- Read scoping identical to `StateViewSet.get_queryset` (`apps/api/plane/app/views/state/base.py`): `workspace__slug` + `project_id` + active `ProjectMember`.
- v1 routing pattern mirrors `apps/api/plane/api/urls/state.py`; session routing mirrors `apps/api/plane/app/urls/state.py`.

### Security
- AR1 reads scoped by workspace slug + project + active membership; no cross-project rule references (target/fallback states validated to belong to the same project).
- AR2 config writes admin-only; AR3 execution checked against per-rule actors (a Member blocked B→C gets 403 even though it can call the endpoint); AR5 api-key callers enforced identically via the key's resolved member role.
- Fail-closed: if `enforce_state_transition` raises, the state change is rejected and the item stays put — never silently applied.
- Multi-tenant leakage explicitly tested: a rule from project A is invisible and unusable in project B.

### Dependencies (epic IDs/models)
- WF-1 (`WorkflowTransition`, `WorkflowTransitionActor`, `Project.workflow_status`).
- Existing: `ProjectMember`, `ROLE`/`allow_permission`, the issue-update seam.

### Epic acceptance criteria (Given/When/Then)
- **Given** a project with `workflow_status="enabled"` and a rule A→B allowing role Member, **When** a Member moves an item A→B, **Then** the transition succeeds (200) and `state_id` is updated.
- **Given** the same project with a rule A→B but no rule B→C, **When** any actor attempts B→C, **Then** the response is 409 and the state is unchanged.
- **Given** a rule A→B whose allowed actors exclude Guests, **When** a Guest (session or api-key v1) attempts A→B, **Then** the response is 403 and the state is unchanged.
- **Given** a project with `workflow_status="disabled"` or no rules, **When** any actor moves an item between states, **Then** the move is unrestricted (backward-compatible).
- **Given** a member granted A→B via both a role and an explicit `WorkflowTransitionActor`, **When** they move A→B, **Then** they are allowed (union, deduped, no double-count error).
- **Given** a bulk state update spanning multiple items, **When** one item's transition is illegal, **Then** that item is rejected while legal items succeed (per-item result), and no item's state is silently corrupted.
- **Given** a board drag-drop and an api-key v1 `state-transition` for the same illegal move, **When** each executes, **Then** both return the same 409 — proving a single gate.

### Risk tier
R1. Alters the effective behavior of issue `state_id` updates across session, v1, bulk, and board paths (public-API-contract change). Mitigated by feature flag + `workflow_status` gating + fail-closed design. The enforcement service is a critical path: untested critical-path enforcement would be R0, so RED→GREEN contract tests (allowed/denied/illegal/no-rules/multi-tenant) are mandatory before enabling enforcement in any environment.

### Entitlement flag
`workflows_approvals`. Backend enforcement additionally gated on `Project.workflow_status != "disabled"`; runtime kill switch = flip projects to `disabled`.

---

## WF-3 — Approval Gates, Fallback Routing & Notifications

### User value
Lets a transition require sign-off before the work item actually moves. When a gated move is requested, the item enters pending-approval without changing `state_id`; on full approval it advances to the target state; on rejection it routes to the configured fallback state (or stays put with a clear error if none). Approvers, assignees, and creators are notified and every decision is recorded in issue activity. Closes the MISSING "Approval Gates" and "Fallback State Routing" gaps.

### Scope (in)
- Extend `enforce_state_transition` / the `state-transition` endpoint:
  - FR3: when the matched rule has `approval_required=True`, create a `WorkItemApproval` (status `pending`) + `WorkItemApprovalApprover` rows, snapshot `target_state` and `fallback_state` at request time, and return `202` + `{ approval_id }`. `state_id` does NOT change.
  - FR4: on rejection, route the item to the rule's `fallback_state`; if null, leave the item in the source state and surface a validation error.
- New session endpoints (`apps/api/plane/app/views/workflow/`, `apps/api/plane/app/urls/workflow.py`):
  - `GET .../issues/<issue_id>/approvals/` — pending/decided approvals for the item.
  - `POST .../approvals/<approval_id>/decision/` body `{ status: approved|rejected, comment }` — approver-scoped (AR4); on final approval applies `target_state`, on rejection routes to `fallback_state`.
- FR7: emit an issue activity entry and a `Notification` for each enforced request/approval/rejection — approver on request; original assignee + creator on rejection — reusing the existing notification dispatch.
- Server-side sanitization of `WorkItemApproval.comment` with the project's existing HTML sanitizer before persist and before render.
- Single-round, "all required approvers" semantics (a `responded`/decided model on `WorkItemApprovalApprover`).

### Out of scope
- Multi-step / parallel approver quorums beyond "all required approvers" (PRD Non-Goal).
- Approval attachments / signed URLs (out of scope for v1 per PRD Security).
- The approval UI banner (WF-5) — this epic delivers the API + persistence + notifications only.

### Technical requirements (cite concrete fork files)
- Notification via `apps/api/plane/bgtasks/notification_task.py` writing `Notification` rows (`apps/api/plane/db/models/notification.py`: `receiver, triggered_by, entity_name, entity_identifier, data`).
- Activity via the issue activity pipeline `apps/api/plane/bgtasks/issue_activities_task.py`.
- HTML sanitizer: reuse the project's existing server-side sanitizer used for rich-text fields (same path used for issue/comment HTML); never `dangerouslySetInnerHTML` raw on render.
- Approval state application reuses the same `state_id` write path guarded by `enforce_state_transition` so the final move is itself recorded consistently.
- Edge handling: approval snapshots `target_state`+`fallback_state` so in-flight approvals resolve deterministically even if the rule is edited/deleted; `paused` mid-approval still resolves pending approvals but does not gate new transitions.

### Security
- AR4: only `ProjectMember`s in the approval's approver set (or holding an approver role) may decide; a workspace-admin override is allowed but written to issue activity.
- `comment` sanitized server-side on write and render (XSS prevention).
- Fail-closed: a rejection with null fallback leaves the item in the source state plus an explicit error — never a silent or partial move.
- Notifications send display names only, never member emails or full descriptions, consistent with PRD Security.

### Dependencies (epic IDs/models)
- WF-1 (`WorkItemApproval`, `WorkItemApprovalApprover`, `WorkflowTransition.approval_required`/`fallback_state`).
- WF-2 (`enforce_state_transition`, `WorkflowViewSet`, the gated `state-transition` endpoint).
- Existing: `Notification` + `notification_task`, `issue_activities_task`, project HTML sanitizer.

### Epic acceptance criteria (Given/When/Then)
- **Given** a rule A→Done with `approval_required=True` and two required approvers, **When** an allowed actor requests the move, **Then** the endpoint returns `202` + `approval_id`, `state_id` stays at A, a `WorkItemApproval` (pending) is created, and each approver receives a `Notification`.
- **Given** a pending approval with two required approvers, **When** the first approves, **Then** the item stays at A; **When** the second approves, **Then** the item advances to Done and an activity entry records the approval.
- **Given** a pending approval whose rule has `fallback_state=Backlog`, **When** an approver rejects, **Then** the item routes to Backlog and the original assignee + creator receive a rejection `Notification` + activity entry.
- **Given** a pending approval whose rule has no fallback configured, **When** an approver rejects, **Then** the item stays in the source state and a validation error is returned (no silent move).
- **Given** a non-approver project member, **When** they POST a decision, **Then** the response is 403; **Given** a workspace admin override, **When** they decide, **Then** it is allowed and logged in activity.
- **Given** a pending approval whose rule is edited (fallback changed) after the request, **When** the approval is decided, **Then** it resolves using the snapshotted target/fallback, not the edited rule.
- **Given** an approval `comment` containing script markup, **When** it is persisted and later rendered, **Then** the markup is sanitized server-side both times.

### Risk tier
R1. Adds new public API endpoints and changes effective `state_id` behavior for gated transitions; governance-critical (controls who approves work). Mitigated by feature flag, `workflow_status` gating, deterministic snapshotting, fail-closed rejection, and mandatory TDD on the request→approve/reject→notify path. Approvals can be flag-disabled while transitions stay enforced (independent rollback).

### Entitlement flag
`workflows_approvals`. Approval behavior reachable only when the flag is on and `workflow_status="enabled"`; approvals can be independently disabled at the feature-flag layer without disabling transition enforcement.

---

## WF-4 — Type-Specific Workflow Binding & Lifecycle Controls

### User value
Lets admins bind a distinct rule set to each issue type so a Bug and a Feature can govern differently, with new work items inheriting their type's rules automatically. Adds per-project lifecycle control — `enabled` (enforced), `paused` (rules visible/editable but inert), `disabled` (off) — plus an admin-only maintenance bypass that is logged. Closes the MISSING "Type-Specific Workflows" gap and "Workflow Lifecycle Controls" gap.

### Scope (in)
- FR5: rule resolution for an item uses its bound `IssueType` rule set (`WorkflowTransition.issue_type = <type>`); items without a bound type fall back to the project-default set (`issue_type=null`). Creation always allowed into the project default state; rules govern subsequent transitions only.
- Extend `enforce_state_transition` resolution input to select the typed-vs-default rule set per item (the WF-2 service was written to accept a resolved set, so this epic changes resolution, not enforcement mechanics).
- FR6 lifecycle:
  - `GET/PATCH .../workflow-config/` (`apps/api/plane/app/views/workflow/`, `apps/api/plane/app/urls/workflow.py`) to read/update `Project.workflow_status` — admin only.
  - `paused`: rules remain listable/editable but `enforce_state_transition` does not gate.
  - Project-admin maintenance bypass: an admin-initiated transition that skips enforcement, written to issue activity.
- Per-item evaluation in bulk: each item evaluated against its own type's rule set; partial success returns per-item results.

### Out of scope
- The issue-type selector + lifecycle toggle UI (WF-5) — this epic delivers the API + resolution semantics.
- Cross-project shared library (Non-Goal).
- Conditional/branching transitions on arbitrary field values (Non-Goal — state→state + type only).

### Technical requirements (cite concrete fork files)
- `IssueType`/`ProjectIssueType` from `apps/api/plane/db/models/issue_type.py`; resolution must respect per-project linkage (`ProjectIssueType`) so a workspace-scoped type only resolves rules for projects it is linked to.
- `Project.workflow_status` from WF-1 (`apps/api/plane/db/models/project.py`); config endpoint admin-gated via `allow_permission([ROLE.ADMIN])` (`apps/api/plane/app/permissions/base.py`).
- Maintenance-bypass activity via `apps/api/plane/bgtasks/issue_activities_task.py`.
- Resolution logic lives alongside `enforce_state_transition` in `apps/api/plane/utils/`.

### Security
- AR2: `workflow-config` writes admin-only.
- Maintenance bypass is admin-only and always logged to issue activity (auditable; no silent bypass).
- `paused` is explicitly non-enforcing but keeps reads scoped identically (no leakage of another project's rules via the typed-resolution path).
- Type resolution validates the type is linked to the project (`ProjectIssueType`) so a rule cannot be resolved cross-project.

### Dependencies (epic IDs/models)
- WF-1 (`WorkflowTransition.issue_type`, `Project.workflow_status`).
- WF-2 (`enforce_state_transition`, `WorkflowViewSet`).
- Existing: `IssueType`/`ProjectIssueType`, `ROLE`/`allow_permission`, issue activity pipeline.

### Epic acceptance criteria (Given/When/Then)
- **Given** a project with a Bug rule set (A→B) and a default rule set (A→C), **When** a Bug item attempts A→B, **Then** it is allowed; **When** the same Bug item attempts A→C (default-only), **Then** it is rejected (typed set takes precedence for typed items).
- **Given** an item with no bound issue type, **When** it transitions, **Then** the project-default (`issue_type=null`) rule set governs it.
- **Given** any new work item of a type with entry rules, **When** it is created, **Then** it lands in the project default state regardless of rules (rules govern only subsequent transitions).
- **Given** `workflow_status="paused"`, **When** a member attempts any transition, **Then** it is not gated; **And** the rules remain listable and editable via the API.
- **Given** `workflow_status="enabled"` and a project admin invokes a maintenance bypass on an illegal transition, **When** it executes, **Then** the move succeeds and an issue activity entry records the bypass and the admin.
- **Given** a bulk update spanning a Bug and a Feature, **When** it runs, **Then** each item is evaluated against its own type's rule set and a per-item result is returned.
- **Given** a workspace-scoped type not linked to project B, **When** rule resolution runs for a project-B item, **Then** that type's rules are never resolved for project B.

### Risk tier
R1. Adds the `workflow-config` API and changes resolution semantics for typed items (effective-behavior change), plus a maintenance bypass that intentionally skips a governance control. Mitigated by admin-only gating, mandatory activity logging on bypass, `paused` defaulting to non-enforcing, and TDD on typed-vs-default resolution and lifecycle gating. Not R0 — bypass is logged and admin-scoped, no destructive operation.

### Entitlement flag
`workflows_approvals`. Lifecycle is the per-project sub-control: `disabled`/`paused`/`enabled` on `Project.workflow_status` is the runtime kill switch beneath the entitlement flag.

---

## WF-5 — Visual Workflow Builder, Board Drag Enforcement & Approval Surface

### User value
Replaces the CE no-op shell with a working product surface: a per-state-group visual builder to author transitions, allowed actors, approval gates, fallback states, and auto-assign; an issue-type selector to scope the rule set; live preview; board drag enforcement that greys out illegal targets and explains why; and an inline approval banner on the work-item detail view. Closes the PARTIAL "Visual Workflow Builder" gap and surfaces WF-2/WF-3/WF-4 to users.

### Scope (in)
- Replace (do not extend) the CE stubs in `apps/web/ce/components/workflow/`: `workflow-disabled-overlay.tsx`, `workflow-group-tree.tsx`, `workflow-disabled-message.tsx`, `use-workflow-drag-n-drop.ts` (currently returns `isWorkflowDropDisabled: false`), `state-option.tsx` (currently ignores `filterAvailableStateIds`). All real behavior gated by `isSelfHostedFeatureEnabled("workflows_approvals")`; when false, components keep returning the disabled overlay (current behavior preserved).
- New MobX store `apps/web/core/store/workflow.store.ts` (registered in the root store): holds transitions, approvals, and `workflowStatus` per project, with optimistic transition + rollback on 403/409.
- New service `packages/services/.../workflow.service.ts` calling the WF-2/WF-3/WF-4 session endpoints; types added to `@plane/types`.
- New settings sub-route `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/projects/[projectId]/workflows/page.tsx` (next to the existing `states/page.tsx`): card-based per-state-group layout reusing `StateGroup` grouping; each state card shows outgoing transitions with allowed roles/members chips + approval badge; click a transition to edit allowed actors, toggle approval, pick fallback, set auto-assign; issue-type selector scopes the rule set; read-only live preview graph before save.
- Board drag enforcement: `use-workflow-drag-n-drop.ts` returns real `isWorkflowDropDisabled`/`getIsWorkflowWorkItemCreationDisabled` from the store; `workflow-group-tree.tsx` renders allowed target groups; `workflow-disabled-overlay.tsx` shows the reason (e.g., "Moving to Done requires approval"); `state-option.tsx` honors `filterAvailableStateIds` to grey out illegal targets.
- Approval banner on the work-item detail view near the state selector: "Approval pending" with Approve/Reject (approver-only) and requester/target/fallback, reusing existing notification components.
- Lifecycle toggle (enabled/paused) in the workflows settings header; empty states ("Transitions are unrestricted. Add a rule to start governing this project."; paused → muted "Workflow paused — rules are not enforced.") matching the existing empty-state asset pattern under `apps/web/app/assets/empty-state/project-settings`.

### Out of scope
- The AI suggestion chip + auto-assignment (WF-6) — the auto-assign editor field is built here, but the AI suggestion widget is WF-6.
- Backend enforcement logic (WF-2/WF-3/WF-4) — this epic consumes those APIs.

### Technical requirements (cite concrete fork files)
- Reuse `StateGroup` grouping from the existing states settings page (`.../settings/projects/[projectId]/states/{page,header}.tsx`).
- Frontend feature gate via `isSelfHostedFeatureEnabled("workflows_approvals")` (`apps/web/ce/lib/self-host-entitlements.ts`).
- Service lives in `packages/services`; store in `apps/web/core/store` with root-store registration; shared types in `@plane/types`; UI primitives from `@plane/ui`; constants in `@plane/constants`.
- Empty-state assets under `apps/web/app/assets/empty-state/project-settings`.
- Approval banner reuses existing notification components rather than introducing a new notification surface.

### Security
- XSS: approval `comment` is rendered through sanitized output only — never `dangerouslySetInnerHTML` on raw HTML (the server already sanitizes in WF-3; the client must not re-introduce raw injection).
- The UI must not assume client-side gating is authoritative — all enforcement is server-side (WF-2/WF-3); the builder/banner are presentation + optimistic UX with rollback on 403/409.
- When the flag is false, no builder or enforcement is exposed; the disabled overlay behavior is preserved exactly.

### Dependencies (epic IDs/models)
- WF-2 (`workflow-transitions` CRUD, `state-transition`), WF-3 (`approvals`, `decision`), WF-4 (`workflow-config`, type scoping).
- Existing: states settings page (`StateGroup`), `self-host-entitlements.ts`, `@plane/ui`/`@plane/types`/`@plane/constants`, notification components, empty-state assets.

### Epic acceptance criteria (Given/When/Then)
- **Given** `workflows_approvals=false`, **When** the workflow components render, **Then** they show the disabled overlay and drag is a no-op (current behavior preserved).
- **Given** `workflows_approvals=true` and a rule A→B (no rule A→C), **When** a user opens the state dropdown on an item in state A, **Then** C is greyed out via `filterAvailableStateIds` and B is selectable.
- **Given** a board with an illegal drag target, **When** the user drags an item there, **Then** the drop is disabled and the overlay shows the reason; **And** an optimistic move that the server rejects with 403/409 rolls back in the store.
- **Given** the workflows settings sub-route with an issue-type selected, **When** the user edits a transition (actors, approval toggle, fallback, auto-assign) and previews, **Then** the live preview renders the resulting graph read-only before save, and saving persists via the service.
- **Given** an item with a pending approval, **When** an approver opens the detail view, **Then** the "Approval pending" banner shows requester/target/fallback with Approve/Reject; **And** a non-approver sees the banner without action buttons.
- **Given** a project with no rules, **When** the builder loads, **Then** the unrestricted empty state is shown; **Given** `workflow_status="paused"`, **Then** the muted paused banner is shown.

### Risk tier
R2. Frontend-only consumer of already-enforced backend APIs; no schema change, no new authorization surface (server is authoritative). Reversible by reverting the commit or flipping `workflows_approvals` to false, which restores the disabled overlay. Covered by frontend gating tests + MobX store optimistic/rollback tests.

### Entitlement flag
`workflows_approvals` via `isSelfHostedFeatureEnabled("workflows_approvals")` in `apps/web/ce/lib/self-host-entitlements.ts`. Flipping it to false is the frontend kill switch.

---

## WF-6 — AI-Suggested Transitions & Auto-Assignment (Rules-First, Copilot-Optional)

### User value
Speeds up correct transitions: an inline chip near the state selector suggests the highest-ranked legal next state, and configured rules can auto-assign a member/role and notify on transition. Implemented rules-first — the suggestion always works from configured rules and recent activity, and only optionally enriches ranking via the existing copilot. If the copilot is unavailable or times out, it degrades to a deterministic rules-only result and never errors the detail view. Closes the MISSING "AI-Suggested Transitions" and "AI Auto-Assignment Rules" gaps without any proprietary EE source or opaque ML on the critical path.

### Scope (in)
- FR8 suggestion endpoint `GET .../issues/<issue_id>/suggested-transition/` (`apps/api/plane/app/views/workflow/`, `apps/api/plane/app/urls/workflow.py`) returning `{ to_state, confidence, source: "rules"|"ai" }` — the highest-ranked legal `to_state` from configured rules + recent activity; copilot enrichment optional.
- FR8 auto-assignment: on a successful transition, apply the matched rule's `auto_assign_member` / `auto_assign_role` and emit the corresponding `Notification`.
- Rules-first fallback: copilot unavailable/timeout → return rules-only `200` (never 500).
- Frontend AI suggestion chip (WF-5 surface) calling the endpoint; clickable to accept; hidden when `source:"rules"` returns nothing.

### Out of scope
- Proprietary ML model training or any Plane EE source (Non-Goal).
- Conditional/branching logic on arbitrary field values (Non-Goal).
- A standalone copilot client — this reuses the existing Gemini/Vertex copilot path only.

### Technical requirements (cite concrete fork files)
- Reuse the existing Gemini/Vertex copilot client already in the fork's copilot path; do not add a new ML dependency on the critical path.
- Auto-assign fields `WorkflowTransition.auto_assign_member` / `auto_assign_role` (WF-1); apply on the successful `state-transition` path in `enforce_state_transition` (WF-2) / the approval-apply path (WF-3).
- Notifications via `apps/api/plane/bgtasks/notification_task.py`.
- Ranking input = configured legal `to_state`s for the item's resolved rule set (WF-4 resolution) + recent transition history.

### Security
- No prompt/secret leakage: the AI path sends only state names, issue type, and recent transition history — never API keys, member emails (display names only), or full descriptions.
- The system prompt and model identifiers are never returned in the API response (`source` is just `"rules"|"ai"`).
- Auto-assignment respects project membership: an `auto_assign_member` must be an active `ProjectMember`; assignment never grants access cross-project.
- Fail-open for suggestion (degrades to rules) but fail-closed for any state change (assignment is applied only after a successful, authorized transition).

### Dependencies (epic IDs/models)
- WF-1 (`auto_assign_member`/`auto_assign_role`), WF-2 (transition apply path), WF-3 (approval-apply path), WF-4 (resolved rule set).
- WF-5 (the chip surface).
- Existing: Gemini/Vertex copilot client, `notification_task`.

### Epic acceptance criteria (Given/When/Then)
- **Given** an item in state A with legal rule targets B and C, **When** the suggested-transition endpoint is called and the copilot is available, **Then** it returns the highest-ranked legal target with `source:"ai"` and a confidence.
- **Given** the copilot is unavailable or times out, **When** the endpoint is called, **Then** it returns a rules-only result with `source:"rules"` and `200` — the detail view never 500s and no prompt/model id is leaked.
- **Given** an item with no legal next state from rules, **When** the endpoint is called, **Then** the response yields nothing rankable and the UI chip is hidden.
- **Given** a rule A→B with `auto_assign_member=X`, **When** an allowed actor completes the move A→B, **Then** X is assigned and receives a `Notification`; **And** if X is not an active project member, the assignment is skipped without corrupting the transition.
- **Given** a transition that requires approval with auto-assign configured, **When** the approval is finally approved and the item advances, **Then** auto-assignment fires on the applied move (not on the pending request).

### Risk tier
R1. Adds a new public endpoint and a transition side effect (auto-assignment + notification) on the critical state-change path. Mitigated by rules-first design (deterministic fallback), strict prompt-input minimization, no model-id leakage, and a kill switch (endpoint returns rules-only / no-op assignment). Not R0 — no money movement or destructive op, and the copilot is never on the enforcement critical path.

### Entitlement flag
`workflows_approvals`. AI enrichment is independently degradable: the endpoint returns rules-only and auto-assignment no-ops as the rollback, without disabling transition enforcement or approvals.

---

## Dependency-ordered epic list

1. **WF-1 — Workflow Data Model & Additive Migration** (foundational; no dependencies).
2. **WF-2 — Transition-Rule Enforcement with Role & Member Permissions** (depends on WF-1).
3. **WF-3 — Approval Gates, Fallback Routing & Notifications** (depends on WF-1, WF-2).
4. **WF-4 — Type-Specific Workflow Binding & Lifecycle Controls** (depends on WF-1, WF-2).
5. **WF-5 — Visual Workflow Builder, Board Drag Enforcement & Approval Surface** (depends on WF-2, WF-3, WF-4).
6. **WF-6 — AI-Suggested Transitions & Auto-Assignment** (depends on WF-1, WF-2, WF-3, WF-4; chip surface from WF-5).

This ordering maps 1:1 to PRD Milestones M1–M6; each epic is independently deployable behind `workflows_approvals`, defaults to inert (`workflow_status="disabled"`, zero rules = unrestricted), and is revertible by commit with the kill switches noted per epic.
