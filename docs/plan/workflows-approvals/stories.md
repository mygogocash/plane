# Workflows & Approvals — User Stories

These user stories decompose the six epics in [docs/plan/workflows-approvals/epics.md](docs/plan/workflows-approvals/epics.md), themselves derived from [docs/prd-workflows-approvals-2026-06-07.md](docs/prd-workflows-approvals-2026-06-07.md). Stories are grouped under their epic ID (`WF-1`…`WF-6`). Roles are **workspace admin**, **project lead** (project-admin, role 20), **project member** (role 15), **guest** (role 5), and **viewer** (read-only consumer of board/detail surfaces). Each story is TDD-first: the named failing test is the contract to satisfy. Default posture is `workflow_status="disabled"` with zero rules ⇒ unrestricted (backward-compatible).

---

## WF-1 — Workflow Data Model & Additive Migration

### WF-1.1 (epic WF-1) — Additive migration lands four tables + `Project.workflow_status` with zero behavior change

**Story**
As a workspace admin, I want the workflow schema to apply as a purely additive migration so that existing projects keep behaving exactly as before until I opt in.

**Acceptance criteria**
- **Given** a project created before this epic, **When** the migration is applied, **Then** its `Project.workflow_status` is `"disabled"`, no `workflow_transitions`/`work_item_approvals` rows exist, and issue `state_id` changes behave identically to pre-migration (`test_existing_project_defaults_disabled_and_state_changes_unrestricted`).
- **Given** `makemigrations --check` runs in CI after this epic, **When** the check executes, **Then** it reports no missing migrations (`test_makemigrations_check_clean`).
- **Given** the four tables (`workflow_transitions`, `workflow_transition_actors`, `work_item_approvals`, `work_item_approval_approvers`), **When** the migration completes, **Then** every model carries `workspace_id` + `project_id` columns inherited from `ProjectBaseModel` (`test_new_models_are_project_scoped`).

**Size** M
**Priority** P0
**Depends on** []

### WF-1.2 (epic WF-1) — Forward + rollback migration is clean and non-corrupting

**Story**
As a workspace admin, I want the migration to reverse cleanly so that I can fully remove the feature without orphaned or corrupted issue state.

**Acceptance criteria**
- **Given** the migration is applied then reversed on a test DB, **When** `migrate` runs forward then backward, **Then** all four tables and the `workflow_status` column are dropped with no orphaned issue-state rows and no PROTECT violations (`test_migration_forward_then_reverse_drops_cleanly`).
- **Given** a project with in-flight `work_item_approvals` rows, **When** the reverse migration runs after `workflow_status` is set to `"disabled"`, **Then** issue `state_id` values are untouched and the rollback succeeds (`test_rollback_leaves_issue_state_intact`).

**Size** S
**Priority** P0
**Depends on** [WF-1.1]

### WF-1.3 (epic WF-1) — Referential-integrity guarantees on state FKs (PROTECT vs SET_NULL)

**Story**
As a project lead, I want state references in rules to be integrity-safe so that deleting states never silently breaks or corrupts a rule or approval.

**Acceptance criteria**
- **Given** a `WorkflowTransition` referencing a `from_state`, **When** an admin attempts to delete that state, **Then** the delete is blocked (PROTECT) and the rule remains intact (`test_protect_blocks_deletion_of_referenced_from_state`).
- **Given** a `WorkflowTransition` whose `fallback_state` is later deleted, **When** the state delete succeeds, **Then** the rule's `fallback_state` becomes null (SET_NULL) and no record is corrupted (`test_set_null_on_fallback_state_deletion`).
- **Given** a `WorkItemApproval` snapshotting a `target_state`, **When** that state is deleted, **Then** `target_state` is set null (SET_NULL) and the approval row survives (`test_approval_target_state_set_null_on_delete`).

**Size** S
**Priority** P0
**Depends on** [WF-1.1]

### WF-1.4 (epic WF-1) — Partial-unique constraint prevents duplicate live rules but allows re-create after soft-delete

