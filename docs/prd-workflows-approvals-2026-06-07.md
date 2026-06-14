# Workflows & Approvals PRD — Self-Host Parity

## Executive Summary

The fork ships `workflows_approvals: true` in `apps/web/ce/lib/self-host-entitlements.ts`, but the feature is a shell: no backend models, no API routes, no enforcement, and CE UI stubs (`apps/web/ce/components/workflow/*`) that return empty fragments or hardcoded `false`. State management itself (groups, custom states, reorder, default) is already PRESENT and functional and is explicitly out of scope.

This PRD specifies an OPEN, first-party implementation of the PARTIAL and MISSING capabilities: per-state-group transition rules with runtime enforcement, role-based transition permissions, approval gates with fallback routing, type-specific workflow binding, a functional visual workflow builder, and lifecycle (pause/resume) controls. AI-suggested transitions and AI auto-assignment are scoped as a thin, rules-first layer that reuses the existing Gemini/Vertex copilot path with an explicit non-ML fallback — no proprietary EE source, no opaque ML dependency on the critical path.

Enforcement is centralized at the single issue-update seam (`apps/api/plane/app/views/issue/base.py`, where `state_id` is written) so every state change — session API, api-key v1, bulk ops, board drag-drop — passes through one authorization + approval gate.

## Current State in Fork

PRESENT (do not rebuild):
- `State` model — `apps/api/plane/db/models/state.py`: `name, color, sequence (float), group, is_triage, default`, `StateGroup` enum (BACKLOG/UNSTARTED/STARTED/COMPLETED/CANCELLED/TRIAGE), `DEFAULT_STATES`, soft-delete managers, per-project unique name.
- `StateViewSet` — `apps/api/plane/app/views/state/base.py`: full CRUD, `mark_as_default`, `grouped` listing, `allow_permission([ROLE.ADMIN])` on writes.
- Session routes `apps/api/plane/app/urls/state.py`; api-key v1 routes `apps/api/plane/api/urls/state.py`.
- Web states settings route `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/projects/[projectId]/states/{page,header}.tsx`.
- `IssueType` + `ProjectIssueType` — `apps/api/plane/db/models/issue_type.py` (workspace-scoped types, per-project linkage). No workflow reference.
- Roles — `apps/api/plane/db/models/project.py`: `ROLE_CHOICES = ((20,"Admin"),(15,"Member"),(5,"Guest"))`; enforcement enum `ROLE` and `allow_permission(...)` in `apps/api/plane/app/permissions/base.py`.
- `Notification` model — `apps/api/plane/db/models/notification.py`: `receiver, triggered_by, entity_name, entity_identifier, data (JSON)`; dispatch via `apps/api/plane/bgtasks/notification_task.py`.
- Issue activity pipeline — `apps/api/plane/bgtasks/issue_activities_task.py`; issue-update seam writes `state_id` in `apps/api/plane/app/views/issue/base.py`.
- Entitlement flag `workflows_approvals: true` (`self-host-entitlements.ts`).

STUBBED (replace, do not extend the no-ops): `apps/web/ce/components/workflow/` — `workflow-disabled-overlay.tsx`, `workflow-group-tree.tsx`, `workflow-disabled-message.tsx`, `use-workflow-drag-n-drop.ts` (returns `isWorkflowDropDisabled: false`, empty handlers), `state-option.tsx` (accepts `filterAvailableStateIds` but ignores it).

## Gap to Close

- **State Transitions (MISSING):** no transition-rule model, no allowed-actor model, no `can_transition` enforcement at state-change time.
- **Role-Based Transition Permissions (PARTIAL):** project roles exist but carry no per-transition authorization; need allowed-roles AND allowed-members per transition, enforced at runtime.
- **Approval Gates (MISSING):** no approval model, request, sign-off, or pending-approval surface on work items.
- **Fallback State Routing (MISSING):** no fallback target on rejection; rejected items have nowhere to go.
- **Type-Specific Workflows (MISSING):** no link from `IssueType`/`ProjectIssueType` to a transition set; no auto-application on work-item creation.
- **Visual Workflow Builder (PARTIAL):** stubs no-op; need a real per-state-group transition/approval editor, preview, and drag enforcement.
- **Workflow Lifecycle Controls (MISSING):** no per-project enable/disable, no pause/resume, no maintenance/testing bypass.
- **AI-Suggested Transitions (MISSING):** no next-state suggestion on the work-item detail view.
- **AI Auto-Assignment Rules (MISSING):** no transition-triggered assignment/notification automation.

