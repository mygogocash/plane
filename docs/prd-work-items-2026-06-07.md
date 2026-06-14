# Work Items & Work Item Types PRD — Self-Host Parity

## Executive Summary

The fork already ships the core Work Items surface (Markdown editor, immutable activity trail, relationships, five layouts, cycles, intake, work item types). This PRD closes the remaining marketed gaps grouped under "Work Items & Work Item Types": **Work Item Templates**, **Recurring Work Items**, **type-scoped Custom Properties**, **Workflows & Approvals**, **Duplicate Detection**, and the completion of the AI surface (**structured work-item creation**, **description draft/simplify/rewrite**, **one-click status summaries**, and **agent assignment & execution**). All work follows the fork strategy in `spec.md`: build OPEN, first-party Django/DRF models + DRF views + MobX stores, gate behind `apps/web/ce/lib/self-host-entitlements.ts`, and reuse the existing self-host LLM provider plumbing (`get_llm_config` / Vertex) rather than Plane Cloud. No proprietary EE source is copied.

Work is sequenced so each capability ships behind an entitlement flag that defaults on only when the backend is functional, and fails closed (AI features fall back to non-AI workflows when no provider is configured).

## Current State in Fork

- **Entitlement source**: `apps/web/ce/lib/self-host-entitlements.ts` exposes `SELF_HOSTED_FEATURE_FLAGS` (already includes `templates`, `recurring_work_items`, `work_item_types`, `workflows_approvals`, `ai_copilot`) and `isSelfHostedFeatureEnabled(feature)`. Consumed across `apps/web/ce/components/**` (bulk-operations, active-cycles, billing, upgrade modals). Tested in `self-host-entitlements.test.ts` (Vitest).
- **Work item types**: `IssueType` (`apps/api/plane/db/models/issue_type.py`) has `name`, `description`, `logo_props`, `is_epic`, `is_default`, `is_active`, `level`; `ProjectIssueType` maps types to projects. `Issue.type` FK (`issue.py`). **There is no custom-property model** — type-scoped fields like "Version"/"Channel" are not modeled.
- **AI / Copilot**: `CopilotConversation` + `CopilotMessage` (`apps/api/plane/db/models/copilot.py`) with `mode`, `prompt`, `answer`, `citations`, `actions`, `action_results`. `apps/api/plane/app/views/copilot.py` already implements `COPILOT_MODES = ("answer", "draft_subtasks", "command", "auto")`, write-mode guarding (`WRITE_MODES`), `ISSUE_ACTION_FIELDS`, action execution (`_execute_copilot_actions`), and provider config via `get_llm_config` / `is_vertex_provider`. Routed at `workspaces/<slug>/copilot/messages/` and `/conversations/` in `app/urls/external.py`.
- **States**: `State` (`apps/api/plane/db/models/state.py`) has `group` (`StateGroup`), `sequence`, `default`, `is_triage`. **There is no transition or approval model** — any state can move to any state.
- **Relationships / duplicates**: `IssueRelation` (`issue.py`) supports `duplicate`, `relates_to`, `blocked_by`, etc. (manual only). `IssueBlocker`, `IssueLink` present.
- **Background infra**: Celery + `django_celery_beat` configured (`settings/common.py`); `CELERY_IMPORTS` includes `plane.bgtasks.issue_automation_task`, which already runs a periodic `archive_and_close_old_issues` `@shared_task` — the precedent and home for recurring generation.
- **Templates (frontend stub)**: `apps/web/core/components/issues/issue-modal/modal.tsx` accepts a `templateId` prop and threads it through, but **no template model/API/persistence exists**.
- **Tests**: `apps/api/plane/tests/{unit,contract,smoke}` with `factories.py`; markers `unit`/`contract`/`smoke`/`slow`; Docker pytest flow.

## Gap to Close

- **Work Item Templates** — persistence model, API, type-scoped enforcement, and wired create-from-template flow (frontend currently only passes `templateId`).
- **Recurring Work Items** — recurrence schedule model, generation `@shared_task` on beat, owner/timezone handling, recurrence badge in UI.
- **Custom Properties per type** — no model for type-scoped properties or their per-issue values; "Bug tracks Version, Content tracks Channel" is unmet.
- **Workflows & Approvals** — no transition-restriction model and no approval-gate model; state changes are unconstrained.
- **Duplicate Detection & Flagging** — only manual `IssueRelation` duplicate; no real-time similarity matching with a confidence score at create/edit time.
- **AI-Powered Work Item Creation** — copilot can draft subtasks/commands, but no single "describe it → structured title/description/properties/assignee" create flow.
- **AI Description Draft / Simplify / Rewrite** — provider plumbing exists; dedicated description-editor actions and modes are not implemented end to end.
- **One-Click Status Summaries** — no endpoint/UI to condense activity + comments + linked items into a read-only digest.
- **AI Agent Assignment & Execution** — no agent model, no assignment, no execution audit (lowest-confidence area; scoped conservatively below).

