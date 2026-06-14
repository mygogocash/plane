# Work Items & Work Item Types — User Stories

> Scope: self-host parity for Work Items & Work Item Types per `docs/prd-work-items-2026-06-07.md`. Roles: **workspace admin**, **project member/lead**, **guest**, **viewer**. Every mutating route reuses `@allow_permission([...], level="PROJECT"|"WORKSPACE")` (`apps/api/plane/app/views/copilot.py`); every surface gates on `apps/web/ce/lib/self-host-entitlements.ts`. ID prefixes referenced where relevant: WIT (work item types), WF (workflow). Each story is independently testable and TDD-first (the failing test to write first is named under the AC).

---

## EPIC-CP — Custom Properties per Work Item Type

> Flag: `work_item_types`. Models: `IssueProperty(BaseModel)`, `IssuePropertyValue(ProjectBaseModel)`. ADMIN defines property definitions; MEMBER+ sets values. Milestone 1 (R1).

### CP-1 (epic EPIC-CP) — Admin defines a custom property on a work item type

**Story**
As a **workspace admin**, I want to define a typed custom property (name, type, options, required, default) on a work item type so that issues of that type capture the structured fields my team needs (e.g. Bug tracks Version).

**Acceptance criteria**
- **Given** I am a workspace admin and `work_item_types` is enabled, **when** I `POST /api/workspaces/<slug>/issue-types/<type_id>/properties/` with `{name, display_name, property_type: "select", settings: {options: [...]}, is_required: true}`, **then** the property is persisted scoped to that `IssueType`, returned with an id, and an `IssueActivity` entry is recorded.
  - *Failing test first:* `test_admin_creates_select_property_persists_and_logs_activity`
- **Given** I submit an unsupported `property_type` or a `select` type with no `options`, **when** the request is validated, **then** it is rejected `400` with a field error and nothing is persisted.
  - *Failing test first:* `test_invalid_property_type_rejected_400`
- **Given** a property named `version` already exists (not deleted) on the type, **when** I create another `version` on the same type, **then** it is rejected `409` (unique `(issue_type, name)`).
- **Given** I am a **project member** (not admin), **when** I attempt to create a property definition, **then** I get `403` and no property is created (definitions are ADMIN-only).
  - *Failing test first:* `test_member_cannot_create_property_definition_403`
- **Given** the type has no properties yet, **when** I `GET` the properties list, **then** I receive `200` with an empty array (no error, no upgrade prompt).

**Size** M · **Priority** P0 · **Depends on** []

### CP-2 (epic EPIC-CP) — Member sets and edits property values on an issue

**Story**
As a **project member**, I want to fill in a type's custom properties when I create or edit an issue so that the issue carries its required structured data.

**Acceptance criteria**
- **Given** an issue of a type that defines a required `version` text property, **when** I `PATCH .../issues/<id>/` with `property_values: {<property_id>: "1.4.0"}`, **then** an `IssuePropertyValue` is upserted (unique `(issue, property)`), the value is returned on the issue, and the change is logged.
  - *Failing test first:* `test_member_sets_property_value_upserts_and_logs`
- **Given** a required property with no value supplied on create, **when** I save, **then** the create is rejected `400` naming the missing required property.
  - *Failing test first:* `test_missing_required_property_value_rejected_400`
- **Given** a `property_values` payload referencing a property that belongs to a **different** `IssueType`, **when** validated, **then** it is rejected `400` (`property_not_for_type`) — only the issue's type properties are accepted.
- **Given** I am a **guest** on the project, **when** I attempt to set a property value, **then** I get `403`.
- **Given** an issue with no values for any defined property, **when** I open it, **then** property fields render with their `default_value` (or empty) and the page does not error.

**Size** M · **Priority** P0 · **Depends on** [CP-1]

### CP-3 (epic EPIC-CP) — Dynamic property fields render for the selected type

**Story**
As a **project member**, I want the create/edit modal to show only the fields relevant to the work item type I pick so that I am not shown irrelevant fields (Bug's Version, Content's Channel).

**Acceptance criteria**
- **Given** `work_item_types` is on and the selected type defines properties, **when** the modal renders (`issue-modal/form.tsx`), **then** `IssuePropertyStore` loads that type's properties and renders one input per `property_type` (text/number/date/select/multi-select/boolean/member/url).
  - *Failing test first (Vitest):* `renders dynamic property fields for selected issue type`