## Goals / Non-Goals

Goals:
- Enforce state-transition rules and role/member permissions at every state-change seam, multi-tenant by workspace + project.
- Approval gates with required approvers, sign-off, and fallback-state routing on rejection.
- Bind a workflow configuration to an issue type so new items of that type inherit it.
- Replace CE stubs with a working visual builder + board drag enforcement, gated by `workflows_approvals`.
- Per-project workflow lifecycle: enabled/paused/disabled, with admin-only maintenance bypass.
- Rules-first AI suggestion + auto-assignment that degrades to deterministic rules when the copilot is unavailable.

Non-Goals:
- Rebuilding state groups / custom states / reorder / default (PRESENT).
- Workspace-level (cross-project) shared workflow library — project-scoped only in v1.
- Proprietary ML model training or any Plane EE source.
- Multi-step / parallel approver quorums beyond "all required approvers" (single approval round in v1).
- Conditional/branching transitions on arbitrary field values (state→state + type only in v1).

## Requirements

Functional:
- FR1: A transition rule defines `(from_state → to_state)` within a project; absence of any rule for a project means transitions are unrestricted (backward-compatible).
- FR2: Each transition rule has allowed actors = union of `allowed_roles` (ProjectMember roles) and `allowed_member_ids`. Empty allowed set = any project member.
- FR3: A transition may require approval. When required, the move sets the item to a pending-approval state; the item's `state_id` does not change until all required approvers approve.
- FR4: On rejection, the item routes to the rule's `fallback_state` (must be a state in the same project); if none configured, it stays in the source state and surfaces a validation error.
- FR5: Workflows bind to an `IssueType` per project; a new work item of that type inherits the type's rule set. Items without a bound type fall back to project-default rules.
- FR6: Lifecycle: `enabled` (enforced), `paused` (rules visible/editable but not enforced), `disabled` (feature off). Project-admin maintenance bypass logged in activity.
- FR7: Every enforced rejection/approval/transition emits an issue activity entry and a notification to the relevant actor (approver on request, original assignee+creator on rejection).
- FR8: AI suggestion returns the highest-ranked legal `to_state` from configured rules + recent activity; auto-assignment applies the rule's `auto_assign_role`/`auto_assign_member` on transition.

Authorization (multi-tenant):
- AR1: All reads scoped by `workspace__slug` + `project_id` + active `ProjectMember`, matching `StateViewSet.get_queryset` exactly.
- AR2: Workflow/rule/approver config writes: `allow_permission([ROLE.ADMIN])` (project admin or workspace admin in project).
- AR3: Executing a transition: enforced against the rule's allowed actors via a dedicated check, not the blanket `allow_permission` — a Member may move A→B but be blocked B→C.
- AR4: Approving/rejecting: only `ProjectMember`s in the approval's `approver_member_ids` (or holding an approver role). Workspace admin override allowed but logged.
- AR5: api-key v1 callers enforced identically; the api key resolves to a `ProjectMember` whose role is checked the same way.

## Data Models

All models extend `ProjectBaseModel` (gives `workspace`, `project`, `created_by`, soft-delete) for project-scoped tenancy.

New: `WorkflowTransition` (`db_table = "workflow_transitions"`)
- `from_state` FK → `db.State` (PROTECT, `related_name="outgoing_transitions"`)
- `to_state` FK → `db.State` (PROTECT, `related_name="incoming_transitions"`)
- `issue_type` FK → `db.IssueType` (nullable; null = project-default rule set)
- `allowed_roles` `ArrayField(PositiveSmallIntegerField)` default `[]` (values from `ROLE_CHOICES`)
- `approval_required` `BooleanField(default=False)`
- `fallback_state` FK → `db.State` (nullable, SET_NULL, `related_name="fallback_for_transitions"`)
- `auto_assign_member` FK → `db.User` (nullable, SET_NULL); `auto_assign_role` `PositiveSmallIntegerField(null=True)`
- Constraint: unique `(project, issue_type, from_state, to_state, deleted_at)` partial-unique-when-null (mirror existing `State`/`ProjectIssueType` constraint style).