## Goals / Non-Goals

**Goals**
- Ship OPEN, fully-functional first-party backends for the partial/missing capabilities above, each gated by an entitlement flag that defaults on only when functional.
- Reuse the existing copilot provider config and action pipeline for all AI features; never call Plane Cloud.
- Enforce workspace/project role checks server-side on every new mutating route; log all changes through the existing `IssueActivity` trail.
- Provide forward + rollback migration notes for every schema change.

**Non-Goals**
- No proprietary Plane EE source. No new billing/checkout surfaces.
- No static/no-op UI: a flag turns on only when its backend behavior is proven by tests.
- Do not rebuild PRESENT capabilities (editor, activity trail, relationships, five layouts, cycles, intake, bulk ops).
- Full autonomous AI agents are out of scope for v1; we ship an auditable agent-run record + queued execution stub (see Milestone 6), not a self-directing agent.

## Requirements

**Functional**
- Templates: a member can save a template (description, properties, default sub-items, target `issue_type`) scoped to a project; create-from-template pre-fills the modal; templates are listable/filterable per project and per type.
- Recurring: a member defines frequency (daily/weekly/monthly/custom RRULE), timezone, start, and end (date or N iterations); a beat task generates the next instance and records generation history; missed windows during worker downtime backfill at most one instance (no storm).
- Custom Properties: an admin defines properties on an `IssueType` (name, type enum: text/number/date/select/multi-select/boolean/member/url, options, required, default); issues carry per-property values; only properties for the issue's type are shown/validated.
- Workflows: an admin defines, per project + `issue_type`, allowed state transitions; a transition not in the allow-list is rejected (409). Empty/absent workflow = unrestricted (backward compatible).
- Approvals: an admin marks specific transitions as requiring approval; the transition enters a pending-approval state until an approver in the policy decides; decisions are audited.
- Duplicate detection: on create/edit title change, return up to N similar open work items in the same project with a confidence score; actionable to link as `duplicate`.
- AI create: a natural-language prompt returns a structured draft (title, description_html, priority, suggested assignee, type, properties) for review before save; reuses copilot `command`/new `create_work_item` mode.
- AI description: `draft` / `simplify` / `rewrite` actions on the description editor return text for accept/regenerate.
- Status summary: one endpoint condenses recent activity + comments + linked items into a read-only digest, optionally posted as a comment.

**Authorization / multi-tenant**
- Every model is scoped by `workspace` (and `project` where applicable) via `ProjectBaseModel`/`BaseModel` and filtered by the requesting member's active membership before serialization.
- Reuse `@allow_permission([...], level="PROJECT"|"WORKSPACE")` (see `copilot.py`). Writes require MEMBER+ for templates/recurring/properties values; ADMIN for property/workflow/approval *definitions*. GUESTs cannot trigger AI write modes (existing `WRITE_MODES` guard pattern).
- Approval decisions allowed only for members listed in the policy's approver set.
- Public/Space APIs must not expose workflow, approval, property-definition, recurrence, or AI internals.

## Data Models

All models inherit `ProjectBaseModel` (project-scoped) or `BaseModel` (workspace-scoped), giving `workspace`/`project`/`created_at`/`updated_at`/soft-delete consistent with existing models. New file group under `apps/api/plane/db/models/`.

- **`work_item_template.py`**
  - `WorkItemTemplate(ProjectBaseModel)`: `name`, `description_html` (TextField default `<p></p>`), `template_data` (JSONField — serialized issue payload: priority, labels, assignees-by-role, sub-items, property values), `issue_type` (FK `db.IssueType`, null), `is_active`. Index `(project, issue_type)`.