**Story**
As a project lead, I want the system to reject duplicate transition rules so that a given `(issue_type, from_state, to_state)` is unambiguous within a project.

**Acceptance criteria**
- **Given** a live rule for `(issue_type=Bug, from=A, to=B)`, **When** a second identical non-soft-deleted rule is created, **Then** the partial-unique constraint rejects it (`test_duplicate_live_rule_rejected`).
- **Given** the first rule is soft-deleted (`deleted_at` set), **When** an identical new rule is created, **Then** it is permitted (`test_recreate_rule_allowed_after_soft_delete`).
- **Given** two projects in the same workspace, **When** each creates a rule with identical `(issue_type, from, to)`, **Then** both are permitted because the constraint is per-project (`test_identical_rule_allowed_across_projects`).

**Size** S
**Priority** P1
**Depends on** [WF-1.1]

### WF-1.5 (epic WF-1) — Serializers and Django admin registered for all four models

**Story**
As a workspace admin, I want DRF serializers and Django admin entries for the new models so that the data is inspectable and the later viewsets have a serialization contract.

**Acceptance criteria**
- **Given** a created `WorkflowTransition`, **When** it is serialized, **Then** the output includes `from_state`, `to_state`, `issue_type`, `allowed_roles`, `approval_required`, `fallback_state`, `auto_assign_member`, `auto_assign_role`, and never exposes another project's rows (`test_workflow_transition_serializer_fields`).
- **Given** an admin opens the Django admin, **When** they view each of the four models, **Then** each is registered and lists project-scoped rows (`test_workflow_models_registered_in_admin`).
- **Given** a serializer payload with `allowed_roles=[99]` (not in `ROLE_CHOICES`), **When** it is validated, **Then** validation fails (`test_serializer_rejects_unknown_role_value`).

**Size** S
**Priority** P2
**Depends on** [WF-1.1]

---

## WF-2 — Transition-Rule Enforcement with Role & Member Permissions

### WF-2.1 (epic WF-2) — `enforce_state_transition` allows a legal move by a permitted actor

**Story**
As a project member, I want to move a work item along a configured transition I'm allowed to make so that I can advance my work without friction.

**Acceptance criteria**
- **Given** `workflow_status="enabled"` and a rule A→B allowing role Member, **When** a member moves an item A→B, **Then** the move succeeds (200) and `state_id` becomes B (`test_member_allowed_transition_succeeds`).
- **Given** a project with `workflow_status="disabled"` or no rules, **When** any actor moves an item between states, **Then** the move is unrestricted (`test_no_rules_or_disabled_is_unrestricted`).
- **Given** a member granted A→B via both `allowed_roles` and an explicit `WorkflowTransitionActor`, **When** they move A→B, **Then** the union is deduped and the move succeeds without a double-grant error (`test_role_and_member_grant_union_deduped`).
- **Given** the enforcement service raises an internal error mid-check, **When** a transition is attempted, **Then** the state change is rejected and the item stays put (fail-closed) (`test_internal_error_fails_closed`).

**Size** L
**Priority** P0
**Depends on** [WF-1.1]

### WF-2.2 (epic WF-2) — Illegal transitions (409) and disallowed actors (403) are blocked

**Story**
As a project lead, I want unconfigured moves and unauthorized actors blocked so that the board only advances through governed paths.

**Acceptance criteria**
- **Given** a rule A→B exists but no rule B→C, **When** any actor attempts B→C, **Then** the response is 409 and the state is unchanged (`test_unconfigured_transition_returns_409`).
- **Given** a rule A→B whose allowed actors exclude guests, **When** a guest attempts A→B, **Then** the response is 403 and the state is unchanged (`test_guest_excluded_actor_returns_403`).
- **Given** a rule A→B with an empty allowed set, **When** any active project member attempts A→B, **Then** the move succeeds (empty set = any member) (`test_empty_allowed_set_permits_any_member`).
- **Given** a viewer (no active `ProjectMember` write capability) attempts any transition, **When** the request executes, **Then** it is rejected (403) and the state is unchanged (`test_viewer_cannot_execute_transition`).

