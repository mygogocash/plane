# Workflows & Approvals — Design (plane.so alignment)

This document maps each plane.so screen the user will screenshot to the fork's current behavior and the required change to reach parity. Annotations are framed as `| UI element | plane.so behavior | Fork status | Required change |` tables. Status terms match the PRD: **PRESENT** (do not rebuild), **PARTIAL** (stub exists, no-op), **MISSING** (absent). All work is gated behind `workflows_approvals` in `apps/web/ce/lib/self-host-entitlements.ts` (line 27) via `isSelfHostedFeatureEnabled("workflows_approvals")` (line 33).

Routes are declared with the `route(...)` / `layout(...)` helpers in `apps/web/app/routes/core.ts` (states sits at lines 328–329, labels 333–334, estimates 338–339, all nested under the `settings/projects/[projectId]/layout.tsx` layout at line 294). New screens slot into this same structure.

---

## Reference: plane.so Settings > Features

> User's screenshot: the workspace/project Settings page with a "Features" panel listing toggleable capabilities (Cycles, Modules, Views, Pages, Work item types, Time tracking, and — on plane.so — "Workflows"). Each row is a label + short description + a right-aligned toggle switch. "Workflows" appears as a togglable project feature alongside the others.

| UI element | plane.so behavior | Fork status | Required change |
|---|---|---|---|
| "Workflows" feature row | Shown as a project feature with an enable toggle; flipping it on reveals the Workflows settings tab and activates board-drag enforcement | PARTIAL — entitlement flag `workflows_approvals: true` exists but no feature row renders it; toggling does nothing | Add a "Workflows & Approvals" row to the project Features panel. The row's visibility is gated by `isSelfHostedFeatureEnabled("workflows_approvals")`; the toggle drives `Project.workflow_status` (`disabled` → `enabled`) via the `workflow-config` endpoint, not a separate boolean |
| Feature description copy | "Define how work items move between states and require approvals." | MISSING | Add description string; surface under the row label using the existing feature-row component pattern in `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/projects/[projectId]/features/` |
| Toggle disabled tooltip (no entitlement) | n/a (cloud always entitled) | PARTIAL — CE returns disabled overlay | When `workflows_approvals=false`, render the existing `workflow-disabled-overlay.tsx` reason text instead of an active toggle |
| Persistence | Toggle state persists per project | MISSING (no field) | Persist via new `Project.workflow_status` column (PRD Data Models); default `disabled` so existing projects are unaffected |

**Implementation mapping**
- **Route:** no new route — extends the existing Features area. Feature rows live under `settings/projects/[projectId]/features/*` (routes at `core.ts` lines 307–315).
- **Components:** new `WorkflowFeatureToggle` in `apps/web/ce/components/workflow/` (replacing the no-op posture of `workflow-disabled-overlay.tsx`); reuse the project-feature-row layout already used for Cycles/Modules.
- **MobX store:** `apps/web/core/store/workflow.store.ts` (new, registered on the root store) holds `workflowStatus` per project; toggle dispatches an optimistic `setWorkflowStatus` action with rollback on non-2xx.
- **Service:** `packages/services/workflow.service.ts` → `GET/PATCH .../workflow-config/`.
- **Entitlement wiring:** row gated by `isSelfHostedFeatureEnabled("workflows_approvals")`; backend writes require `allow_permission([ROLE.ADMIN])` (AR2).
- **Empty/loading/error:** loading → skeleton row; error on PATCH → toast + revert toggle (optimistic rollback). When entitlement off → disabled overlay with reason.
- **Responsive:** row reflows label-above-toggle under ~640px, matching sibling feature rows.
- **a11y:** toggle is a labelled `role="switch"` with `aria-checked`; description linked via `aria-describedby`; keyboard-operable (Space/Enter).

---

## Reference: "Project States" toggle screen

