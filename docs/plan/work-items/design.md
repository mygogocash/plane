# Work Items & Work Item Types — Design (plane.so alignment)

> **Scope.** This is an annotated-screenshot design spec aligning the fork to plane.so for the "Work Items & Work Item Types" surface. It is grounded in the verified PRD (`docs/prd-work-items-2026-06-07.md`) and direct inspection of the fork. Each screen documents what plane.so shows, the fork's current state, and the required change, followed by an implementation mapping.

> **Verified fork baseline.** `apps/web/core/components/issues/issue-modal/form.tsx` already imports `IssueTypeSelect`, `WorkItemTemplateSelect`, `WorkItemModalAdditionalProperties`, `DeDupeButtonRoot`, `DuplicateModalRoot`, and `useDebouncedDuplicateIssues` from `@/plane-web/*` — but `@/plane-web/*` aliases to `./ce/*` (`tsconfig.json:9`), and those CE files are **no-op stubs** (`ce/components/issues/issue-modal/template-select.tsx` returns `<></>`, `modal-additional-properties.tsx` returns `null`, `de-dupe/de-dupe-button.tsx` returns `<></>`). Backend models `work_item_template.py`, `recurring_work_item.py`, `issue_property.py`, `workflow.py` are **MISSING**. `copilot.py` ships `COPILOT_MODES = ("answer", "draft_subtasks", "command", "auto")` and `WRITE_MODES = {"command", "draft_subtasks"}` — no `create_work_item`/`describe`/`summarize_issue`. `ai.service.ts` exposes only `prompt()` and `rephraseGrammar()`. All five layouts (list, kanban, spreadsheet, calendar, gantt) are present under `core/components/issues/issue-layouts/`. Entitlement flags `templates`, `recurring_work_items`, `work_item_types`, `workflows_approvals`, `ai_copilot` all exist in `ce/lib/self-host-entitlements.ts`. This means the **wiring seams exist; the behavior behind them is what we build.**

---

## Reference: Work item create modal (title, description + AI, properties)

> The user's screenshot shows plane.so's "Create work item" modal: a project + work-item-type dropdown at the top, a single-line **Title** input, a rich-text **Description** area with a floating toolbar that includes an **"AI"** button and an **"I'm feeling lucky"** generate button, and a horizontal strip of property pills along the bottom — **State**, **Priority**, **Assignees**, **Labels**, **Start date**, **Due date**, **Cycle**, **Modules**, and a **Parent** picker. A "Create more" toggle and a primary **Save** button sit in the footer.

| UI element | plane.so behavior | Fork status | Required change |
|---|---|---|---|
| Project + type dropdown (top) | Selecting a work-item type reshapes the form (type-scoped properties appear) | `IssueTypeSelect` rendered in `form.tsx`; type FK exists (`issue_type.py`), but property reshaping is a `null` stub (`modal-additional-properties.tsx`) | Implement dynamic property render keyed to selected `issue_type`; gate `work_item_types` |
| Title input | Single-line; drives duplicate detection on change | `IssueTitleInput` present and functional | None for title; wire its change to duplicate detection (below) |
| Description rich-text editor | Markdown/rich editor with `/` slash menu | Present and functional (`IssueDescriptionEditor`, `@plane/editor`) | None — reuse |
| **"AI" button** in description toolbar | Opens menu: **Draft**, **Simplify**, **Rewrite**; returns text for accept/regenerate | `GptAssistantPopover` exists (`core/components/core/modals/gpt-assistant-popover.tsx`); `ai.service.ts` has only `prompt`/`rephraseGrammar` — no draft/simplify/rewrite modes | Add `describe` copilot mode (`action`: draft/simplify/rewrite); add `ai.service` methods; surface in toolbar; **hide entirely when no provider configured** |
| **"I'm feeling lucky" / Generate** | One-shot NL → full structured draft | No structured-create flow | Add `create_work_item` copilot mode returning `{title, description_html, priority, assignee, type, property_values}` for review-before-save |
| State pill | Editable; in plane.so honors workflow allowed transitions | `core/components/dropdowns/state` functional; **no transition model** | On edit path, filter `to_state` options to allowed transitions (Workflows screen) |
| Priority / Assignees / Labels / Start / Due / Cycle / Modules / Parent | Standard property pills (`IssueDefaultProperties`, `IssueParentTag`) | Present and functional | None — reuse |
| Type-scoped custom property pills | Bug shows "Version", Content shows "Channel" | `WorkItemModalAdditionalProperties` is a `null` stub | Render `IssueProperty` fields for the selected type; validate required; submit under `property_values` key |
| Duplicate banner under title | Inline similar-items banner with confidence %, dismissible/actionable | `DeDupeButtonRoot`/`DuplicateModalRoot` stubs return empty; `useDebouncedDuplicateIssues` wired but no backend | Implement `issues/similar/` endpoint + debounced banner; link via existing `duplicate` relation |
| "Create from template" | Template picker pre-fills the modal | `WorkItemTemplateSelect` is a `<></>` stub; `modal.tsx` threads `templateId` but no model/API | Implement `WorkItemTemplate` model/API; populate picker; hydrate form server-side via `?template_id=` |
| Recurring section | Toggle → frequency / timezone / end-or-iterations | Absent | Add recurrence section; `RecurringWorkItem` model + beat generation |
| Create-more toggle + Save | Standard | Present (`ToggleSwitch`) | None |

