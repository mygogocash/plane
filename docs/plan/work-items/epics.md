# Work Items & Work Item Types — Epics

These epics decompose the verified gaps in [docs/prd-work-items-2026-06-07.md](docs/prd-work-items-2026-06-07.md) into shippable, flag-gated units. Each epic covers **only** a PRD-confirmed partial or missing capability — present capabilities (Markdown editor, immutable activity trail, manual relationships, five layouts, cycles, intake, bulk ops, base work item types) are explicitly out of scope and are not rebuilt.

Every epic follows the fork strategy: OPEN first-party Django/DRF models + DRF views + MobX stores, gated behind an existing flag in `apps/web/ce/lib/self-host-entitlements.ts` (`SELF_HOSTED_FEATURE_FLAGS`), reusing the self-host LLM plumbing in `apps/api/plane/app/views/copilot.py` (`get_llm_config` / `is_llm_configured` / `is_vertex_provider`) rather than Plane Cloud. No proprietary EE source is copied. Each flag turns on only when its backend is proven by tests; AI surfaces fail closed when no provider is configured.

Authorization reuses `@allow_permission([ROLE...], level=...)` from `plane.app.permissions` (confirmed in `copilot.py:17,64`). All new models inherit `ProjectBaseModel` or `BaseModel` for `workspace`/`project`/soft-delete consistency. Mutations route through the existing `IssueActivity` trail. ID prefixes are unchanged (WIT for work items, WF for workflow surfaces).

Epics are dependency-ordered: **WIT-CUSTOMPROPS** first (its property model and `property_values` serializer path are consumed by templates, recurring, AI create, and duplicate-detection UI reuse).

---

## WIT-CUSTOMPROPS — Type-Scoped Custom Properties

**User value**
An admin defines fields that belong to a specific work item type ("Bug tracks Version, Content tracks Channel"), and members fill those fields per work item. The create/detail form shows only the fields relevant to the chosen type, so each work item type captures the data it actually needs without polluting every other type.

**Scope (in)**
- `IssueProperty(BaseModel)` and `IssuePropertyValue(ProjectBaseModel)` models per PRD Data Models.
- Property-definition CRUD API (ADMIN write): `GET/POST /api/workspaces/<slug>/issue-types/<type_id>/properties/`, `GET/PATCH/DELETE /.../properties/<property_id>/`.
- Property values flow through the **existing** issue create/patch serializer under a `property_values` key, validated against the issue's `type`.
- Property types: `text/number/date/select/multi-select/boolean/member/url` with `settings` (options/min/max), `is_required`, `default_value`, `sort_order`, `is_active`.
- Dynamic property fields rendered from the selected `IssueType` in the form; new `IssuePropertyStore` (MobX) + `property.service.ts`.
- First-party "no properties yet, create one" empty state in the type-settings property manager.

**Out of scope**
- Cross-type or workspace-global properties (every property is `issue_type`-scoped).
- Property values on existing issues backfilled by migration (additive, nullable; no backfill).
- Destructive property-type changes after values exist (PRD edge case: blocked — require new property).
- Reporting/grouping/filtering layouts by custom property value (future epic).

**Technical requirements (cite fork files)**
- New `apps/api/plane/db/models/issue_property.py`. `IssueProperty(BaseModel)` mirrors the workspace-scoping of `apps/api/plane/db/models/issue_type.py` (`IssueType(BaseModel)`, confirmed at `issue_type.py:14`); FK to `db.IssueType`. `IssuePropertyValue(ProjectBaseModel)` FK to `db.Issue` (`apps/api/plane/db/models/issue.py`).
- Unique `(issue_type, name)` on `IssueProperty` and `(issue, property)` on `IssuePropertyValue`, both "when not deleted" (soft-delete-aware partial constraints, consistent with existing model conventions).
- New view + URL registration mirroring `apps/api/plane/app/urls/issue.py` and the type plumbing already present (`ProjectIssueType`, `issue_type.py:35`). Value validation extends the existing issue serializer rather than adding a parallel write path.
- One additive migration `0xxx_custom_properties.py`; all new columns nullable/defaulted, no backfill.
- Frontend: dynamic fields in `apps/web/core/components/issues/issue-modal/form.tsx` and `issue-detail`; store in `packages/shared-state`, service in `packages/services`, primitives from `@plane/ui`.