- **Given** I switch the type dropdown to another type, **when** the new type is selected, **then** the previous type's fields are removed and the new type's fields appear.
- **Given** the selected type defines no properties, **when** the modal renders, **then** no property section appears and no empty-state error is shown.
- **Given** `work_item_types` is off, **when** the modal renders, **then** no dynamic property section renders at all (flag-gated, not merely disabled).
  - *Failing test first (Vitest):* `hides property section when work_item_types flag is off`

**Size** M · **Priority** P1 · **Depends on** [CP-1, CP-2]

### CP-4 (epic EPIC-CP) — Block destructive property type changes after values exist

**Story**
As a **workspace admin**, I want to be prevented from changing a property's type once values exist so that existing issue data is never silently corrupted.

**Acceptance criteria**
- **Given** a `select` property that already has `IssuePropertyValue` rows, **when** I `PATCH` its `property_type` to `number`, **then** the request is rejected `409` (`destructive_type_change_blocked`) and existing values are untouched.
  - *Failing test first:* `test_property_type_change_with_existing_values_blocked_409`
- **Given** a property with **no** values yet, **when** I change its type, **then** the change succeeds `200`.
- **Given** I rename `display_name` or edit non-destructive `settings` (adding a select option) on a property with values, **when** I save, **then** it succeeds and values are preserved.
- **Given** I am a non-admin, **when** I attempt any property-definition edit, **then** `403`.

**Size** S · **Priority** P2 · **Depends on** [CP-1, CP-2]

---

## EPIC-TPL — Work Item Templates

> Flag: `templates`. Model: `WorkItemTemplate(ProjectBaseModel)`. Completes the existing `templateId` path in `issue-modal/modal.tsx`. Milestone 2 (R1).

### TPL-1 (epic EPIC-TPL) — Member saves a project-scoped template

**Story**
As a **project member**, I want to save an issue's structure (description, properties, default sub-items, target type) as a named template so that I can reuse it for repeated work.

**Acceptance criteria**
- **Given** `templates` is on and I am a project member, **when** I `POST .../work-item-templates/` with `{name, description_html, template_data, issue_type}`, **then** the template is persisted scoped to the project, `description_html` is sanitized via `plane.utils.html_processor` before persist, and an id is returned.
  - *Failing test first:* `test_member_creates_template_sanitizes_html_and_persists`
- **Given** I submit a blank `name`, **when** validated, **then** it is rejected `400`.
- **Given** I am a **viewer** on the project, **when** I attempt to create a template, **then** `403`.
  - *Failing test first:* `test_viewer_cannot_create_template_403`
- **Given** a template references an `issue_type`, **when** I list `.../work-item-templates/?issue_type=<id>`, **then** only templates for that type are returned.
- **Given** the project has no templates, **when** I `GET` the list, **then** `200` with an empty array.

**Size** M · **Priority** P0 · **Depends on** []

### TPL-2 (epic EPIC-TPL) — Create-from-template hydrates the new issue

**Story**
As a **project member**, I want to create an issue from a template so that the modal pre-fills description, properties, and sub-items without manual re-entry.

**Acceptance criteria**
- **Given** an active template, **when** I `POST .../issues/?template_id=<id>` (or open the modal with `templateId`), **then** the server hydrates the new issue from `template_data` (priority, labels, assignees-by-role, property values, sub-items) and persists it.
  - *Failing test first:* `test_create_issue_from_template_hydrates_fields`
- **Given** the template references a label/state/member **absent** in the target project, **when** I create from it, **then** the issue is created skipping the missing references and a non-blocking warning is returned (skip-and-warn, never hard-fail).
  - *Failing test first:* `test_create_from_template_skips_missing_refs_and_warns`
- **Given** a `template_id` that does not exist or belongs to another project, **when** I create, **then** `404`/`400` with no cross-project leakage.
- **Given** I am a **guest**, **when** I create from a template, **then** `403` (matches issue-create authz).
- **Given** the project has zero templates, **when** I open the template picker, **then** the self-host empty state ("no templates yet, create one") renders — never an upgrade prompt.
  - *Failing test first (Vitest):* `shows self-host empty state when no templates exist`

**Size** L · **Priority** P0 · **Depends on** [TPL-1, CP-2]

### TPL-3 (epic EPIC-TPL) — Project-settings template manager

**Story**
As a **project lead**, I want a settings surface to list, edit, deactivate, and delete templates so that I can curate which templates my team uses.