**Implementation mapping**

- **Route (no new top-level route):** the create modal opens over `:workspaceSlug/browse/:workItem` and project work-item lists already registered in `apps/web/app/routes/core.ts`. No `core.ts` edit required for the modal itself.
- **Components:** orchestration stays in `apps/web/core/components/issues/issue-modal/{form.tsx,modal.tsx,base.tsx}` (unchanged seams). Replace the CE stubs with real implementations: `apps/web/ce/components/issues/issue-modal/template-select.tsx`, `modal-additional-properties.tsx`, and `apps/web/ce/components/de-dupe/{de-dupe-button.tsx,duplicate-modal/,duplicate-popover/}`.
- **MobX stores (`packages/shared-state`):** `IssuePropertyStore` (type→property definitions + per-issue values), `WorkItemTemplateStore`, `RecurringWorkItemStore`. Each exposes `loading`/`error` flags and is keyed by `projectId`.
- **Services (`packages/services`):** `template.service.ts`, `issue-property.service.ts`, `recurring.service.ts`, and extend `ai/ai.service.ts` with `draftDescription`/`simplify`/`rewrite`/`createWorkItem`/`summarizeIssue` calling `POST /api/workspaces/<slug>/copilot/messages/`.
- **Entitlement wiring:** properties + duplicate banner gate on `work_item_types`; template picker on `templates`; recurring section on `recurring_work_items`; AI buttons on `ai_copilot` AND a provider-configured check (`is_llm_configured`) — when unconfigured, **render nothing** (do not disable) per PRD §UX so the empty state never implies a broken paid feature.
- **Empty / loading / error states:** type with no custom properties → render no extra pills (not an error); template picker with zero templates → first-party "Self-hosted — no templates yet, create one" affordance, never an upgrade modal; AI request failure → inline toast + "Regenerate", editor content untouched; duplicate query while loading → no banner flash (debounced, min title length, returns empty for short/empty titles per PRD Edge Cases).
- **Responsive:** property pills wrap to a second row below ~640px; the AI menu and template picker open as bottom sheets on touch. Modal max-height caps with internal scroll on the description region.
- **a11y:** type dropdown and property selects are labelled comboboxes with `aria-expanded`; the duplicate banner is an `aria-live="polite"` region; AI menu items are a roving-tabindex menu; "Regenerate" is keyboard-reachable; required custom properties expose `aria-required` and surface validation via `aria-describedby`.

---

## Reference: Work item types + custom properties

> The user's screenshot shows plane.so's **Work item types** settings: a list of types (Bug, Feature, Task, Epic) each with an icon and toggle, and a detail panel listing **Custom properties** for the selected type — each property a row with a **name**, a **type** badge (Text, Number, Date, Select, Multi-select, Boolean, Member, URL), a **required** toggle, and a "+ Add property" button.