- **`recurring_work_item.py`**
  - `RecurringWorkItem(ProjectBaseModel)`: `name`, `template` (FK `WorkItemTemplate`, null), `payload` (JSONField fallback), `frequency` (TextChoices daily/weekly/monthly/custom), `rrule` (CharField, null), `timezone` (CharField), `start_date`, `end_date` (null), `max_iterations` (Int null), `next_run_at` (DateTime), `owned_by` (FK user), `is_active`.
  - `RecurringWorkItemRun(ProjectBaseModel)`: FK `recurring_work_item`, `generated_issue` (FK `db.Issue`, SET_NULL), `run_at`. Unique `(recurring_work_item, run_at)` to make generation idempotent.
- **`issue_property.py`**
  - `IssueProperty(BaseModel)`: `issue_type` (FK), `name`, `display_name`, `property_type` (TextChoices), `settings` (JSONField — options/min/max), `is_required`, `default_value` (JSONField), `sort_order`, `is_active`. Unique `(issue_type, name)` when not deleted.
  - `IssuePropertyValue(ProjectBaseModel)`: FK `issue`, FK `property`, `value` (JSONField). Unique `(issue, property)` when not deleted.
- **`workflow.py`**
  - `WorkflowTransition(ProjectBaseModel)`: `issue_type` (FK, null), `from_state` (FK `db.State`, null = "any"), `to_state` (FK `db.State`), `requires_approval` (bool default False). Unique `(project, issue_type, from_state, to_state)` when not deleted.
  - `ApprovalPolicy(ProjectBaseModel)`: FK `transition`, `approvers` (M2M user). 
  - `ApprovalDecision(ProjectBaseModel)`: FK `issue`, FK `transition`, `actor` (FK user), `decision` (TextChoices approved/rejected/pending), `note`, `decided_at`.
- **AI / agent (Milestone 6, conservative)**
  - Reuse `CopilotMessage` for create/draft/summary actions (add modes; no new table needed).
  - `AgentRun(ProjectBaseModel)`: `issue` (FK), `agent_key` (CharField — registered local agent id), `requested_by` (FK user), `status` (queued/running/succeeded/failed/cancelled), `input` (JSONField), `result` (JSONField), `error`. No autonomous execution in v1; status transitions are recorded and surfaced in activity.

**Migration notes (forward/rollback)** — Each model ships one additive migration per Milestone (`0xxx_<feature>.py`), scoped to its own tables/columns. All new columns are nullable or defaulted; no backfill of existing `issues`. Rollback = reverse migration drops only the new tables/columns; because `IssuePropertyValue`/`AgentRun`/workflow tables are additive and not referenced by existing code paths until the flag is on, reversing is safe. Treat the **workflow transition enforcement** migration as **R1** (changes write-path behavior under a flag) and the rest as **R1** schema-additive. No edits to applied migrations.

## API Contracts

Session-authenticated web routes under `/api/` (registered in `apps/api/plane/app/urls/`), mirroring the copilot route style (`workspaces/<slug>/...`). External `/api/v1/` (API-key) read endpoints added only where parity needs them (templates, properties), never for AI write actions.

- **Templates** — `apps/api/plane/app/urls/issue.py` (or new `template.py`)
  - `GET/POST /api/workspaces/<slug>/projects/<project_id>/work-item-templates/`
  - `GET/PATCH/DELETE /.../work-item-templates/<template_id>/`
  - `POST /.../issues/?template_id=<id>` reuses existing create; server hydrates from `template_data`. (Frontend already passes `templateId`.)
- **Recurring** 
  - `GET/POST /.../recurring-work-items/`, `GET/PATCH/DELETE /.../recurring-work-items/<id>/`
  - `GET /.../recurring-work-items/<id>/runs/` (read-only history).