> User's screenshot: the project States settings page (`settings/projects/[projectId]/states`) showing the six state groups (Backlog, Unstarted, Started, Completed, Cancelled, Triage) with their custom states listed under each group, color swatches, drag handles for reorder, a "+" to add a state, and a "default" indicator on one state. plane.so adds an inline hint or a sibling "Workflows" entry that ties these states to transition rules.

| UI element | plane.so behavior | Fork status | Required change |
|---|---|---|---|
| State groups + custom states list | Full CRUD, grouped display, color, reorder, set-default | PRESENT — do not rebuild. `StateViewSet` (`apps/api/plane/app/views/state/base.py`) + states page (`states/{page,header}.tsx`) | No change. Workflows reuse `StateGroup` grouping from this page for the builder layout |
| Reorder (drag) + sequence | `sequence` (float) reorder, persisted | PRESENT (`State.sequence`) | No change |
| Set default state | `mark_as_default` action | PRESENT | No change. New work items always allowed into the default state regardless of rules (PRD Edge Cases — creation never blocked) |
| Link from a state to its transitions | Each state hints which transitions originate/terminate there | MISSING | The builder (next screen) renders outgoing transitions per state card; this page gains a passive "Manage workflows" link in `header.tsx` pointing to the new `workflows` sub-route |
| Delete state referenced by a rule | Blocked with explanation | MISSING (no rules yet) | Backend: `from_state`/`to_state` are `PROTECT` FKs on `WorkflowTransition` (deletion blocked while referenced); surface the DB protect error as a friendly "State is used by a workflow transition" message on the states page delete flow |

**Implementation mapping**
- **Route:** unchanged (`core.ts` 328–329).
- **Components:** add a "Manage workflows" affordance in the existing `states/header.tsx`; no rebuild of the states list. Delete-error mapping in the existing state-delete confirmation component.
- **MobX store:** read-only consumption of the existing state store for group/state data; the workflow store references `state_id`s, never duplicates state data (avoids redundant client state).
- **Service:** none new here; relies on existing state service.
- **Empty/loading/error:** unchanged from the present states page; new delete-protect error → inline toast "Cannot delete: state is used by a workflow transition."
- **Responsive / a11y:** inherited from the existing states page; the new header link is a standard focusable `<a>`/router link with descriptive text.

---

## Reference: Workflows & Approvals — Visual Workflow Builder (per-work-item-type transition rules, who-can-move, required approvals)

> User's screenshot: the Workflows builder. A header with an issue-type selector (e.g., "Default", "Bug", "Epic") scoping the rule set, and an enabled/paused toggle. Below, a card per state grouped by `StateGroup`. Each state card lists its outgoing transitions (arrows to target states); each transition row shows allowed-role chips, allowed-member avatars, and an "Approval required" badge. Clicking a transition opens an editor to set allowed roles/members, toggle approval, pick a fallback state, and set auto-assign. A read-only preview pane renders the resulting transition graph before save.