| UI element | plane.so behavior | Fork status | Required change |
|---|---|---|---|
| Type list with enable toggle | `is_active`/`is_default`/`is_epic` per type | `IssueType` + `ProjectIssueType` present (`db/models/issue_type.py`) | None — reuse existing type management |
| Custom property row | Define name, `property_type`, options, required, default | **No model** for type-scoped properties (PRD §12) | Add `IssueProperty(BaseModel)`: `issue_type` FK, `property_type` TextChoices, `settings` JSON, `is_required`, `default_value`, `sort_order` |
| Property type badge | text/number/date/select/multi-select/boolean/member/url | Absent | Enum `property_type`; per-issue values in `IssuePropertyValue(ProjectBaseModel)` unique `(issue, property)` |
| Required toggle | Validated on issue save | Absent | Server validates `property_values` against the issue's type on create/patch |
| "+ Add property" (ADMIN) | Admin-only definition | Absent | `GET/POST /api/workspaces/<slug>/issue-types/<type_id>/properties/` with `@allow_permission([ADMIN], level="WORKSPACE")` |
| Destructive type change guard | Block changing type after values exist | Absent | Reject destructive `property_type` change when values exist (PRD Edge Cases) — require new property |

**Implementation mapping**

- **Route:** add a "Work item types" / properties manager under project settings. Add to `apps/web/app/routes/core.ts` alongside the existing features block (sibling to lines 307–345, e.g. `":workspaceSlug/settings/projects/:projectId/work-item-types"` → a new page under `(settings)/settings/projects/[projectId]/`).
- **Components:** new manager in `apps/web/core/components/.../settings/work-item-types/` for the type list + property editor; reuse `@plane/ui` primitives. The dynamic per-issue render lives in the `modal-additional-properties.tsx` CE file (above).
- **Backend:** `apps/api/plane/db/models/issue_property.py` (new); DRF views in `apps/api/plane/app/views/` registered in `apps/api/plane/app/urls/issue.py`; additive migration `0xxx_issue_property.py` (nullable/defaulted, no backfill).
- **Stores/services:** `IssuePropertyStore` + `issue-property.service.ts`.
- **Entitlement:** gate on `work_item_types`.
- **Empty/loading/error:** type with no properties → "No custom properties yet" first-party empty state; invalid `property_type` POST → `400` with field error mapped to the row; member (non-admin) sees read-only definitions (values still editable).
- **Responsive:** property table collapses to stacked cards on narrow widths.
- **a11y:** property table uses real `<table>` semantics with header scope; type/required toggles are labelled switches; the type enum is a native-semantics combobox.

---

## Reference: Templates (create-from-template + manager)

> The user's screenshot shows plane.so's template flow: a **"Create from template"** entry in the work-item modal that opens a searchable list of templates (each scoped to a type), and a **project-settings Templates manager** listing saved templates with edit/delete and a "Save as template" action from an existing work item.

| UI element | plane.so behavior | Fork status | Required change |
|---|---|---|---|
| "Create from template" picker | Pre-fills modal with template payload | `WorkItemTemplateSelect` stub returns `<></>` | Implement picker backed by `WorkItemTemplate` list |
| Type-scoped filtering | Templates filter by selected `issue_type` | Absent | `WorkItemTemplate.issue_type` FK (null = all); index `(project, issue_type)` |
| Template payload | Description, properties, default sub-items, assignees-by-role | Absent (`template_data` JSON) | `template_data` JSONField; server hydrates on `POST issues/?template_id=` |
| Templates manager (settings) | List / create / edit / delete per project | Absent | `GET/POST .../work-item-templates/`, `GET/PATCH/DELETE .../work-item-templates/<id>/` (MEMBER+) |
| Missing-reference handling | — | Absent | Skip-and-warn when target project lacks referenced labels/states/members (PRD Edge Cases) — never hard-fail |

**Implementation mapping**