- **Custom properties**
  - `GET/POST /api/workspaces/<slug>/issue-types/<type_id>/properties/` (ADMIN write)
  - `GET/PATCH/DELETE /.../properties/<property_id>/`
  - Values flow through the existing issue create/patch serializer under a `property_values` key (validated against the issue's type).
- **Workflows & approvals**
  - `GET/POST /.../projects/<project_id>/workflow-transitions/` (ADMIN)
  - State change on `PATCH /.../issues/<issue_id>/` is validated against transitions; rejected with `409 {"error": "transition_not_allowed"}`. If `requires_approval`, returns `202` and creates a pending `ApprovalDecision`.
  - `POST /.../issues/<issue_id>/approvals/<decision_id>/` (approver-only) to approve/reject.
- **Duplicate detection**
  - `GET /.../projects/<project_id>/issues/similar/?title=<q>` → `{ results: [{id, name, confidence}], ... }` (open issues, same project).
- **AI** (extend `app/urls/external.py` copilot family)
  - Reuse `POST /api/workspaces/<slug>/copilot/messages/` with new modes: `create_work_item`, `describe` (`action`: draft/simplify/rewrite), `summarize_issue`.
  - All AI routes 400 with `{"error": "LLM provider not configured"}` when `is_llm_configured(...)` is false (existing pattern) — fail closed.

All mutating routes enforce role via `@allow_permission`; existing CE routes remain unchanged and backward compatible.

## UX / UI Alignment

Stores live in `packages/shared-state` (MobX); service clients in `packages/services`; shared primitives in `@plane/ui`; orchestration in `apps/web/core`; entitlement gating in `apps/web/ce`.

- **Type selector + properties** (plane.so: "type dropdown at top, type-relevant fields"): extend `apps/web/core/components/issues/issue-detail` and `issue-modal/form.tsx` to render dynamic property fields from the selected `IssueType`. New `IssuePropertyStore`. Gate on `work_item_types`.
- **Templates** (plane.so: "Create from template" in modal): complete the existing `templateId` path in `issue-modal/modal.tsx` + `base.tsx`; add a template picker and a project-settings template manager. New `WorkItemTemplateStore`, `template.service.ts`. Gate on `templates`.
- **Recurring** (plane.so: "Recurring toggle, frequency, end/iterations; parent shows recurrence badge"): add a recurrence section to the create/edit modal and a recurrence badge on cards. New `RecurringWorkItemStore`. Gate on `recurring_work_items`.
- **Workflows & approvals** (plane.so: "state dropdown shows valid next states; approval gates"): the state dropdown in `issue-detail` filters options to allowed `to_state`s; an approval banner appears for pending transitions. Project settings route gets a workflow editor. Gate on `workflows_approvals`.
- **Duplicate detection** (plane.so: "inline banner with confidence %, dismissible/actionable"): a debounced similar-items banner under the title field in `issue-modal/form.tsx`, linking via existing `duplicate` relation UI. Gate on `work_item_types`/intake reuse.
- **AI create / describe / summarize** (plane.so: NL input; description "Draft/Simplify/Rewrite"; "Generate summary"): add AI buttons in the description editor and a summary button in the activity header, reusing the existing `gpt-assistant-popover.tsx` and `ai.service.ts`. Gate on `ai_copilot`; **hide entirely (not disable) when no provider is configured** so empty states never imply a broken paid feature.
- **Empty states**: each manager surface (templates, properties, recurring, workflows) shows a first-party "Self-hosted — no <X> yet, create one" empty state, never an upgrade prompt (consistent with `self-host-entitlements.ts`).

## Security

- Least-privilege: ADMIN required to define properties, workflows, approval policies; MEMBER+ for template/recurring CRUD and property *values*; GUEST blocked from AI write modes (reuse `WRITE_MODES` + role check in `copilot.py`).
- Multi-tenant isolation: every query filters by `workspace`/`project` and active membership before serialization; approval decisions checked against the policy approver set.
- Rich text: sanitize template `description_html`, property text values, and all AI-returned HTML through the existing `strip_tags`/HTML processor (`plane.utils.html_processor`) before persist.
- Files: any template/attachment assets keep the existing private signed-URL upload path (`get_upload_path`); no public exposure.
- No secret/prompt leakage: never log raw LLM prompts containing secrets, provider keys, or session tokens; AI provider keys stay in env/Secret Manager. AI features fail closed to non-AI workflows when provider config is absent.
- Duplicate-detection similarity must run only within the requester's authorized project scope (no cross-project leakage of titles).

## Edge Cases

- Self-hosted instance with legacy Free-plan metadata after entitlement on (per `spec.md`).
- Template cloning into a project missing referenced labels/states/members → skip-and-warn, never hard-fail.
- Recurring generation during worker downtime → idempotent via `RecurringWorkItemRun` unique `(recurring, run_at)`; backfill at most one instance; respect `timezone` and `end_date`/`max_iterations`.
- Property type change after values exist → block destructive type changes; require new property + migration of values.
- Workflow transition conflicts with bulk operations → bulk state change validates each item against its workflow; partial success with per-item errors.
- Approval policy when an approver is removed from the workspace → pending decisions reassignable by ADMIN; transition stays pending, not silently approved.
- Empty/absent workflow → unrestricted transitions (backward compatible with existing projects).
- AI provider outage / Vertex quota exhaustion → 400 fail-closed; UI hides AI actions.
- Duplicate detection on very short or empty titles → return empty, no banner.

## Testing Strategy

TDD (RED → GREEN → REFACTOR) per `TESTING.md`/`PYTHON.md`; Docker pytest flow.

- **API contract tests** (`plane/tests/contract/app`): authorization matrix (ADMIN/MEMBER/GUEST/non-member) for each new route; validation rejections (invalid property type, RRULE, disallowed transition → 409, approval gate → 202); persistence + activity-log assertions; AI routes return 400 when `is_llm_configured` is false (mock provider). Extend `factories.py` with `WorkItemTemplate`, `RecurringWorkItem`, `IssueProperty`, `WorkflowTransition` factories.
- **Unit tests** (`plane/tests/unit`): recurrence next-run computation (timezone, end conditions, idempotency), workflow allow-list resolution, property value validation, duplicate similarity scoring. Mock LLM/time/queue per `PYTHON.md`.
- **Frontend gating tests** (Vitest, alongside `self-host-entitlements.test.ts`): each new surface renders when its flag is on and shows the self-host empty state (never an upgrade modal) when data is empty; AI actions hidden when provider unconfigured.
- **Migration checks**: run forward + reverse on the Docker test stack; assert additive-only and reversibility.
- Completion gate per milestone: `pnpm check` (web) + `docker compose -f docker-compose-test.yml run --rm --build api-tests pytest -m unit` and relevant `-m contract`.

## Milestones

Each milestone is one focused commit, flag-gated, independently revertable.

1. **Custom Properties** — `IssueProperty`/`IssuePropertyValue` models + API + dynamic form fields. Rollback: revert commit; reverse additive migration; flag already off until functional. (R1)
2. **Work Item Templates** — model + API; complete the existing `templateId` create path + template manager UI. Rollback: revert; reverse migration; `templateId` path degrades to plain create. (R1)
3. **Recurring Work Items** — models + generation `@shared_task` added to `issue_automation_task`/beat + UI. Rollback: disable beat schedule + flag first, then revert worker/model code (per `spec.md` worker rollback rule). (R1)
4. **Duplicate Detection** — `issues/similar/` endpoint + inline banner reusing `duplicate` relation. Rollback: revert; read-only, no schema. (R1, no migration)
5. **Workflows & Approvals** — transition + approval models + PATCH enforcement + approver decisions + UI. Rollback: reverse migration; with no rows, transitions are unrestricted (safe default). (R1; enforcement path reviewed as R0-adjacent — see Risk Tier)
6. **AI completion** — copilot modes `create_work_item`/`describe`/`summarize_issue` + `AgentRun` record + UI buttons. Rollback: revert; AI fails closed to non-AI flows. (R1)

## Rollback Plan

- Frontend gating/display regressions: revert the milestone commit and redeploy web; entitlement flag stays off until backend functional.
- Backend schema milestones: reverse migration reviewed before deploy; all migrations additive, no backfill, so reversing drops only new tables/columns.
- Recurring/agent (worker) features: **disable the beat schedule / feature flag before reverting worker code** so no orphaned generation runs.
- Workflow enforcement: because empty workflow = unrestricted, reverting the enforcement code or deleting transition rows restores the prior any-to-any behavior with no data loss.
- AI features: fail closed to normal non-AI workflows when provider config is unavailable; no rollback needed for provider outage.
- Production rollback uses a prior immutable Artifact Registry `preview-<short_sha>` tag / GKE rollout history (per `spec.md`).

## Risk Tier

**Overall: R1.** Most milestones are additive schema + new flag-gated routes/UI with forward/rollback migrations and full authorization tests — squarely R1 per `ARCHITECTURE.md` (API contracts, schema, queues). Two areas warrant heightened care and must be treated as **R0 gates within their milestone**: (1) **Workflow transition enforcement** changes the issue write path (a critical path) — it ships only with allow-list + bulk-operation tests proving it cannot lock users out, and defaults to unrestricted when no workflow exists; (2) **AI agent execution** touches automated action on work items — v1 ships only an auditable `AgentRun` record with no autonomous execution, keeping it reversible. Per the house rule "untested code on a critical path is R0," no enforcement or AI-write code merges without the failing-then-green contract tests shown.