**Acceptance criteria**
- **Given** `templates` is on, **when** I open the project-settings template manager, **then** active templates render via `WorkItemTemplateStore` with edit/deactivate/delete actions.
- **Given** I `PATCH .../work-item-templates/<id>/ {is_active: false}`, **when** saved, **then** the template no longer appears in the create-modal picker but remains in the manager list.
  - *Failing test first:* `test_deactivated_template_hidden_from_create_picker`
- **Given** I `DELETE` a template, **when** confirmed, **then** it is soft-deleted and excluded from all lists.
- **Given** I am a **viewer**, **when** I open project settings, **then** the template manager is read-only or hidden and mutate actions return `403`.

**Size** M · **Priority** P1 · **Depends on** [TPL-1]

---

## EPIC-REC — Recurring Work Items

> Flag: `recurring_work_items`. Models: `RecurringWorkItem`, `RecurringWorkItemRun`. Generation via `@shared_task` on `issue_automation_task`/beat. Milestone 3 (R1). Rollback: disable beat + flag before reverting worker code.

### REC-1 (epic EPIC-REC) — Member defines a recurrence schedule

**Story**
As a **project member**, I want to define how often a work item recurs (frequency, timezone, start, and an end by date or N iterations) so that routine work is created automatically.

**Acceptance criteria**
- **Given** `recurring_work_items` is on, **when** I `POST .../recurring-work-items/` with `{name, frequency: "weekly", timezone, start_date, end_date|max_iterations, template|payload}`, **then** the schedule persists, `owned_by` is set to me, and `next_run_at` is computed from `start_date` in the given timezone.
  - *Failing test first (unit):* `test_next_run_at_computed_from_start_in_timezone`
- **Given** `frequency: "custom"` with an invalid `rrule`, **when** validated, **then** rejected `400` (`invalid_rrule`).
  - *Failing test first:* `test_invalid_rrule_rejected_400`
- **Given** both `end_date` and `max_iterations` are omitted on a non-custom schedule, **when** validated, **then** rejected `400` (an end condition is required).
- **Given** I am a **guest**, **when** I create a recurrence, **then** `403`.
- **Given** the project has no recurrences, **when** I `GET` the list, **then** `200` empty array.

**Size** M · **Priority** P0 · **Depends on** [TPL-1]

### REC-2 (epic EPIC-REC) — Beat task generates the next instance idempotently

**Story**
As a **project lead**, I want the scheduler to generate exactly one new work item per due window — even after worker downtime — so that recurring items appear reliably without duplicate storms.

**Acceptance criteria**
- **Given** an active recurrence with `next_run_at` in the past, **when** the `@shared_task` runs, **then** one `Issue` is created (hydrated from `template`/`payload`), a `RecurringWorkItemRun` is recorded, and `next_run_at` advances to the following window.
  - *Failing test first (unit):* `test_due_recurrence_generates_one_issue_and_run`
- **Given** the worker was down across multiple windows, **when** the task next runs, **then** at most **one** instance is backfilled (no storm) and missed windows are skipped forward.
  - *Failing test first (unit):* `test_downtime_backfills_at_most_one_instance`
- **Given** a `RecurringWorkItemRun` already exists for a `(recurring, run_at)`, **when** the task re-runs for the same window, **then** no duplicate Issue is created (idempotent via unique constraint).
- **Given** a recurrence past its `end_date` or `max_iterations`, **when** the task runs, **then** no Issue is generated and the schedule is marked inactive.
  - *Failing test first (unit):* `test_recurrence_past_end_does_not_generate`

**Size** L · **Priority** P0 · **Depends on** [REC-1]

### REC-3 (epic EPIC-REC) — Recurrence UI section, badge, and run history

**Story**
As a **project member**, I want a recurrence section in the modal and a recurrence badge on cards so that I can configure and recognize recurring items, and review what was generated.

**Acceptance criteria**
- **Given** `recurring_work_items` is on, **when** I open the create/edit modal, **then** a recurrence section (toggle, frequency, end/iterations) renders via `RecurringWorkItemStore`.
- **Given** an issue belongs to a recurrence, **when** it renders on a card/list, **then** a recurrence badge appears.
  - *Failing test first (Vitest):* `renders recurrence badge for recurring work item`
- **Given** I `GET .../recurring-work-items/<id>/runs/`, **when** authorized, **then** I receive a read-only generation history (run_at + generated issue).
- **Given** `recurring_work_items` is off, **when** the modal renders, **then** no recurrence section appears.
- **Given** a recurrence with zero runs, **when** I view its history, **then** an empty self-host state renders, not an error.