- **Route:** add `":workspaceSlug/settings/projects/:projectId/templates"` to `apps/web/app/routes/core.ts` next to the features routes; page under `(settings)/settings/projects/[projectId]/templates/`.
- **Components:** `WorkItemTemplateSelect` (replace CE stub) for the modal picker; new templates-manager component in `core/components/.../settings/templates/`.
- **Backend:** `apps/api/plane/db/models/work_item_template.py` (`WorkItemTemplate(ProjectBaseModel)`); views registered in `apps/api/plane/app/urls/issue.py` (or new `template.py`); reuse existing issue-create view to hydrate from `template_data`; sanitize `description_html` via `plane.utils.html_processor` before persist (PRD §Security).
- **Stores/services:** `WorkItemTemplateStore` + `template.service.ts`.
- **Entitlement:** gate on `templates`.
- **Empty/loading/error:** zero templates → first-party "Self-hosted — no templates yet, create one" empty state (never upgrade prompt); clone into project missing references → toast "Some fields were skipped" with the item still created; delete → optimistic remove with rollback on failure.
- **Responsive:** picker is a popover on desktop, full-screen sheet on mobile; manager list is a single column on narrow widths.
- **a11y:** picker is a labelled combobox with type-ahead search and `aria-activedescendant`; manager rows expose edit/delete as named buttons.

---

## Reference: Recurring items

> The user's screenshot shows plane.so's recurrence control inside the work-item modal: a **Recurring** toggle that reveals **Frequency** (Daily / Weekly / Monthly / Custom), a **timezone** selector, a **Starts** date, and an **Ends** choice (on a date / after N occurrences). The parent work item displays a small **recurrence badge** on its card.

| UI element | plane.so behavior | Fork status | Required change |
|---|---|---|---|
| Recurring toggle | Reveals recurrence config | Absent | Add recurrence section to create/edit modal |
| Frequency selector | daily/weekly/monthly/custom (RRULE) | Absent | `RecurringWorkItem.frequency` TextChoices + `rrule` CharField |
| Timezone | Per-rule timezone | Absent | `timezone` CharField; next-run computed in tz |
| Ends (date / N iterations) | End by date or count | Absent | `end_date` + `max_iterations` (nullable) |
| Generation | Server creates next instance on schedule | Celery + `django_celery_beat` configured; `issue_automation_task` already runs a periodic `@shared_task` (PRD §Current State) | Add generation `@shared_task` on beat; backfill at most one missed instance (no storm) |
| Idempotency / history | — | Absent | `RecurringWorkItemRun` unique `(recurring_work_item, run_at)`; `GET .../recurring-work-items/<id>/runs/` |
| Recurrence badge on card | Visual indicator | Absent | Badge on issue cards in all layouts |

**Implementation mapping**

- **Route:** config lives in the existing modal (no new route); read-only run history surfaced in the work-item detail / recurring manager.
- **Components:** recurrence section in `core/components/issues/issue-modal/`; recurrence badge added to card renderers under `core/components/issues/issue-layouts/{list,kanban,spreadsheet,calendar,gantt}/`.
- **Backend:** `apps/api/plane/db/models/recurring_work_item.py` (`RecurringWorkItem` + `RecurringWorkItemRun`); generation task added to `apps/api/plane/bgtasks/issue_automation_task.py` and registered on beat; views in `apps/api/plane/app/urls/`.
- **Stores/services:** `RecurringWorkItemStore` + `recurring.service.ts`.
- **Entitlement:** gate on `recurring_work_items`. **Rollback rule (PRD):** disable beat schedule + flag **before** reverting worker code so no orphaned runs.
- **Empty/loading/error:** worker downtime → idempotent backfill of one instance; `end_date`/`max_iterations` reached → rule auto-deactivates (`is_active=false`); invalid RRULE → `400` surfaced inline.
- **Responsive:** recurrence section collapses; frequency/ends become stacked selects on mobile.
- **a11y:** toggle is a labelled switch; the "Ends after N" numeric input has `aria-label` and min=1; badge has an `aria-label="Recurring"` and is not color-only.

---

## Reference: Layouts (list / board / spreadsheet / calendar / gantt)

> The user's screenshot shows plane.so's layout switcher with five views — **List**, **Board** (kanban), **Spreadsheet** (table with property columns), **Calendar**, and **Gantt** (timeline) — with type icons and the recurrence badge visible per item.