**Size** M
**Priority** P0
**Depends on** [WF-2.1]

### WF-2.3 (epic WF-2) — Single gate covers session, bulk, and board paths

**Story**
As a project lead, I want every state-change entry point to pass through one enforcement gate so that no path bypasses governance.

**Acceptance criteria**
- **Given** a board drag-drop and a session `state-transition` for the same illegal move, **When** each executes, **Then** both return 409 (`test_board_and_session_share_gate`).
- **Given** a bulk state update spanning multiple items where one item's transition is illegal, **When** the bulk runs, **Then** that item is rejected while legal items succeed, returned as per-item results, and no item's state is silently corrupted (`test_bulk_update_partial_success_per_item`).
- **Given** a bulk update where the actor is disallowed on one item's rule, **When** it runs, **Then** that item returns 403 in its per-item result while permitted items proceed (`test_bulk_update_mixed_authz_results`).

**Size** M
**Priority** P0
**Depends on** [WF-2.1]

### WF-2.4 (epic WF-2) — `WorkflowViewSet` CRUD for transition rules is admin-gated and project-scoped

**Story**
As a project lead, I want to create, read, update, and delete transition rules and their actors so that I can author the governance for my project.

**Acceptance criteria**
- **Given** a project admin, **When** they POST a new rule and PATCH its allowed actors, **Then** the operations succeed and persist (`test_admin_can_crud_transition_rules`).
- **Given** a non-admin member, **When** they attempt to create or delete a rule, **Then** the response is 403 via `allow_permission([ROLE.ADMIN])` (`test_member_cannot_write_rules`).
- **Given** rules in project A, **When** a user lists `workflow-transitions` under project B, **Then** project A's rules are not returned (multi-tenant scoping) (`test_rules_scoped_to_project`).
- **Given** a list request filtered by `issue_type` and `from_state`, **When** it executes, **Then** only matching rules for the active project are returned (`test_rule_list_filters_apply`).
- **Given** an empty project with no rules, **When** an admin lists rules, **Then** an empty collection is returned without error (`test_rule_list_empty_state`).

**Size** L
**Priority** P0
**Depends on** [WF-2.1]

### WF-2.5 (epic WF-2) — api-key v1 path enforced identically to session

**Story**
As a workspace admin integrating via the v1 API key, I want transitions and rule CRUD enforced the same way so that automation cannot bypass governance.

**Acceptance criteria**
- **Given** an api-key resolving to a guest `ProjectMember`, **When** it calls `/api/v1/.../state-transition/` for an admin-only move, **Then** the response is 403, identical to session (`test_v1_guest_blocked_same_as_session`).
- **Given** an api-key resolving to a member allowed A→B, **When** it executes A→B via v1, **Then** the move succeeds (200) with the v1 response envelope (`test_v1_allowed_transition_succeeds`).
- **Given** an api-key for project A, **When** it attempts rule CRUD against project B, **Then** project B's rules remain inaccessible (`test_v1_rule_crud_scoped_to_project`).

**Size** M
**Priority** P1
**Depends on** [WF-2.4]

---

## WF-3 — Approval Gates, Fallback Routing & Notifications

### WF-3.1 (epic WF-3) — A gated transition defers state and opens a pending approval

**Story**
As a project member, I want a move requiring sign-off to hold the item in place and request approval so that work doesn't advance prematurely.

**Acceptance criteria**
- **Given** a rule A→Done with `approval_required=True` and two required approvers, **When** an allowed actor requests the move, **Then** the endpoint returns 202 + `approval_id`, `state_id` stays at A, a `WorkItemApproval` (pending) plus two `WorkItemApprovalApprover` rows are created, and each approver receives a `Notification` (`test_gated_request_returns_202_and_defers_state`).
- **Given** a gated request, **When** the approval is created, **Then** `target_state` and `fallback_state` are snapshotted from the rule at request time (`test_approval_snapshots_target_and_fallback`).
- **Given** an item already has a pending approval for the same target, **When** a second identical request is made, **Then** no duplicate pending approval is created and the existing one is returned (`test_duplicate_pending_request_is_idempotent`).