| UI element | plane.so behavior | Fork status | Required change |
|---|---|---|---|
| Issue-type selector (scopes rules) | Selecting a type filters/edits that type's transition set; "Default" = project-default rules | MISSING — no `IssueType`→workflow link | Bind rules to type via `WorkflowTransition.issue_type` FK (nullable; null = project-default). Selector filters `GET .../workflow-transitions/?issue_type=`. Reuses existing `IssueType`/`ProjectIssueType` (`apps/api/plane/db/models/issue_type.py`) — no new type model |
| State cards grouped by group | Cards laid out per `StateGroup`, transitions drawn between | PARTIAL — `workflow-group-tree.tsx` is a no-op stub | Implement `workflow-group-tree.tsx` to render allowed target groups; reuse `StateGroup` grouping from the states page |
| Transition row (from→to) | One row per `(from_state → to_state)` rule | MISSING — no transition model | Create `WorkflowTransition` (`workflow_transitions`); FR1: absence of any rule = unrestricted (backward-compatible). Unique `(project, issue_type, from_state, to_state, deleted_at)` partial-unique |
| Allowed-role chips | Chips for roles permitted to make this move | PARTIAL — roles exist, no per-transition link | `WorkflowTransition.allowed_roles` `ArrayField` of `ROLE_CHOICES` values (Admin 20 / Member 15 / Guest 5). FR2 |
| Allowed-member avatars | Explicit members granted this move (union with roles) | MISSING | `WorkflowTransitionActor` (`workflow_transition_actors`) → `ProjectMember`. Empty role+member set = any project member (FR2) |
| "Approval required" badge + toggle | Marks the transition as gated | MISSING | `WorkflowTransition.approval_required` (bool). When on, the move defers `state_id` and creates a `WorkItemApproval` (FR3) |
| Fallback-state picker | Target state on rejection | MISSING | `WorkflowTransition.fallback_state` FK (nullable, SET_NULL). FR4: rejection routes here; null → item stays + validation error. Validated same-project only |
| Auto-assign setting | Assign role/member on transition | MISSING | `auto_assign_member` FK / `auto_assign_role` (nullable). Applied on transition (FR8) |
| Live preview pane | Read-only graph before save | PARTIAL — no preview | New preview pane renders the would-be graph from store state, read-only, before commit |
| Save / create rule | Persists rule + actors | MISSING | `POST/PATCH .../workflow-transitions/` — `allow_permission([ROLE.ADMIN])` (AR2) |
| `state-option.tsx` legal-target filtering | Greys out illegal targets in state dropdowns | PARTIAL — accepts `filterAvailableStateIds` but ignores it | Honor `filterAvailableStateIds`: grey out / disable illegal `to_state`s |

**Implementation mapping**
- **Route:** new sub-route `:workspaceSlug/settings/projects/:projectId/workflows` → `./(all)/[workspaceSlug]/(settings)/settings/projects/[projectId]/workflows/page.tsx`, added to `apps/web/app/routes/core.ts` immediately after the states entry (line 329), nested in the same project-settings `layout.tsx` (line 294). A `workflows/header.tsx` mirrors `states/header.tsx`.
- **Components (`apps/web/ce/components/workflow/`, replacing no-op stubs):** implement `workflow-group-tree.tsx` (per-group state cards + transition rows), `state-option.tsx` (honor `filterAvailableStateIds`); new `WorkflowBuilder`, `TransitionEditorPanel`, `WorkflowPreviewPane`, `IssueTypeScopeSelector` in `apps/web/core/components/workflow/`.
- **MobX store:** `apps/web/core/store/workflow.store.ts` holds `transitions` keyed by `(issueTypeId|default)`, plus `workflowStatus`; actions `fetchTransitions`, `upsertTransition`, `deleteTransition`, `setTransitionActors` with optimistic update + rollback on 403/409.
- **Service:** `packages/services/workflow.service.ts` → `GET/POST .../workflow-transitions/`, `GET/PATCH/DELETE .../workflow-transitions/<pk>/`. Types in `@plane/types` (`TWorkflowTransition`, `TWorkflowTransitionActor`).
- **Entitlement wiring:** entire builder route-guarded by `isSelfHostedFeatureEnabled("workflows_approvals")`; when false, render `workflow-disabled-overlay.tsx`. Backend config writes `allow_permission([ROLE.ADMIN])`.
- **Empty state:** no rules → "Transitions are unrestricted. Add a rule to start governing this project." using the empty-state asset pattern under `apps/web/app/assets/empty-state/project-settings`.
- **Loading:** card-grid skeleton per state group.
- **Error:** PATCH/POST failure → toast + revert optimistic change; same-project validation failure (cross-project fallback/target) → inline field error on the picker.
- **Responsive:** multi-column card grid at ≥1024px; single-column stacked cards below; transition editor opens as a side panel on desktop, full-screen sheet on mobile.
- **a11y:** state cards and transition rows keyboard-navigable; role/member chips have accessible labels; the editor panel is a focus-trapped dialog with labelled controls; preview graph has a text-equivalent transition list for screen readers.