**Security**
- ADMIN required for property **definitions**; MEMBER+ for property **values** (PRD Authorization). Reuse `@allow_permission` with `level="WORKSPACE"` for type-scoped definitions and `level="PROJECT"` for values.
- Sanitize property `text`/`url` values through `plane.utils.html_processor` (`strip_tags`) before persist.
- Every query filters by `workspace`/`project` and active membership before serialization; no public/Space exposure of property definitions.
- Reject `property_values` referencing properties not belonging to the issue's `type` (no cross-type value injection).

**Dependencies**
- None (foundational). Consumed by WIT-TEMPLATES, WIT-RECURRING, AI-WORKITEMS.

**Epic acceptance criteria (Given/When/Then)**
- Given an ADMIN on a project, When they POST a property `{name:"Version", property_type:"select", settings:{options:[...]}, is_required:true}` to an `IssueType`, Then it persists and is returned scoped to that type.
- Given a MEMBER creating an issue of that type, When they submit with `property_values:{<version_id>:"1.4"}`, Then the value persists and is validated against the select options.
- Given a MEMBER omits a `is_required` property, When they submit, Then the create is rejected with a validation error naming the missing property.
- Given a `property_values` key references a property from a **different** type, When submitted, Then the server rejects it (no cross-type leakage).
- Given a GUEST or non-member, When they POST a property definition, Then they receive 403.
- Given the property manager with no properties, When rendered with the flag on, Then a first-party self-host empty state shows (never an upgrade modal).

**Risk tier**
R1 — additive schema + new flag-gated routes/UI, forward/rollback migration, full authorization tests. Touches the issue write path only by extending the existing serializer under validation; no existing transition behavior changes.

**Entitlement flag**
`work_item_types` (existing in `SELF_HOSTED_FEATURE_FLAGS`).

---

## WIT-TEMPLATES — Work Item Templates

**User value**
A member saves a reusable template (description, properties, default sub-items, target type) and creates new work items pre-filled from it — eliminating repeated manual setup for recurring kinds of work. The frontend already threads a `templateId`; this epic makes that path actually persist and hydrate.

**Scope (in)**
- `WorkItemTemplate(ProjectBaseModel)` per PRD: `name`, `description_html`, `template_data` (JSON: priority, labels, assignees-by-role, sub-items, property values), `issue_type` FK (null), `is_active`; index `(project, issue_type)`.
- CRUD API: `GET/POST /api/workspaces/<slug>/projects/<project_id>/work-item-templates/`, `GET/PATCH/DELETE /.../work-item-templates/<template_id>/`.
- Server-side hydration on `POST /.../issues/?template_id=<id>` (reuses existing create; populates from `template_data`).
- Complete the existing `templateId` create flow; template picker in the modal; project-settings template manager. New `WorkItemTemplateStore` + `template.service.ts`.
- External `/api/v1/` read endpoint for templates (parity, read-only).

**Out of scope**
- AI-generated templates.
- Workspace-global / cross-project templates (project-scoped only).
- Recurring schedules attached to templates (that is WIT-RECURRING, which references templates).
- Hard-failing on missing referenced labels/states/members — PRD requires skip-and-warn.