**Size** L
**Priority** P0
**Depends on** [WF-2.1, WF-1.1]

### WF-3.2 (epic WF-3) — Full approval advances the item; partial approval holds it

**Story**
As an approver, I want my sign-off to count toward the required set so that the item advances only when all required approvers approve.

**Acceptance criteria**
- **Given** a pending approval with two required approvers, **When** the first approves, **Then** the item stays at A and the approval remains pending (`test_partial_approval_holds_state`).
- **Given** the same approval, **When** the second approver approves, **Then** the item advances to Done and an activity entry records the approval (`test_final_approval_advances_state_and_logs_activity`).
- **Given** the final approval applies the move, **When** `state_id` is written, **Then** it passes through `enforce_state_transition` so the applied move is itself recorded consistently (`test_applied_move_routes_through_gate`).

**Size** M
**Priority** P0
**Depends on** [WF-3.1]

### WF-3.3 (epic WF-3) — Rejection routes to fallback or holds with an error

**Story**
As an approver, I want rejection to send the item to a defined fallback so that rejected work has a clear next home, and to fail safely when none is configured.

**Acceptance criteria**
- **Given** a pending approval whose rule has `fallback_state=Backlog`, **When** an approver rejects, **Then** the item routes to Backlog and the original assignee + creator each receive a rejection `Notification` and an activity entry is written (`test_rejection_routes_to_fallback_and_notifies`).
- **Given** a pending approval whose rule has no fallback configured, **When** an approver rejects, **Then** the item stays in the source state and a validation error is returned with no silent move (`test_rejection_with_null_fallback_stays_and_errors`).
- **Given** the snapshotted `fallback_state` was deleted (SET_NULL) after the request, **When** the approval is rejected, **Then** the item stays put and the null-fallback validation error is returned (`test_rejection_with_deleted_fallback_treated_as_null`).

**Size** M
**Priority** P0
**Depends on** [WF-3.1]

### WF-3.4 (epic WF-3) — Only approvers may decide; workspace-admin override is logged

**Story**
As a project lead, I want decision authority restricted to the named approvers, with workspace-admin override auditable, so that approvals can't be subverted.

**Acceptance criteria**
- **Given** a project member not in the approver set, **When** they POST a decision, **Then** the response is 403 and the approval is unchanged (`test_non_approver_decision_403`).
- **Given** a workspace admin not in the approver set, **When** they override and decide, **Then** the decision is applied and an activity entry records the override and the admin (`test_workspace_admin_override_logged`).
- **Given** an approval already in `approved`/`rejected` state, **When** a further decision is POSTed, **Then** it is rejected as already decided (no double-decision) (`test_decision_on_resolved_approval_rejected`).
- **Given** an api-key v1 caller resolving to a non-approver, **When** it POSTs a decision, **Then** it is 403 identical to session (`test_v1_non_approver_decision_403`).

**Size** M
**Priority** P0
**Depends on** [WF-3.1]

### WF-3.5 (epic WF-3) — In-flight approvals resolve deterministically against the snapshot

**Story**
As an approver, I want an approval I'm deciding to honor the rule as it was when requested so that mid-flight rule edits don't change the outcome under me.

**Acceptance criteria**
- **Given** a pending approval whose rule's fallback is changed after the request, **When** the approval is decided, **Then** it resolves using the snapshotted target/fallback, not the edited rule (`test_decision_uses_snapshot_not_edited_rule`).
- **Given** a pending approval whose rule is deleted after the request, **When** the approval is decided, **Then** it still resolves from its snapshot (`test_decision_resolves_after_rule_deleted`).
- **Given** `workflow_status` flips to `paused` mid-approval, **When** the pending approval is decided, **Then** it still resolves, while new transitions are no longer gated (`test_paused_resolves_pending_but_does_not_gate_new`).