---

## Reference: Workflows & Approvals — Who-can-move (role / member) + required approvals on transitions (work-item enforcement surface)

> User's screenshot: a work item detail view. Near the state selector, plane.so shows (a) only legal next states are selectable (illegal ones greyed/hidden), (b) an inline "Approval pending" banner when a gated transition is requested — showing requester, target state, fallback, and Approve/Reject buttons visible only to approvers — and (c) a small AI-suggested next-state chip. Attempting a disallowed move shows a blocking reason ("Moving to Done requires approval" / "You don't have permission to make this move").

| UI element | plane.so behavior | Fork status | Required change |
|---|---|---|---|
| State selector legal-target filtering | Only states reachable by an allowed rule are selectable | PARTIAL — `state-option.tsx` ignores `filterAvailableStateIds` | Filter selectable `to_state`s from the store's rule set for this item's type; grey out illegal targets |
| Disallowed-move block | Inline reason, move rejected | PARTIAL — `workflow-disabled-overlay.tsx` exists, not wired to reasons | Wire overlay to enforcement result: `403` (actor not allowed) → "You don't have permission for this move"; `409` (illegal transition) → "This transition isn't allowed" |
| Approval-required move | Sets item to pending; `state_id` unchanged until approved | MISSING | `POST .../issues/<id>/state-transition/` returns `202 {approval_id}` when `approval_required`; creates `WorkItemApproval` + `WorkItemApprovalApprover` rows. FR3 |
| "Approval pending" banner | Requester / target / fallback shown | MISSING | Inline banner near the state selector; data from `GET .../issues/<id>/approvals/` |
| Approve / Reject (approver-only) | Buttons visible only to approvers | MISSING | `POST .../approvals/<id>/decision/` — approver-scoped (AR4); workspace-admin override allowed but logged. On final approval → apply `target_state`; on reject → route to `fallback_state` |
| Rejection routing | Item moves to fallback; assignee+creator notified | MISSING | FR4 + FR7: fallback route; emit issue activity + `Notification` to assignee+creator |
| AI-suggested next-state chip | Suggests highest-ranked legal target | MISSING | `GET .../issues/<id>/suggested-transition/` → `{to_state, confidence, source}`; chip hidden when rules return nothing; degrades to rules-only if copilot down (never 500s) |
| Approval comment | Free-text decision note | MISSING | `WorkItemApproval.comment` — sanitized server-side; never raw `dangerouslySetInnerHTML` |

**Implementation mapping**
- **Route:** no new route — augments the existing work-item detail view (`core.ts` line 145, `:workspaceSlug/projects/:projectId/issues/:issueId`).
- **Enforcement seam (backend):** all `state_id` writes route through a shared `enforce_state_transition(issue, new_state_id, actor)` service in `apps/api/plane/utils/`, called from the issue-update path in `apps/api/plane/app/views/issue/base.py` (and bulk update) so detail-view changes, board drag-drop, and api-key v1 writes hit one gate (AR3, AR5). Fail-closed: service raises → state change rejected.
- **Components:** new `ApprovalBanner`, `ApprovalDecisionActions`, `SuggestedTransitionChip` in `apps/web/core/components/issues/`; reuse existing notification components for approver notifications; `state-option.tsx` (CE) supplies legal-target filtering.
- **MobX store:** `workflow.store.ts` holds `approvals` per issue + `suggestedTransition`; optimistic transition action rolls back on `403`/`409`.
- **Service:** `workflow.service.ts` → `state-transition`, `approvals` list, `approvals/<id>/decision`, `suggested-transition`. v1 mirror at `apps/api/plane/api/urls/workflow.py`.
- **Empty/loading/error:** no pending approval → banner hidden; loading approval state → inline spinner in banner; decision error → toast + keep banner; suggestion error/timeout → chip simply absent.
- **Responsive:** banner spans full width above the state selector on mobile; inline beside it on desktop.
- **a11y:** banner is `role="status"` (`aria-live="polite"`) so approvers/requesters hear pending state; Approve/Reject are labelled buttons; the suggested-state chip is a button with an accessible "Suggested: <state>" label, not color-only.