**Size** M · **Priority** P1 · **Depends on** [REC-1, REC-2]

---

## EPIC-DUP — Duplicate Detection & Flagging

> Flag: reuse `work_item_types`/intake. Read-only endpoint `issues/similar/`; reuses `IssueRelation` `duplicate`. Milestone 4 (R1, no migration).

### DUP-1 (epic EPIC-DUP) — Similar open items returned with confidence scores

**Story**
As a **project member**, I want the system to surface similar open work items as I type a title so that I can spot duplicates before creating one.

**Acceptance criteria**
- **Given** `GET .../projects/<project_id>/issues/similar/?title=<q>` with a substantive title, **when** authorized in the project, **then** up to N **open** issues in **that project** are returned as `{results: [{id, name, confidence}]}` sorted by confidence descending.
  - *Failing test first (unit):* `test_similarity_scoring_ranks_open_issues_by_confidence`
- **Given** an empty or very short title (below threshold), **when** I query, **then** `200` with an empty `results` array and no banner is implied.
  - *Failing test first:* `test_short_title_returns_empty_results`
- **Given** I am **not a member** of the project, **when** I query similar, **then** `403` and no titles from that project are leaked (no cross-project/cross-tenant leakage).
  - *Failing test first:* `test_non_member_cannot_query_similar_403`
- **Given** closed/cancelled issues match the title, **when** I query, **then** they are excluded (open issues only).

**Size** M · **Priority** P1 · **Depends on** []

### DUP-2 (epic EPIC-DUP) — Inline dismissible/actionable duplicate banner

**Story**
As a **project member**, I want a debounced inline banner under the title field that lets me dismiss or link a match as a duplicate so that flagging takes one click.

**Acceptance criteria**
- **Given** `issues/similar/` returns matches, **when** I type a title in `issue-modal/form.tsx`, **then** a debounced banner lists matches with confidence % and a "link as duplicate" action.
  - *Failing test first (Vitest):* `shows similar-items banner with confidence when matches returned`
- **Given** I click "link as duplicate" on a match, **when** confirmed, **then** an `IssueRelation` of kind `duplicate` is created via the existing relation UI.
- **Given** I dismiss the banner, **when** dismissed, **then** it stays hidden for the current edit session and re-querying does not re-show it.
- **Given** the query returns empty results, **when** rendered, **then** no banner appears (no empty-state noise).

**Size** S · **Priority** P2 · **Depends on** [DUP-1]

---

## EPIC-WF — Workflows & Approvals

> Flag: `workflows_approvals`. Models: `WorkflowTransition`, `ApprovalPolicy`, `ApprovalDecision`. Changes the issue write path — treated as **R0 gate** within Milestone 5. Empty/absent workflow = unrestricted (backward compatible).

### WF-1 (epic EPIC-WF) — Admin defines allowed state transitions per type

**Story**
As a **workspace admin**, I want to define which state-to-state transitions are allowed for a project + work item type so that issues follow our process.

**Acceptance criteria**
- **Given** `workflows_approvals` is on and I am admin, **when** I `POST .../projects/<project_id>/workflow-transitions/` with `{issue_type, from_state, to_state}`, **then** the transition persists (unique `(project, issue_type, from_state, to_state)`).
  - *Failing test first:* `test_admin_creates_workflow_transition_persists`
- **Given** a `from_state` of null, **when** saved, **then** it means "from any state" to `to_state`.
- **Given** a duplicate transition (not deleted), **when** I create it again, **then** `409`.
- **Given** I am a **project member**, **when** I attempt to define a transition, **then** `403` (definitions are ADMIN-only).
  - *Failing test first:* `test_member_cannot_define_transition_403`
- **Given** a project with no transitions, **when** I `GET` the list, **then** `200` empty array.

**Size** M · **Priority** P0 · **Depends on** [CP-1]

### WF-2 (epic EPIC-WF) — Enforce transitions on issue state change

**Story**
As a **project member**, I want disallowed state changes to be rejected so that the workflow is actually enforced — while unconfigured projects keep working as before.

**Acceptance criteria**
- **Given** a workflow exists for the issue's type and the requested `from→to` transition is **not** in the allow-list, **when** I `PATCH .../issues/<id>/` to change state, **then** it is rejected `409 {"error": "transition_not_allowed"}` and the state is unchanged.
  - *Failing test first:* `test_disallowed_transition_rejected_409`