**Size** M
**Priority** P1
**Depends on** [WF-3.1]

### WF-3.6 (epic WF-3) — Approval comment is sanitized server-side on write and render

**Story**
As a project lead, I want approval comments sanitized so that approval notes can't inject script into other users' views.

**Acceptance criteria**
- **Given** a decision comment containing script markup, **When** it is persisted, **Then** the stored value is sanitized by the project's existing server-side HTML sanitizer (`test_comment_sanitized_on_write`).
- **Given** a stored comment, **When** it is serialized for render, **Then** the response is sanitized again and never returns raw script markup (`test_comment_sanitized_on_render`).
- **Given** an empty comment on a decision, **When** the decision is submitted, **Then** it is accepted (comment optional) (`test_empty_comment_accepted`).

**Size** S
**Priority** P1
**Depends on** [WF-3.4]

### WF-3.7 (epic WF-3) — `GET .../approvals/` lists pending and decided approvals for an item

**Story**
As a project member, I want to see an item's approval history and pending requests so that I understand why it hasn't moved.

**Acceptance criteria**
- **Given** an item with one pending and one rejected approval, **When** a project member GETs `.../issues/<id>/approvals/`, **Then** both are returned with status, requester, target, fallback, and per-approver `responded` flags (`test_list_approvals_returns_pending_and_decided`).
- **Given** an item with no approvals, **When** the list is requested, **Then** an empty collection is returned without error (`test_list_approvals_empty`).
- **Given** approvals belonging to an item in project A, **When** requested under project B's scope, **Then** none are returned (`test_list_approvals_scoped_to_project`).

**Size** S
**Priority** P1
**Depends on** [WF-3.1]

---

## WF-4 — Type-Specific Workflow Binding & Lifecycle Controls

### WF-4.1 (epic WF-4) — Typed rule set takes precedence; untyped items use project-default

**Story**
As a project lead, I want each issue type to govern with its own rule set so that a Bug and a Feature can follow different paths.

**Acceptance criteria**
- **Given** a Bug rule set (A→B) and a project-default set (A→C), **When** a Bug item attempts A→B, **Then** it is allowed; **When** the same Bug item attempts A→C (default-only), **Then** it is rejected (typed set takes precedence) (`test_typed_set_precedence_over_default`).
- **Given** an item with no bound issue type, **When** it transitions, **Then** the project-default (`issue_type=null`) rule set governs it (`test_untyped_item_uses_default_set`).
- **Given** a typed item whose type has no rules but a default set exists, **When** it transitions, **Then** behavior follows the resolution contract under test (typed-empty does not silently fall through to default unless specified) (`test_typed_empty_set_resolution`).

**Size** L
**Priority** P0
**Depends on** [WF-2.1, WF-1.1]

### WF-4.2 (epic WF-4) — Creation always lands in project default state regardless of rules

**Story**
As a project member, I want to create work items without rules blocking creation so that entry is never gated, only subsequent transitions.

**Acceptance criteria**
- **Given** any new work item of a type with entry rules, **When** it is created, **Then** it lands in the project default state regardless of rules (`test_creation_ignores_transition_rules`).
- **Given** a project with no default state edge case, **When** an item is created, **Then** creation succeeds with the project's configured default and no transition enforcement runs (`test_creation_runs_no_enforcement`).

**Size** S
**Priority** P0
**Depends on** [WF-4.1]

### WF-4.3 (epic WF-4) — Type resolution respects per-project `ProjectIssueType` linkage

**Story**
As a workspace admin, I want workspace-scoped types to resolve rules only for projects they're linked to so that one project's rules never leak into another.

**Acceptance criteria**
- **Given** a workspace-scoped type not linked to project B, **When** rule resolution runs for a project-B item, **Then** that type's rules are never resolved for project B (`test_unlinked_type_rules_not_resolved_cross_project`).
- **Given** a type linked to both project A and B with distinct rule sets, **When** a project-A item resolves, **Then** only project A's rows are considered (`test_linked_type_resolves_only_active_project_rules`).