| UI element | plane.so behavior | Fork status | Required change |
|---|---|---|---|
| List layout | Grouped rows | Present (`issue-layouts/list`) | None — surface custom-property columns + recurrence badge |
| Board (kanban) | Columns by group | Present (`issue-layouts/kanban`) | Recurrence badge on cards |
| Spreadsheet | Property columns | Present (`issue-layouts/spreadsheet`) | Add custom-property columns (read; edit where applicable) |
| Calendar | Date-based | Present (`issue-layouts/calendar`) | None functional; honor start/due |
| Gantt | Timeline | Present (`issue-layouts/gantt`) | None functional |
| Type icon per item | Shows work-item type | Type model present | Render type logo from `IssueType.logo_props` |

**Implementation mapping**

- **Route:** layouts render within existing project work-item routes in `apps/web/app/routes/core.ts`; no new route.
- **Components:** extend card/row/column renderers under `core/components/issues/issue-layouts/properties/` to display custom-property values and the recurrence badge; spreadsheet column registry gains type-scoped columns.
- **Stores/services:** reuse existing issue stores + `IssuePropertyStore` for column values.
- **Entitlement:** custom-property columns gate on `work_item_types`; recurrence badge on `recurring_work_items`.
- **Empty/loading/error:** items lacking a value for a custom column render blank (not error); a layout with no items keeps the existing per-layout empty state under `issue-layouts/empty-states/`.
- **Responsive:** spreadsheet horizontally scrolls with frozen first column; gantt/calendar already responsive — custom columns hidden below a width threshold to preserve core columns.
- **a11y:** spreadsheet uses table semantics with sortable column headers (`aria-sort`); type icons carry an `aria-label` with the type name.

---

## Reference: Workflows & approvals

> The user's screenshot shows plane.so's **Workflow** editor in project settings: per state, a configurable set of **allowed next states**, and a flag marking specific transitions as **requiring approval** with an **approver** list. In the work-item detail, the **State dropdown only offers valid next states**, and a pending transition shows an **approval banner**.

| UI element | plane.so behavior | Fork status | Required change |
|---|---|---|---|
| Workflow editor (settings) | Define allowed transitions per type | **No transition model** — any state → any state (PRD §14) | `WorkflowTransition(ProjectBaseModel)`: `issue_type`(null), `from_state`(null="any"), `to_state`, `requires_approval`; ADMIN-only editor |
| State dropdown filters to valid next states | Disallowed targets hidden | `core/components/dropdowns/state` shows all states | Filter `to_state` options to allowed transitions; empty/absent workflow = unrestricted (backward compatible) |
| Transition rejection | Invalid move blocked | Unconstrained | `PATCH issues/<id>/` validates state change → `409 {"error":"transition_not_allowed"}` |
| Approval gate | Transition pends until approver decides | Absent | If `requires_approval` → `202` + pending `ApprovalDecision`; transition stays pending |
| Approver decision | Approve/reject, audited | Absent | `POST .../issues/<id>/approvals/<decision_id>/` (approver-only); `ApprovalPolicy` M2M approvers |
| Approval banner (detail) | Pending state indicator | Absent | Banner in `issue-detail`; all changes logged to `IssueActivity` |
| Bulk state change | Per-item validation | Bulk ops exist; not workflow-aware | Validate each item; partial success with per-item errors (PRD Edge Cases) |

**Implementation mapping**

- **Route:** add `":workspaceSlug/settings/projects/:projectId/features/workflows"` to `apps/web/app/routes/core.ts` (sibling to cycles/modules/intake at lines 307–324); page under `(settings)/settings/projects/[projectId]/features/workflows/`.
- **Components:** workflow editor in `core/components/.../settings/workflows/`; state-dropdown option filtering in `core/components/dropdowns/state`; approval banner in `core/components/issues/issue-detail`.
- **Backend:** `apps/api/plane/db/models/workflow.py` (`WorkflowTransition`, `ApprovalPolicy`, `ApprovalDecision`); enforcement in the issue PATCH view; views in `apps/api/plane/app/urls/`. **R0-gate (PRD §Risk Tier):** enforcement is a critical write path — ships only with allow-list + bulk-op contract tests proving it cannot lock users out; defaults to unrestricted when no workflow exists.
- **Stores/services:** `WorkflowStore` + `workflow.service.ts`.
- **Entitlement:** gate on `workflows_approvals`.
- **Empty/loading/error:** no transitions defined → state dropdown unrestricted (safe default); rejected transition → `409` surfaced as inline toast, dropdown reverts; approver removed from workspace → pending decision reassignable by ADMIN, never silently approved (PRD Edge Cases).
- **Responsive:** workflow matrix scrolls horizontally; approval banner stacks on mobile.
- **a11y:** approval banner is an `aria-live="assertive"` region with named Approve/Reject buttons; the filtered state dropdown announces "N states available"; disabled-because-disallowed states are omitted (not just visually dimmed) to avoid confusing AT users.