**Technical requirements (cite fork files)**
- New `apps/api/plane/db/models/work_item_template.py`, `WorkItemTemplate(ProjectBaseModel)`.
- Frontend completes the existing stub: `apps/web/core/components/issues/issue-modal/modal.tsx` already accepts and threads a `templateId` prop (confirmed in PRD Current State); add `base.tsx` hydration + picker.
- New view + URL in `apps/api/plane/app/urls/issue.py` (or a new `template.py`); external read route in `apps/api/plane/app/urls/api.py`.
- Template `description_html` and any property values in `template_data` reuse the WIT-CUSTOMPROPS validation path.
- One additive migration `0xxx_work_item_templates.py`.

**Security**
- MEMBER+ for template CRUD (PRD Authorization); `@allow_permission(level="PROJECT")`.
- Sanitize `description_html` and template text property values via `plane.utils.html_processor` before persist.
- Template/attachment assets keep the existing private signed-URL upload path (`get_upload_path`); no public exposure.
- External read endpoint filters by API-key workspace scope; never exposes AI internals or property definitions beyond the template payload.

**Dependencies**
- WIT-CUSTOMPROPS (template `template_data` carries property values validated against `issue_type`).

**Epic acceptance criteria (Given/When/Then)**
- Given a MEMBER on a project, When they POST a template with `issue_type` and `template_data`, Then it persists scoped to the project and is listable/filterable per project and per type.
- Given an existing template, When a member creates an issue with `?template_id=<id>`, Then the new issue is hydrated server-side from `template_data` (priority, labels, sub-items, property values).
- Given a template referencing a label/state/member missing in the target project, When hydrated, Then the create succeeds with a skip-and-warn (never a hard fail).
- Given the `templateId` create path with the feature reverted/flag off, When a create is attempted, Then it degrades to a plain create (no error).
- Given a GUEST or non-member, When they POST a template, Then they receive 403.
- Given the template manager with no templates, When rendered, Then a first-party self-host empty state shows.

**Risk tier**
R1 — additive schema + new flag-gated routes/UI; the `templateId` path degrades to plain create on rollback (per PRD Milestone 2). Forward/rollback migration; authorization tests.

**Entitlement flag**
`templates` (existing).

---

## WIT-RECURRING — Recurring Work Items

**User value**
A member schedules a work item to regenerate on a cadence (daily/weekly/monthly/custom RRULE) with timezone, start, and an end (date or N iterations). The system creates the next instance automatically and shows a recurrence badge on the parent — automating routine/repeated work without manual re-creation.

**Scope (in)**
- `RecurringWorkItem(ProjectBaseModel)` and `RecurringWorkItemRun(ProjectBaseModel)` per PRD: frequency, `rrule`, `timezone`, `start_date`, `end_date`, `max_iterations`, `next_run_at`, `owned_by`, plus run history with unique `(recurring_work_item, run_at)` for idempotent generation.
- Generation `@shared_task` added alongside the existing periodic task in `issue_automation_task.py`, registered on `django_celery_beat`.
- Timezone/end-condition handling; backfill at most one instance after worker downtime (no storm).
- CRUD API + read-only runs history: `GET/POST /.../recurring-work-items/`, `GET/PATCH/DELETE /.../recurring-work-items/<id>/`, `GET /.../recurring-work-items/<id>/runs/`.
- Recurrence section in create/edit modal; recurrence badge on cards. New `RecurringWorkItemStore`.

**Out of scope**
- Recurrence on already-completed/archived items.
- Catch-up generation of more than one missed instance (explicit no-storm rule).
- AI-suggested cadences.
- Editing past generated instances via the schedule (each generated issue is independent once created).

**Technical requirements (cite fork files)**
- New `apps/api/plane/db/models/recurring_work_item.py`. `RecurringWorkItem.template` FK to `WorkItemTemplate` (null) with `payload` JSON fallback.
- New `@shared_task` in `apps/api/plane/bgtasks/issue_automation_task.py`, following the precedent of `archive_and_close_old_issues` (`issue_automation_task.py:22-23`); registered in `CELERY_IMPORTS` / beat schedule in `apps/api/plane/settings/common.py`.
- Idempotency enforced by the unique `(recurring_work_item, run_at)` constraint on `RecurringWorkItemRun`.
- Generated issue creation reuses the issue create path + WIT-TEMPLATES hydration when `template` is set.
- One additive migration `0xxx_recurring_work_items.py`.