**Size** M
**Priority** P0
**Depends on** [WF-4.1]

### WF-4.4 (epic WF-4) — `workflow-config` lifecycle endpoint is admin-only; `paused` is non-enforcing

**Story**
As a project lead, I want to switch the project between disabled, enabled, and paused so that I can roll governance out and pause it without losing my rules.

**Acceptance criteria**
- **Given** a project admin, **When** they PATCH `.../workflow-config/` to `enabled`, **Then** the status persists and enforcement activates (`test_admin_can_set_workflow_status`).
- **Given** a non-admin member, **When** they PATCH `.../workflow-config/`, **Then** the response is 403 (`test_non_admin_cannot_change_status`).
- **Given** `workflow_status="paused"`, **When** a member attempts any transition, **Then** it is not gated, and the rules remain listable and editable via the API (`test_paused_does_not_gate_but_rules_editable`).
- **Given** `workflow_status="paused"`, **When** an admin lists another project's rules through the typed-resolution path, **Then** no cross-project rules leak (`test_paused_keeps_reads_scoped`).

**Size** M
**Priority** P0
**Depends on** [WF-2.1]

### WF-4.5 (epic WF-4) — Admin maintenance bypass executes an illegal move but is logged

**Story**
As a project lead, I want a logged maintenance bypass so that I can correct stuck items during maintenance without disabling governance, while keeping an audit trail.

**Acceptance criteria**
- **Given** `workflow_status="enabled"` and a project admin invokes a maintenance bypass on an illegal transition, **When** it executes, **Then** the move succeeds and an issue activity entry records the bypass and the acting admin (`test_admin_bypass_succeeds_and_logs`).
- **Given** a non-admin member attempts a maintenance bypass, **When** the request executes, **Then** it is 403 and no bypass occurs (`test_non_admin_bypass_denied`).
- **Given** a bypass move, **When** the activity is written, **Then** it is distinguishable from a normal transition (flagged as a bypass) (`test_bypass_activity_is_distinct`).

**Size** M
**Priority** P1
**Depends on** [WF-4.4]

---

## WF-5 — Visual Workflow Builder, Board Drag Enforcement & Approval Surface

### WF-5.1 (epic WF-5) — Feature flag gates real behavior; disabled overlay preserved when off

**Story**
As a viewer, I want the workflow surfaces to behave exactly as before when the feature is off so that disabling the flag is a safe kill switch.

**Acceptance criteria**
- **Given** `workflows_approvals=false`, **When** the workflow components render, **Then** they show the disabled overlay and board drag is a no-op (current behavior preserved) (`test_flag_false_renders_disabled_overlay`).
- **Given** `workflows_approvals=true`, **When** the components render, **Then** real enforcement and the builder are exposed (`test_flag_true_enables_real_surfaces`).
- **Given** the flag is true but the server is authoritative, **When** the client renders, **Then** no client-only gating is treated as authoritative (UI is presentation + optimistic only) (`test_client_gating_not_authoritative`).

**Size** S
**Priority** P0
**Depends on** [WF-2.4]

### WF-5.2 (epic WF-5) — `workflow.store` performs optimistic transition with rollback on 403/409

**Story**
As a project member, I want my board moves to feel instant but self-correct so that an illegal or unauthorized move snaps back cleanly.

**Acceptance criteria**
- **Given** a legal transition, **When** the member triggers it, **Then** the store applies it optimistically and confirms on the server's 200 (`test_store_optimistic_apply_confirmed`).
- **Given** a move the server rejects with 403 or 409, **When** the response returns, **Then** the store rolls the item back to its prior state and surfaces the reason (`test_store_rollback_on_403_409`).
- **Given** the store loads transitions/approvals/`workflowStatus` for a project, **When** the project changes, **Then** state is scoped per project and not bled across projects (`test_store_state_scoped_per_project`).

**Size** M
**Priority** P0
**Depends on** [WF-5.1, WF-2.5]

### WF-5.3 (epic WF-5) — State dropdown and board greys out illegal targets with a reason