---

## Reference: Settings → Features (Templates, Worklogs)

> The user's screenshot shows plane.so's project **Settings → Features** panel: a list of toggleable feature rows (Cycles, Modules, Views, Pages, Intake) extended with **Templates**, **Workflows**, **Worklogs / Time tracking**, and **Work item types**, each a labelled switch with a short description.

| UI element | plane.so behavior | Fork status | Required change |
|---|---|---|---|
| Cycles / Modules / Views / Pages / Intake toggles | Per-project feature enable | Present (`core.ts:307–324`) | None |
| Templates toggle | Enable templates per project | Manager absent | Add row; gated by `templates` flag |
| Workflows toggle | Enable workflow enforcement | Absent | Add row; gated by `workflows_approvals` |
| Worklogs / Time tracking | Enable time tracking | Flag `worklogs_time_tracking` exists in entitlements; no settings route found in `app/routes` | Add Worklogs settings surface; gate `worklogs_time_tracking` |
| Work item types toggle | Enable custom types/properties | Type model present; properties absent | Add row linking to the types/properties manager; gate `work_item_types` |
| Feature row styling | Switch + description, no upsell | Entitlement model is self-host (no paid upsell) | Reuse self-host empty/enabled states; never render upgrade modal |

**Implementation mapping**

- **Route:** extend the features block in `apps/web/app/routes/core.ts` (lines 307–324) with `features/workflows` and a `features/worklogs` (or `features/time-tracking`) route; pages under `(settings)/settings/projects/[projectId]/features/`.
- **Components:** features-list page gains rows for Templates / Workflows / Worklogs / Work item types, each linking to its manager; reuse the existing feature-row primitive used by cycles/modules.
- **Stores/services:** feature-enablement reuses existing project-feature store; entitlement check via `isSelfHostedFeatureEnabled(feature)` from `ce/lib/self-host-entitlements.ts`.
- **Entitlement wiring:** each row reads its flag (`templates`, `workflows_approvals`, `worklogs_time_tracking`, `work_item_types`); per PRD, a flag is on only when its backend is proven by tests, and surfaces a first-party self-host empty state rather than an upgrade prompt.
- **Empty/loading/error:** toggling a feature with no data yet → links to the manager's "create one" empty state; a flag whose backend is not yet shipped stays off (fail-closed).
- **Responsive:** feature rows stack as full-width cards on mobile; descriptions truncate with full text on focus.
- **a11y:** each toggle is a labelled `role="switch"` with `aria-describedby` pointing at its description; the panel is a single landmark `<section>` with a heading.

---

## Cross-cutting notes

- **Fail-closed AI (PRD §UX/§Security):** every AI affordance (description Draft/Simplify/Rewrite, NL create, status summary) is **hidden, not disabled,** when `is_llm_configured()` is false; backend AI routes return `400 {"error":"LLM provider not configured"}`. Reuse `get_llm_config`/Vertex; never call Plane Cloud.
- **Authorization:** all new mutating routes use `@allow_permission([...], level="PROJECT"|"WORKSPACE")` per `copilot.py`; ADMIN for property/workflow/approval **definitions**, MEMBER+ for template/recurring CRUD and property **values**, GUEST blocked from AI write modes (existing `WRITE_MODES` guard). Every change logs through `IssueActivity`.
- **Migrations:** one additive, nullable/defaulted migration per milestone, forward + reverse verified on the Docker test stack; no edits to applied migrations; workflow-enforcement migration treated as R1 with R0 review on the write path.
- **Status summary screen (not in the user's screenshots but in PRD §57):** a "Generate summary" button in the activity header (`issue-detail/issue-activity`) calls the new `summarize_issue` copilot mode; output is a read-only digest, optionally posted as a comment; gated on `ai_copilot` + provider configured.