New: `WorkflowTransitionActor` (`db_table = "workflow_transition_actors"`)
- `transition` FK → `WorkflowTransition` (CASCADE, `related_name="actors"`)
- `member` FK → `db.ProjectMember` (CASCADE)
- Unique `(transition, member, deleted_at)`.
(Array `allowed_roles` covers role grants; this table covers explicit-member grants — keeps role checks index-free and member grants relational.)

New: `WorkItemApproval` (`db_table = "work_item_approvals"`)
- `issue` FK → `db.Issue` (CASCADE, `related_name="approvals"`)
- `transition` FK → `WorkflowTransition` (PROTECT)
- `requested_by` FK → `db.User`; `status` `CharField` choices `pending|approved|rejected` default `pending`
- `decided_by` FK → `db.User` (nullable); `decided_at` `DateTimeField(null=True)`; `comment` `TextField(blank=True)` (sanitized — see Security)
- `target_state` FK → `db.State` (the `to_state` being gated); `fallback_state` FK → `db.State` (nullable, snapshot of rule fallback at request time)

New: `WorkItemApprovalApprover` (`db_table = "work_item_approval_approvers"`)
- `approval` FK → `WorkItemApproval` (CASCADE, `related_name="approvers"`); `member` FK → `db.ProjectMember`; `responded` `BooleanField(default=False)`

Extended: `Project` (`apps/api/plane/db/models/project.py`)
- `workflow_status` `CharField` choices `disabled|enabled|paused` default `disabled` (backward-compatible: existing projects unaffected until an admin enables).

Migration notes:
- Forward: one additive migration creating the four new tables + the `Project.workflow_status` column with default `disabled`. No data backfill — zero rules means unrestricted, so existing transitions keep working.
- `ArrayField` requires Postgres (already the deploy DB per spec.md Cloud SQL).
- Rollback: reverse migration drops the four tables and the column. Because enforcement is gated on `workflow_status != "disabled"` AND presence of rules, dropping tables with the column defaulting to `disabled` is safe; no orphaned issue state. Add `WorkItemApproval.target_state`/`fallback_state` as SET_NULL so state deletion never blocks on approvals.

## API Contracts

Session endpoints (`apps/api/plane/app/urls/workflow.py`, new `WorkflowViewSet` in `apps/api/plane/app/views/workflow/`), scoped `workspaces/<slug>/projects/<project_id>/`:
- `GET/POST  .../workflow-transitions/` — list (filterable by `issue_type`, `from_state`); create. Create/update/delete: `allow_permission([ROLE.ADMIN])`.
- `GET/PATCH/DELETE .../workflow-transitions/<pk>/` — manage one rule and its actors.
- `GET/PATCH .../workflow-config/` — read/update `Project.workflow_status` (admin only).
- `POST .../issues/<issue_id>/state-transition/` — execute a transition: body `{ to_state }`. Enforces FR1–FR4; returns `200` with updated issue, or `202` + `{ approval_id }` when `approval_required`, or `403` (actor not allowed) / `409` (illegal transition).
- `GET  .../issues/<issue_id>/approvals/` — pending/decided approvals for the item.
- `POST .../approvals/<approval_id>/decision/` — body `{ status: approved|rejected, comment }`. Approver-scoped (AR4). On final approval → applies `target_state`; on rejection → routes to `fallback_state`, notifies assignee+creator.
- `GET  .../issues/<issue_id>/suggested-transition/` — returns `{ to_state, confidence, source: "rules"|"ai" }`.