**Story**
As a project member, I want illegal target states visibly disabled so that I understand which moves are permitted before I attempt them.

**Acceptance criteria**
- **Given** `workflows_approvals=true` and a rule A→B (no rule A→C), **When** a user opens the state dropdown on an item in state A, **Then** C is greyed out via `filterAvailableStateIds` and B is selectable (`test_state_option_honors_filter_available_ids`).
- **Given** a board with an illegal drag target, **When** the user drags an item there, **Then** the drop is disabled and `workflow-disabled-overlay` shows the reason (e.g., "Moving to Done requires approval") (`test_board_drop_disabled_shows_reason`).
- **Given** an item in a state with no legal outgoing transitions, **When** the dropdown opens, **Then** all non-current targets are greyed and the current state remains shown (`test_no_legal_targets_all_greyed`).

**Size** M
**Priority** P0
**Depends on** [WF-5.2]

### WF-5.4 (epic WF-5) — Visual builder authors transitions, actors, approval, fallback, auto-assign with live preview

**Story**
As a project lead, I want a per-state-group builder to author the full rule so that I can configure governance visually and preview it before saving.

**Acceptance criteria**
- **Given** the workflows settings sub-route with an issue type selected, **When** the lead edits a transition's allowed actors, approval toggle, fallback, and auto-assign and previews, **Then** the read-only live preview renders the resulting graph before save, and saving persists via the service (`test_builder_edit_preview_save_roundtrip`).
- **Given** a project with no rules, **When** the builder loads, **Then** the unrestricted empty state is shown ("Transitions are unrestricted. Add a rule to start governing this project.") (`test_builder_empty_state`).
- **Given** `workflow_status="paused"`, **When** the builder loads, **Then** the muted paused banner is shown and rules remain editable (`test_builder_paused_banner`).
- **Given** a non-admin opens the builder route, **When** it renders, **Then** edit controls are not available (read-only or hidden) consistent with server admin-gating (`test_builder_non_admin_read_only`).

**Size** L
**Priority** P0
**Depends on** [WF-5.1, WF-4.4]

### WF-5.5 (epic WF-5) — Approval banner on work-item detail with approver-only actions

**Story**
As an approver, I want an inline approval banner so that I can approve or reject without leaving the work item, and non-approvers see status without controls.

**Acceptance criteria**
- **Given** an item with a pending approval, **When** an approver opens the detail view, **Then** the "Approval pending" banner shows requester/target/fallback with Approve/Reject buttons (`test_banner_shows_actions_for_approver`).
- **Given** the same item, **When** a non-approver project member opens the detail view, **Then** the banner is shown without action buttons (`test_banner_no_actions_for_non_approver`).
- **Given** a rendered approval comment, **When** the banner displays it, **Then** it is rendered through sanitized output only, never `dangerouslySetInnerHTML` on raw HTML (`test_banner_comment_render_sanitized`).
- **Given** an item with no pending approval, **When** the detail view renders, **Then** no approval banner appears (`test_banner_hidden_without_pending`).

**Size** M
**Priority** P0
**Depends on** [WF-5.2, WF-3.7]

### WF-5.6 (epic WF-5) — Lifecycle toggle in settings header reads/writes `workflowStatus`

**Story**
As a project lead, I want an enabled/paused toggle in the workflows header so that I can control enforcement from the builder surface.

**Acceptance criteria**
- **Given** the workflows settings header, **When** an admin flips enabled↔paused, **Then** the store calls `workflow-config` and reflects the new `workflowStatus` (`test_lifecycle_toggle_persists`).
- **Given** a server rejection on the toggle (e.g., 403), **When** the response returns, **Then** the toggle reverts and surfaces the error (`test_lifecycle_toggle_rollback_on_error`).

**Size** S
**Priority** P1
**Depends on** [WF-5.4]

---

## WF-6 — AI-Suggested Transitions & Auto-Assignment (Rules-First, Copilot-Optional)