- **Given** the project/type has **no** workflow transitions defined, **when** I change state, **then** the change succeeds (any-to-any, backward compatible — proves users cannot be locked out).
  - *Failing test first:* `test_no_workflow_allows_any_transition`
- **Given** an allowed transition, **when** I PATCH, **then** `200`, state updated, change logged in `IssueActivity`.
- **Given** a **bulk** state change across items, **when** one item's transition is disallowed, **then** the response is partial-success with a per-item error and allowed items still update.
  - *Failing test first:* `test_bulk_state_change_partial_success_per_item_errors`
- **Given** the public/Space API, **when** issue state is queried/changed, **then** no workflow internals are exposed and enforcement does not leak transition rules.

**Size** L · **Priority** P0 · **Depends on** [WF-1]

### WF-3 (epic EPIC-WF) — Approval-gated transitions

**Story**
As a **workspace admin**, I want to mark a transition as requiring approval so that sensitive state changes wait for a designated approver.

**Acceptance criteria**
- **Given** a transition with `requires_approval: true` and an `ApprovalPolicy` of approvers, **when** a member PATCHes the issue into that transition, **then** the state does **not** change yet, the response is `202`, and a `pending` `ApprovalDecision` is created.
  - *Failing test first:* `test_approval_required_transition_returns_202_creates_pending`
- **Given** a pending decision, **when** an **approver in the policy** `POST .../issues/<id>/approvals/<decision_id>/ {decision: "approved"}`, **then** the transition completes, state updates, and the decision is audited (`actor`, `decided_at`, `note`).
  - *Failing test first:* `test_approver_approves_completes_transition_and_audits`
- **Given** a user **not** in the approver set, **when** they attempt to decide, **then** `403` and the decision stays pending.
  - *Failing test first:* `test_non_approver_cannot_decide_403`
- **Given** an approver is removed from the workspace while a decision is pending, **when** the state is checked, **then** the transition stays pending (never silently approved) and an admin can reassign approvers.

**Size** L · **Priority** P1 · **Depends on** [WF-1, WF-2]

### WF-4 (epic EPIC-WF) — State dropdown filters to valid next states + approval banner

**Story**
As a **project member**, I want the state dropdown to show only valid next states and an approval banner for pending transitions so that the UI guides me through the workflow.

**Acceptance criteria**
- **Given** `workflows_approvals` is on and a workflow exists, **when** I open the state dropdown in `issue-detail`, **then** only allowed `to_state`s for the current state + type are selectable.
  - *Failing test first (Vitest):* `state dropdown filters to allowed to_states`
- **Given** a transition is pending approval, **when** I view the issue, **then** an approval banner shows the pending state and (for approvers) approve/reject actions.
- **Given** no workflow is defined, **when** I open the dropdown, **then** all states are selectable (unrestricted fallback).
- **Given** `workflows_approvals` is off, **when** I open the dropdown, **then** no filtering or approval banner is applied.

**Size** M · **Priority** P1 · **Depends on** [WF-2, WF-3]

---

## EPIC-AI — AI Work Item Creation, Description, Summary & Agent Runs

> Flag: `ai_copilot`. Reuses `CopilotMessage` + provider config (`get_llm_config`/Vertex, `is_llm_configured`, `WRITE_MODES`). New copilot modes `create_work_item`/`describe`/`summarize_issue`; new `AgentRun(ProjectBaseModel)`. Fail closed; **hide** AI UI when no provider. Milestone 6 (R1; agent execution scoped to auditable record only).

### AI-1 (epic EPIC-AI) — Structured work-item creation from a natural-language prompt

**Story**
As a **project member**, I want to describe work in plain language and get a structured draft (title, description, priority, suggested assignee, type, properties) so that I can review and save it quickly.

**Acceptance criteria**
- **Given** a provider is configured, **when** I `POST .../copilot/messages/ {mode: "create_work_item", prompt}`, **then** the response returns a structured draft (`title`, `description_html`, `priority`, suggested assignee, `type`, `property_values`) for review — not auto-saved.
  - *Failing test first:* `test_create_work_item_mode_returns_structured_draft`
- **Given** `is_llm_configured(...)` is false, **when** I call any AI mode, **then** `400 {"error": "LLM provider not configured"}` and no draft is produced (fail closed).
  - *Failing test first:* `test_ai_modes_fail_closed_when_provider_unconfigured_400`
- **Given** I am a **guest**, **when** I call a write-type AI mode, **then** `403` (reuse `WRITE_MODES` + role guard).
  - *Failing test first:* `test_guest_blocked_from_ai_write_mode_403`