---

## Reference: Project settings — Project states / Project labels tabs

> User's screenshot: the project-settings left nav (or tab bar) listing entries — General, Members, Features, States, Labels, Estimates, Automations. plane.so inserts a "Workflows" entry adjacent to "States". The screenshot shows the States and Labels tabs as siblings, establishing where the new Workflows tab belongs.

| UI element | plane.so behavior | Fork status | Required change |
|---|---|---|---|
| States tab | Routes to the states settings page | PRESENT (`core.ts` 328–329; `states/page.tsx`) | No change |
| Labels tab | Routes to the labels settings page | PRESENT (`core.ts` 333–334; `labels/page.tsx`) | No change |
| "Workflows" nav entry | Sibling tab between States and Labels; routes to the builder | MISSING | Add a "Workflows" entry to the project-settings nav, gated by `isSelfHostedFeatureEnabled("workflows_approvals")`; routes to the new `workflows` sub-route. Hidden when entitlement off |
| Tab active/disabled state | Active when on the route; disabled/hidden when feature off | PARTIAL — no entry exists | Render nav item via the existing project-settings nav config; disabled tooltip when `workflow_status="disabled"` could read "Enable Workflows in Features" |
| Paused indicator | Subtle "paused" marker on the tab when rules aren't enforced | MISSING | Show a muted badge on the Workflows tab when `Project.workflow_status="paused"` |

**Implementation mapping**
- **Route:** the nav entry points at the new `workflows/page.tsx` sub-route (registered after `core.ts` line 329). The project-settings nav is driven by `settings/projects/[projectId]/layout.tsx` (line 294) — add the entry to that nav config.
- **Components:** extend the existing project-settings nav/sidebar config (same file that lists States/Labels/Estimates); add `WorkflowsNavItem` gated by entitlement; lifecycle toggle (enabled/paused) lives in `workflows/header.tsx`.
- **MobX store:** nav reads `workflowStatus` from `workflow.store.ts` to render the paused badge and disabled-tooltip state.
- **Service:** `workflow-config` (GET for status display, PATCH for lifecycle changes — admin only).
- **Entitlement wiring:** nav entry rendered only when `isSelfHostedFeatureEnabled("workflows_approvals")` is true; otherwise omitted entirely (matches how disabled features hide their tabs).
- **Empty/loading/error:** nav is static config (no async empty/loading); status badge waits on `workflowStatus` and shows nothing until loaded.
- **Responsive:** nav collapses into the existing project-settings mobile menu pattern; the Workflows entry follows the same collapse behavior as States/Labels.
- **a11y:** nav entry is a router link with `aria-current="page"` when active; the paused badge has an accessible label ("Workflow paused — rules not enforced"), not color-only.

---

## Cross-cutting notes

- **Backward compatibility:** zero rules + `workflow_status="disabled"` (the default for all existing projects) means transitions stay unrestricted — every screen above renders its non-enforcing/empty state until an admin opts in. This is the runtime kill switch (PRD Rollback Plan).
- **Lifecycle semantics (FR6):** `enabled` enforces; `paused` shows/edits rules but skips enforcement (muted "Workflow paused" banner per PRD UX); `disabled` hides the feature. Project-admin maintenance bypass is logged to issue activity.
- **Entitlement single source:** every gated surface calls `isSelfHostedFeatureEnabled("workflows_approvals")`; when false, CE components keep their current disabled-overlay behavior — no behavior regression for unentitled installs.
- **Security on the comment surface:** the only rich-text input (`WorkItemApproval.comment`) is sanitized with the project's existing server-side HTML sanitizer before persist and before render (PRD Security).