api-key v1 (`apps/api/plane/api/urls/workflow.py`, `/api/v1/...`): mirror `workflow-transitions` (GET/POST/PATCH/DELETE) and `state-transition` with identical scoping and role checks. Response envelope follows existing v1 serializers; uses the same `ROLE`-based check resolved from the api key's member.

Enforcement seam: the existing issue update path in `apps/api/plane/app/views/issue/base.py` (and bulk update) routes `state_id` writes through a shared `enforce_state_transition(issue, new_state_id, actor)` service in `apps/api/plane/utils/`. This guarantees board drag-drop, detail-view changes, and api-key writes all hit the same gate.

## UX / UI Alignment

Entitlement wiring: replace the no-op CE stubs in `apps/web/ce/components/workflow/` with real implementations gated by `isSelfHostedFeatureEnabled("workflows_approvals")`. When the flag is false, components keep returning the disabled overlay (current behavior); when true, they enforce.

New MobX store `apps/web/core/store/workflow.store.ts` (+ root store registration): holds transitions, approvals, and `workflowStatus` per project; service in `packages/services` (`workflow.service.ts`) calling the session endpoints; types in `@plane/types`.

- **Visual builder (PARTIAL→DONE):** new sub-route `.../settings/projects/[projectId]/workflows/page.tsx` next to existing `states/page.tsx`. Card-based per-state-group layout (reuse `StateGroup` grouping from the states page); each state card shows outgoing transitions with allowed roles/members chips and an approval badge. Click a transition to edit allowed actors, toggle approval, pick fallback state, set auto-assign. Issue-type selector at top scopes the rule set (Type-Specific Workflows). Live preview pane renders the resulting graph read-only before save.
- **Board drag enforcement:** implement `use-workflow-drag-n-drop.ts` to return real `isWorkflowDropDisabled`/`getIsWorkflowWorkItemCreationDisabled` from the store; `workflow-group-tree.tsx` renders allowed target groups; `workflow-disabled-overlay.tsx` shows the reason (e.g., "Moving to Done requires approval"); `state-option.tsx` honors `filterAvailableStateIds` to grey out illegal targets in the state dropdown.
- **Approval surface on work item:** inline "Approval pending" banner near the state selector on the work-item detail view with Approve/Reject (approver-only) and the requester/target/fallback. Reuse existing notification components so approvers get notified inline.
- **AI suggestion widget:** small inline chip near the state selector calling `suggested-transition`; clickable to accept. Hidden when `source: "rules"` returns nothing.
- **Lifecycle toggle:** enabled/paused switch in the workflows settings header; filter/sort the builder by issue type.
- **Empty states:** builder with no rules → "Transitions are unrestricted. Add a rule to start governing this project." (matches existing project-settings empty-state asset pattern under `apps/web/app/assets/empty-state/project-settings`). Paused → muted banner "Workflow paused — rules are not enforced."

## Security

- Least privilege: config writes admin-only (AR2); transition execution checked against per-rule actors (AR3); approvals approver-only (AR4). Workspace-admin overrides allowed but written to issue activity.
- Rich text: `WorkItemApproval.comment` sanitized server-side with the project's existing HTML sanitizer before persist and before render; never `dangerouslySetInnerHTML` raw.
- No prompt/secret leakage: the AI suggestion path reuses the existing Gemini/Vertex copilot client; it sends only state names, type, and recent transition history — never API keys, member emails beyond display names, or full descriptions. The system prompt and model identifiers are never returned in the API response (`source` is just `"rules"|"ai"`).
- Signed URLs: not applicable (no new file assets); approval attachments out of scope for v1.
- Multi-tenant isolation: every query filtered by `workspace__slug` + `project_id` + active membership, identical to `StateViewSet.get_queryset`. No cross-project rule references (fallback/target states validated to belong to the same project).
- Fail-closed on enforcement errors: if the transition service raises, the state change is rejected (item stays put), never silently applied.

## Edge Cases