**Security**
- MEMBER+ for recurrence CRUD; `@allow_permission(level="PROJECT")`.
- Generation runs as `owned_by`'s authorized scope; generated issues are project-scoped and respect the owner's membership.
- `timezone` validated against the existing timezone source (`apps/api/plane/app/urls/timezone.py` plumbing); reject invalid RRULE before persist.
- No public/Space exposure of recurrence internals.

**Dependencies**
- WIT-TEMPLATES (recurring may generate from a template; falls back to inline `payload`).
- Reuses WIT-CUSTOMPROPS validation transitively when generating from a template with property values.

**Epic acceptance criteria (Given/When/Then)**
- Given a MEMBER defines a weekly recurrence with `timezone` and `end_date`, When the beat task runs at `next_run_at`, Then exactly one new issue is generated and a `RecurringWorkItemRun` is recorded.
- Given the worker was down across multiple windows, When generation resumes, Then at most one instance is backfilled (no storm), enforced by the unique `(recurring_work_item, run_at)` constraint.
- Given a recurrence past its `end_date` or `max_iterations`, When the task runs, Then no new issue is generated.
- Given a recurrence with a `template`, When an instance generates, Then it is hydrated from the template (and skip-and-warns on missing references).
- Given a parent with an active recurrence, When rendered on a card, Then a recurrence badge appears.
- Given the flag/beat schedule disabled before code revert (PRD rollback rule), When reverted, Then no orphaned generation runs occur.

**Risk tier**
R1 — additive schema + worker task. The worker path follows the spec.md rollback rule (disable beat schedule + flag **before** reverting worker code). Unit tests cover next-run computation (timezone, end conditions, idempotency) per PRD Testing Strategy.

**Entitlement flag**
`recurring_work_items` (existing).

---

## WIT-DUPLICATES — Duplicate Detection & Flagging

**User value**
When a member types a title at create/edit time, the system surfaces up to N similar open work items in the same project with a confidence score, so duplicates can be caught and linked before they proliferate — turning the existing manual `duplicate` relation into a proactive, scored suggestion.

**Scope (in)**
- Read-only `GET /.../projects/<project_id>/issues/similar/?title=<q>` → `{ results: [{id, name, confidence}], ... }`, restricted to **open** issues in the **same** project.
- Debounced inline "similar items" banner under the title field in `issue-modal/form.tsx`, with confidence %, dismissible, and actionable to link via the **existing** `duplicate` `IssueRelation` UI.
- Similarity scoring computed server-side within authorized project scope.

**Out of scope**
- New schema — this epic is read-only, no model, no migration (PRD Milestone 4).
- Cross-project or workspace-wide similarity (explicit scope restriction).
- AI/embedding-based semantic matching (v1 uses deterministic similarity; embeddings are a future epic).
- Auto-linking without member action.

**Technical requirements (cite fork files)**
- New read endpoint registered in `apps/api/plane/app/urls/issue.py`, scoped to open issues in the requesting project.
- Reuses the existing `IssueRelation` `duplicate` relation (`apps/api/plane/db/models/issue.py`) for the link action — no new relation type.
- Frontend banner in `apps/web/core/components/issues/issue-modal/form.tsx`, debounced; links through existing duplicate-relation UI.
- Empty/short titles return empty results (no banner) per PRD edge case.

**Security**
- Similarity query filters strictly by the requester's authorized project and active membership before returning titles (no cross-project title leakage — explicit PRD Security item).
- Read-only; reuses standard project read permission.
- Short/empty title → empty result, preventing enumeration via trivial queries.

**Dependencies**
- None for the endpoint. UI reuses the existing `duplicate` relation; gating reuses `work_item_types`/intake plumbing.