### WF-6.1 (epic WF-6) — Suggested-transition endpoint ranks legal targets, copilot-enriched when available

**Story**
As a project member, I want a suggested next state so that I can advance work along the most likely legal path with one click.

**Acceptance criteria**
- **Given** an item in state A with legal rule targets B and C and the copilot available, **When** `GET .../suggested-transition/` is called, **Then** it returns the highest-ranked legal target with `source:"ai"` and a confidence (`test_suggestion_ai_source_when_copilot_available`).
- **Given** an item with no legal next state from rules, **When** the endpoint is called, **Then** nothing rankable is returned and the response signals an empty suggestion (`test_suggestion_empty_when_no_legal_targets`).
- **Given** a suggestion request, **When** it is scoped, **Then** it only ranks legal targets from the item's resolved (typed/default) rule set in the active project (`test_suggestion_uses_resolved_rule_set`).

**Size** M
**Priority** P1
**Depends on** [WF-4.1]

### WF-6.2 (epic WF-6) — Copilot failure degrades to rules-only without leaking prompt or model id

**Story**
As a workspace admin, I want suggestions to never break the detail view or leak AI internals so that the copilot is safe and optional.

**Acceptance criteria**
- **Given** the copilot is unavailable or times out, **When** the endpoint is called, **Then** it returns a rules-only result with `source:"rules"` and HTTP 200 — the detail view never 500s (`test_copilot_failure_returns_rules_only_200`).
- **Given** any suggestion response, **When** it is inspected, **Then** it never contains the system prompt or model identifier (`source` is only `"rules"|"ai"`) (`test_suggestion_response_no_prompt_or_model_leak`).
- **Given** the AI path is invoked, **When** the request payload is built, **Then** it sends only state names, issue type, and recent transition history — never API keys, member emails, or full descriptions (`test_ai_payload_minimization`).

**Size** M
**Priority** P0
**Depends on** [WF-6.1]

### WF-6.3 (epic WF-6) — Auto-assignment fires on the applied move and respects membership

**Story**
As a project lead, I want a configured auto-assign to apply on a successful transition so that the right person picks up the work, without breaking moves when the target isn't a valid member.

**Acceptance criteria**
- **Given** a rule A→B with `auto_assign_member=X`, **When** an allowed actor completes A→B, **Then** X is assigned and receives a `Notification` (`test_auto_assign_member_on_transition`).
- **Given** the configured `auto_assign_member` is not an active project member, **When** the move completes, **Then** the assignment is skipped without corrupting the transition (`test_auto_assign_skipped_for_inactive_member`).
- **Given** a transition that requires approval with auto-assign configured, **When** the approval is finally approved and the item advances, **Then** auto-assignment fires on the applied move (not on the pending request) (`test_auto_assign_fires_on_approval_apply_not_request`).
- **Given** a transition is rejected/blocked (403/409), **When** enforcement fails, **Then** no auto-assignment occurs (fail-closed) (`test_no_auto_assign_on_blocked_transition`).

**Size** M
**Priority** P1
**Depends on** [WF-6.1, WF-3.2]

### WF-6.4 (epic WF-6) — AI suggestion chip on detail view is clickable and hidden when empty

**Story**
As a project member, I want a one-click suggestion chip near the state selector so that accepting a suggested transition is effortless and the chip stays out of the way when there's nothing to suggest.

**Acceptance criteria**
- **Given** a suggestion with a rankable target, **When** the detail view renders, **Then** the chip appears near the state selector and clicking it triggers the suggested transition through the store (`test_chip_visible_and_clickable`).
- **Given** the endpoint yields nothing rankable (empty suggestion), **When** the detail view renders, **Then** the chip is hidden (`test_chip_hidden_when_empty`).
- **Given** the chip-triggered transition is rejected by the server (403/409 or approval-required 202), **When** the response returns, **Then** the store handles it consistently (rollback or approval flow) and the chip does not force an illegal move (`test_chip_transition_respects_enforcement`).

**Size** S
**Priority** P2
**Depends on** [WF-6.1, WF-5.2]