- Rule references a state later deleted: `from_state`/`to_state` PROTECT (deletion blocked while referenced); `fallback_state`/approval target SET_NULL (rejection with null fallback → item stays + error).
- Approval pending when the rule is edited/deleted: approval snapshots `target_state`+`fallback_state` at request time, so in-flight approvals resolve deterministically.
- Default state for new work items conflicts with type-specific entry rules: creation always allowed into the project default state; rules govern subsequent transitions only.
- Workflow `paused` mid-approval: pending approvals still resolve, but new transitions are not gated.
- Bulk state update touching items in different types: each item evaluated against its own type's rule set; partial success returns per-item results.
- Same member granted via both role and explicit member grant: allowed (union, deduped).
- AI copilot unavailable/times out: `suggested-transition` returns rules-only result; never 500s the detail view.
- api-key caller mapped to a Guest role attempting an admin-only transition: 403, identical to session.

## Testing Strategy

TDD, API-contract-first (per repo TESTING.md / pytest conventions in `apps/api`):
- RED→GREEN unit/contract tests (target ~70%): `enforce_state_transition` — allowed actor passes, disallowed actor 403, illegal transition 409, no-rules unrestricted, approval-required defers state, rejection routes to fallback, null fallback stays + errors. Type-specific resolution (typed vs default rule set). Lifecycle gating (disabled/paused/enabled). Multi-tenant leakage tests (rule from project A invisible/unusable in project B).
- Integration (~20%): full create-rule → request approval → approve/reject → notification emitted (assert `Notification` rows + activity entries); board drag path and api-key v1 path both hit the same gate; migration applies and reverses cleanly on a test DB.
- Frontend gating tests (~10%): `workflows_approvals=false` renders disabled overlay and no-ops drag; `=true` filters illegal state options and shows approval banner. MobX store action tests for optimistic transition + rollback on 403/409.
- Migration check: `makemigrations --check` clean; forward+rollback exercised in CI; assert existing projects default `workflow_status="disabled"` and transitions remain unrestricted (regression guard).
- AI path test: copilot mock failure → endpoint returns rules-only `200`, never leaks prompt/model id.

## Milestones

Each milestone is independently deployable behind `workflows_approvals` and revertible by commit.
- M1 — Data + migration: four tables + `Project.workflow_status`, serializers, admin. Rollback: reverse migration. No behavior change (no enforcement yet).
- M2 — Transition rules + role/member enforcement: `WorkflowViewSet`, `enforce_state_transition` at the issue-update seam (session + v1 + bulk). Rollback: revert seam wiring (rules become inert).
- M3 — Approval gates + fallback routing + notifications/activity. Rollback: feature-flag approvals off; transitions still enforced.
- M4 — Type-specific binding + lifecycle controls (enabled/paused/disabled + maintenance bypass).
- M5 — Visual builder UI + board drag enforcement + approval banner + store/service; replace CE stubs.
- M6 — AI suggestion + auto-assignment (rules-first, copilot-optional). Rollback: endpoint returns rules-only / no-op assignment.

## Rollback Plan

- Per-milestone: revert the milestone commit; tests catch regressions. Because enforcement is gated on `workflow_status != "disabled"` AND rule presence, and the column defaults to `disabled`, reverting code leaves data inert and item state untouched.
- Emergency kill switch: set `workflows_approvals: false` in `self-host-entitlements.ts` (frontend stops enforcing/showing builder) and/or flip all projects to `workflow_status="disabled"` (backend stops enforcing) — no migration needed.
- Full removal: reverse the M1 migration after disabling; PROTECT FKs guarantee no dangling state references; SET_NULL on targets/fallbacks means in-flight approvals degrade gracefully rather than corrupting issue state.

## Risk Tier

R1. This changes a public API contract (new `state-transition`/approval endpoints, altered effective behavior of issue `state_id` updates across session, v1, bulk, and board paths) and adds a schema migration — both "costly to reverse" per the workrules. It is governance-critical (controls who can move work and approve it) but is fully feature-flagged, defaults to `disabled`/unrestricted for existing projects, and has a clean reverse migration and a runtime kill switch. It is not R0: no money movement, no destructive data operation, and the enforcement seam fails closed with test coverage on the critical path (untested critical-path enforcement would be R0 — hence the TDD requirement above is mandatory before enabling enforcement in any environment).