**Epic acceptance criteria (Given/When/Then)**
- Given an open project with similar-titled open issues, When a member queries `issues/similar/?title=<q>`, Then up to N same-project open results return with a confidence score, ordered by confidence.
- Given a closed/archived issue with a matching title, When queried, Then it is excluded (open only).
- Given an issue in a different project, When queried, Then it is never returned (no cross-project leakage).
- Given a very short or empty title, When queried, Then an empty result returns and no banner renders.
- Given a banner result, When the member acts on it, Then a `duplicate` `IssueRelation` is created via the existing UI.
- Given a non-member, When they query similar items, Then they receive 403.

**Risk tier**
R1 (no migration) — read-only endpoint + UI, no schema. Rollback is a straight code revert (PRD Milestone 4).

**Entitlement flag**
`work_item_types` (existing; reuses intake/relation plumbing).

---

## WF-WORKFLOWS — Workflows & Approvals

**User value**
An admin constrains how work items move between states ("Bug can only go Triage → In Progress → Done") and gates specific transitions behind approval. Members see only valid next states; gated transitions enter a pending-approval state until an approver decides — bringing process enforcement and auditable sign-off to the issue lifecycle.

**Scope (in)**
- `WorkflowTransition(ProjectBaseModel)`, `ApprovalPolicy(ProjectBaseModel)`, `ApprovalDecision(ProjectBaseModel)` per PRD: per `project + issue_type` allowed transitions (`from_state` null = "any"), `requires_approval`, approver M2M, audited decisions.
- PATCH enforcement: a state change not in the allow-list → `409 {"error":"transition_not_allowed"}`; a `requires_approval` transition → `202` + pending `ApprovalDecision`.
- Approver decision route: `POST /.../issues/<issue_id>/approvals/<decision_id>/` (approver-only) to approve/reject.
- ADMIN-only transition definition API; state dropdown in `issue-detail` filters to allowed `to_state`s; approval banner for pending transitions; project-settings workflow editor. New stores.
- Bulk state-change validates each item against its workflow with partial success + per-item errors.
- **Backward compatibility:** empty/absent workflow = unrestricted (any-to-any), preserving existing project behavior.

**Out of scope**
- Multi-step / sequential approval chains (single policy approver set per transition in v1).
- SLA timers or auto-escalation on pending approvals.
- Workflow templates shared across projects.
- Automatic reassignment logic beyond ADMIN manual reassignment of orphaned pending decisions.

**Technical requirements (cite fork files)**
- New `apps/api/plane/db/models/workflow.py`. `WorkflowTransition` FK to `db.State` (`apps/api/plane/db/models/state.py`, `State`/`StateGroup` confirmed at `state.py:14`) and `db.IssueType` (null). Unique `(project, issue_type, from_state, to_state)` when not deleted.
- Enforcement injected into the issue PATCH path (the existing issue update view under `apps/api/plane/app/views/issue/`), validating the requested `to_state` against resolved transitions; defaults to unrestricted when no rows match.
- Decisions audited through the existing `IssueActivity` trail.
- ADMIN write via `@allow_permission([ROLE.ADMIN], level="PROJECT")`; approval decisions restricted to the policy's approver set.
- One additive migration `0xxx_workflows_approvals.py`. Treated as **R1 schema** but the **enforcement path is an R0 gate within the milestone** (PRD Risk Tier).

**Security**
- ADMIN required to define transitions/approval policies (PRD Authorization).
- Approval decisions allowed only for members in the policy's approver set; verified server-side before recording.
- Orphaned pending decision (approver removed from workspace) → ADMIN-reassignable; transition stays pending, never silently approved (PRD edge case).
- Workflow/approval internals never exposed via public/Space APIs.
- Multi-tenant: all transition resolution filters by `workspace`/`project` and active membership.

**Dependencies**
- WIT-CUSTOMPROPS (transitions are scoped per `issue_type`, consistent with the type-scoping model).
- None hard-blocking; can ship after the type-scoped foundation is in place.