- **Given** the LLM returns HTML in `description_html`, **when** the draft is returned, **then** the HTML is sanitized via `plane.utils.html_processor` before it reaches the client/persist path.

**Size** L · **Priority** P0 · **Depends on** [CP-2]

### AI-2 (epic EPIC-AI) — Draft / simplify / rewrite the description

**Story**
As a **project member**, I want Draft, Simplify, and Rewrite actions in the description editor so that I can generate or improve issue descriptions inline.

**Acceptance criteria**
- **Given** a provider is configured, **when** I `POST .../copilot/messages/ {mode: "describe", action: "draft"|"simplify"|"rewrite", prompt}`, **then** sanitized text is returned for accept/regenerate without auto-saving.
  - *Failing test first:* `test_describe_mode_returns_text_for_each_action`
- **Given** an invalid `action` value, **when** validated, **then** `400`.
- **Given** no provider is configured, **when** the description editor renders, **then** the AI buttons are **hidden entirely** (not disabled), so an empty state never implies a broken paid feature.
  - *Failing test first (Vitest):* `hides AI description actions when provider unconfigured`
- **Given** `ai_copilot` is off, **when** the editor renders, **then** no AI actions appear.

**Size** M · **Priority** P1 · **Depends on** [AI-1]

### AI-3 (epic EPIC-AI) — One-click status summary of an issue

**Story**
As a **project lead**, I want a one-click summary that condenses recent activity, comments, and linked items into a read-only digest so that I can catch up without scrolling the full history.

**Acceptance criteria**
- **Given** a provider is configured, **when** I `POST .../copilot/messages/ {mode: "summarize_issue", issue_id}`, **then** a read-only digest of recent activity + comments + linked items (within my authorized scope) is returned.
  - *Failing test first:* `test_summarize_issue_returns_scoped_digest`
- **Given** I opt to post the summary, **when** I confirm, **then** it is added as a comment attributed to me and logged.
- **Given** the issue has no activity/comments, **when** I summarize, **then** a graceful empty digest is returned (no error).
- **Given** no provider is configured, **when** the activity header renders, **then** the "Generate summary" button is hidden; calling the endpoint anyway returns `400` (fail closed).
- **Given** I lack access to a linked item in another project, **when** summarizing, **then** that item is excluded (no cross-project leakage).

**Size** M · **Priority** P1 · **Depends on** [AI-1]

### AI-4 (epic EPIC-AI) — Auditable agent run record (no autonomous execution)

**Story**
As a **project lead**, I want to assign a registered local agent to an issue and see an auditable run record so that AI-initiated work is tracked and reversible, without any self-directing automation in v1.

**Acceptance criteria**
- **Given** `ai_copilot` is on and I am a member+, **when** I request an agent run for an issue, **then** an `AgentRun` is created with `status: "queued"`, `requested_by` set, and surfaced in `IssueActivity` — with no autonomous mutation performed.
  - *Failing test first:* `test_agent_run_created_queued_and_logged_no_autonomous_action`
- **Given** an `AgentRun`, **when** its status transitions (queued→running→succeeded/failed/cancelled), **then** each transition is recorded with `result`/`error` and is reversible.
  - *Failing test first:* `test_agent_run_status_transitions_recorded`
- **Given** a **guest** or **viewer**, **when** they request an agent run, **then** `403`.
- **Given** no provider is configured, **when** the issue view renders, **then** agent-run actions are hidden and requesting a run returns `400` (fail closed).
- **Given** a queued run, **when** it is cancelled, **then** status becomes `cancelled` and no execution side effects occur.

**Size** M · **Priority** P2 · **Depends on** [AI-1]

---

### Cross-cutting acceptance notes (apply to every story)
- **Authz-failure path** is a first-class AC on every mutating story: non-member → `403`/`404` with no data leakage; role too low → `403`; definitions (properties/workflows/approval policies) are ADMIN-only; values/templates/recurring CRUD are MEMBER+; guests blocked from AI write modes.
- **Empty/edge path** is a first-class AC: empty lists return `200` empty + self-host empty state (never an upgrade prompt); short/empty inputs return empty results; flag-off surfaces are hidden, not disabled.
- **Activity trail:** every persisted mutation logs through `IssueActivity`.
- **Multi-tenant isolation:** every query filters by `workspace`/`project` + active membership before serialization; public/Space APIs never expose workflow, approval, property-definition, recurrence, or AI internals.