**Epic acceptance criteria (Given/When/Then)**
- Given a project with defined transitions for an `issue_type`, When a member PATCHes an issue to a `to_state` not in the allow-list, Then the API rejects with `409 {"error":"transition_not_allowed"}` and the state is unchanged.
- Given a transition in the allow-list, When PATCHed, Then the change succeeds and is logged to `IssueActivity`.
- Given a transition with `requires_approval`, When a member triggers it, Then the API returns `202`, the state stays pending, and a pending `ApprovalDecision` is created.
- Given a pending decision, When a listed approver POSTs approve, Then the transition completes and is audited; When a non-approver POSTs, Then 403.
- Given a project with **no** workflow rows, When any state change is PATCHed, Then it succeeds (unrestricted — backward compatible).
- Given a bulk state change spanning items with different workflows, When submitted, Then each item is validated independently and the response reports partial success with per-item errors.
- Given the approver was removed from the workspace, When the decision is pending, Then it stays pending and is ADMIN-reassignable (never auto-approved).

**Risk tier**
R1 overall, with the **transition-enforcement path as an R0 gate** — it changes the critical issue write path. Per the house rule ("untested code on a critical path is R0"), enforcement and bulk-validation contract tests must be shown failing-then-green before merge; it must prove it cannot lock users out and defaults to unrestricted when no workflow exists.

**Entitlement flag**
`workflows_approvals` (existing).

---

## AI-WORKITEMS — AI Completion: Create, Describe, Summarize, Agent Record

**User value**
Members get AI assistance grounded in the self-host LLM provider: describe work in natural language to get a structured draft (title/description/properties/assignee/type) for review; draft/simplify/rewrite a description inline; generate a one-click read-only status summary from activity + comments + linked items; and queue an auditable agent run. All features hide cleanly when no provider is configured, so empty states never imply a broken paid feature.

**Scope (in)**
- New copilot modes on the **existing** pipeline: `create_work_item`, `describe` (`action`: draft/simplify/rewrite), `summarize_issue` — reusing `POST /api/workspaces/<slug>/copilot/messages/`.
- AI create: NL prompt → structured draft (title, `description_html`, priority, suggested assignee, type, property values) returned for review before save.
- Description actions in the editor reusing `gpt-assistant-popover.tsx` + `ai.service.ts`; accept/regenerate.
- Status summary endpoint condensing recent activity + comments + linked items into a read-only digest, optionally posted as a comment.
- `AgentRun(ProjectBaseModel)` per PRD: `agent_key`, `requested_by`, `status` (queued/running/succeeded/failed/cancelled), `input`, `result`, `error`. **No autonomous execution in v1** — status transitions recorded and surfaced in activity (auditable record + queued stub only).
- AI buttons hidden (not disabled) when provider unconfigured.

**Out of scope**
- Self-directing/autonomous agents (PRD Non-Goal; v1 ships only the auditable `AgentRun` record + queued stub).
- Any call to Plane Cloud — provider is the existing self-host `get_llm_config` / Vertex plumbing only.
- New AI write routes outside the copilot family; external `/api/v1/` AI write actions (never exposed).
- New conversation table — reuses `CopilotMessage` (PRD: no new table for create/draft/summary).

**Technical requirements (cite fork files)**
- Extend `COPILOT_MODES` (`apps/api/plane/app/views/copilot.py:37`) and `WRITE_MODES` (`copilot.py:52`) with the new modes; reuse `_execute_copilot_actions` (`copilot.py:708`) and `ISSUE_ACTION_FIELDS` (`copilot.py:40`) for structured create.
- Provider gating reuses `get_llm_config` / `is_llm_configured` / `is_vertex_provider` (`copilot.py:34,89-90,443`); AI routes return `400 {"error":"LLM provider not configured"}` (fail closed, existing pattern at `copilot.py:89-90`).
- New `AgentRun` in a new model file under `apps/api/plane/db/models/` (e.g. `agent_run.py`), `ProjectBaseModel`-scoped; status transitions logged to `IssueActivity`.
- Routes extend the copilot family in `apps/api/plane/app/urls/external.py`.
- Structured create reuses WIT-CUSTOMPROPS `property_values` validation against the chosen type.
- One additive migration `0xxx_agent_run.py` (only the `AgentRun` table; AI modes need no schema).

**Security**
- GUEST blocked from AI write modes — reuse the existing `WRITE_MODES` + role guard (`copilot.py:52,83`). New write modes (`create_work_item`, `describe`, `summarize_issue` when posting a comment) are added to `WRITE_MODES`.
- Sanitize all AI-returned HTML (drafts, descriptions, summaries) through `plane.utils.html_processor` before persist.
- Never log raw LLM prompts containing secrets/provider keys/session tokens; provider keys stay in env/Secret Manager.
- AI features fail closed to non-AI workflows when provider config is absent; UI hides actions.
- `AgentRun` is scoped by `workspace`/`project`/membership; v1 records status only — no autonomous action on work items.

**Dependencies**
- WIT-CUSTOMPROPS (AI create returns property values validated against the type).
- Builds on the already-present copilot pipeline (`COPILOT_MODES`, `_execute_copilot_actions`, provider config) — no new conversation table.

**Epic acceptance criteria (Given/When/Then)**
- Given a configured provider, When a member POSTs mode `create_work_item` with an NL prompt, Then a structured draft (title, `description_html`, priority, suggested assignee, type, property values) returns for review before save.
- Given a member invokes `describe` with `action:simplify` on a description, When called, Then simplified text returns for accept/regenerate, and persisted HTML is sanitized.
- Given an issue with activity, comments, and linked items, When a member calls `summarize_issue`, Then a read-only digest returns and can optionally be posted as a comment.
- Given **no** provider configured, When any AI mode is POSTed, Then the API returns `400 {"error":"LLM provider not configured"}` and the UI **hides** the AI buttons (not disabled).
- Given a GUEST, When they POST an AI write mode, Then they are blocked (reusing `WRITE_MODES` guard).
- Given a member queues an agent, When the `AgentRun` is created, Then its status transitions are recorded and surfaced in activity, with no autonomous execution performed.

**Risk tier**
R1 overall, with **AI-write/agent execution as an R0 gate** — it touches automated action on work items. v1 ships only the auditable `AgentRun` record with no autonomous execution, keeping it reversible; fails closed on provider outage. No AI-write code merges without the failing-then-green contract tests (provider-unconfigured → 400, GUEST blocked) shown.

**Entitlement flag**
`ai_copilot` (existing).

---

## Dependency-Ordered Epic List

1. **WIT-CUSTOMPROPS** — Type-Scoped Custom Properties (foundational; provides the `IssueProperty` model + `property_values` serializer path consumed downstream). Flag: `work_item_types`.
2. **WIT-TEMPLATES** — Work Item Templates (depends on WIT-CUSTOMPROPS for `template_data` property values). Flag: `templates`.
3. **WIT-RECURRING** — Recurring Work Items (depends on WIT-TEMPLATES for generation-from-template; worker rollback rule applies). Flag: `recurring_work_items`.
4. **WIT-DUPLICATES** — Duplicate Detection & Flagging (independent read-only endpoint; reuses existing `duplicate` relation). Flag: `work_item_types`.
5. **WF-WORKFLOWS** — Workflows & Approvals (type-scoped, builds on the WIT-CUSTOMPROPS foundation; enforcement path is the R0 gate). Flag: `workflows_approvals`.
6. **AI-WORKITEMS** — AI Completion: Create, Describe, Summarize, Agent Record (depends on WIT-CUSTOMPROPS for structured-create property values; reuses the existing copilot pipeline; AI-write/agent is the R0 gate). Flag: `ai_copilot`.
