# Work Items & Work Item Types — Tasks (Claude Code subagent cards)

These cards decompose the verified PRD (`docs/prd-work-items-2026-06-07.md`), epics (WIT-CUSTOMPROPS, WIT-TEMPLATES, WIT-RECURRING, WIT-DUPLICATES, WF-WORKFLOWS, AI-WORKITEMS), and stories (EPIC-CP, EPIC-TPL, EPIC-REC, EPIC-DUP, EPIC-WF, EPIC-AI) into self-contained units a cold Claude Code subagent can execute with no prior memory. Each card is ~1 PR, ordered backend → API → frontend within its feature.

**Verified fork baseline (true at authoring time; re-grep before trusting):**
- Entitlement flags `templates`, `recurring_work_items`, `work_item_types`, `workflows_approvals`, `ai_copilot` exist in `apps/web/ce/lib/self-host-entitlements.ts` (`SELF_HOSTED_FEATURE_FLAGS` at line 12; `isSelfHostedFeatureEnabled` at line 33).
- `apps/web/core/components/issues/issue-modal/form.tsx` imports `DeDupeButtonRoot` (line 47), `DuplicateModalRoot` (48), `IssueTypeSelect`/`WorkItemTemplateSelect` (49), `WorkItemModalAdditionalProperties` (50), `useDebouncedDuplicateIssues` (51) — all from `@/plane-web/*`, which aliases to CE stubs (`apps/web/ce/components/issues/issue-modal/{template-select.tsx,modal-additional-properties.tsx}`, `apps/web/ce/components/de-dupe/{de-dupe-button.tsx,duplicate-modal/,duplicate-popover/}`). These stubs render empty.
- `apps/api/plane/db/models/issue_type.py`: `IssueType(BaseModel)` at line 14 (workspace-scoped); `ProjectIssueType(ProjectBaseModel)` at 35.
- `apps/api/plane/db/models/state.py`: `StateGroup` (TextChoices) at line 14; `State` model with `group`, `sequence`, `default`, `is_triage`.
- `apps/api/plane/app/views/copilot.py`: `from plane.app.permissions import ROLE, allow_permission` (17); `get_llm_config`/`is_llm_configured`/`is_vertex_provider` imported (34); `COPILOT_MODES = ("answer","draft_subtasks","command","auto")` (37); `ISSUE_ACTION_FIELDS` (40); `WRITE_MODES = {"command","draft_subtasks"}` (52); GUEST write-block at 83; provider fail-closed `400` at 89-90; `_execute_copilot_actions` (708).
- `apps/api/plane/bgtasks/issue_automation_task.py`: `@shared_task` `archive_and_close_old_issues` at lines 22-23 (the recurring-generation precedent).
- `apps/api/plane/utils/html_processor.py`: `strip_tags(html)` at line 28.
- URL files: `apps/api/plane/app/urls/{issue.py,external.py,api.py,timezone.py}`.
- Tests: `apps/api/plane/tests/{unit,contract,smoke}` with `factories.py` (factory_boy `DjangoModelFactory`); `apps/api/pytest.ini` markers `unit`/`contract`/`smoke`/`slow` with `--strict-markers`. Docker run: `docker compose -f docker-compose-test.yml run --rm --build api-tests pytest -m unit`.
- `packages/services/src/ai/ai.service.ts`: `class AIService extends APIService` (33) with only `prompt` (47) and `rephraseGrammar` (62).

**House rules every card inherits:** TDD (RED → GREEN → REFACTOR); show the failing test before writing production code. All mutating routes use `@allow_permission([ROLE...], level="PROJECT"|"WORKSPACE")`. New models inherit `ProjectBaseModel` or `BaseModel`. Migrations are additive (nullable/defaulted, no backfill) with forward + reverse verified. Sanitize all rich-text/user HTML through `plane.utils.html_processor.strip_tags` before persist. AI surfaces fail closed (`400 {"error":"LLM provider not configured"}`) and hide (not disable) when no provider. Flag-gated surfaces show first-party self-host empty states, never upgrade modals.

---

## CP-1-BE — IssueProperty + IssuePropertyValue models & migration

**Implements** EPIC-CP / WIT-CUSTOMPROPS (foundational data layer)
**Depends on** none
**Risk tier** R1 (additive schema; nullable/defaulted, no backfill)
**Worktree isolation** y

**Context** The fork has no model for type-scoped custom properties (PRD §12: "Bug tracks Version, Content tracks Channel" is unmet). This card adds two models. `IssueProperty` mirrors the workspace-scoping of `IssueType(BaseModel)` (`apps/api/plane/db/models/issue_type.py:14`) and FKs to `db.IssueType`. `IssuePropertyValue(ProjectBaseModel)` FKs to `db.Issue`. Both use soft-delete-aware unique constraints consistent with existing models. No views/serializers in this card — just models + migration.

**Files**
- New: `apps/api/plane/db/models/issue_property.py`
- Edit: `apps/api/plane/db/models/__init__.py` (export `IssueProperty`, `IssuePropertyValue`)
- New: `apps/api/plane/db/migrations/0xxx_custom_properties.py` (generate via `makemigrations`; rename to a descriptive slug)
- New test: `apps/api/plane/tests/unit/db/test_issue_property_model.py`
- Edit: `apps/api/plane/tests/factories.py` (add `IssuePropertyFactory`, `IssuePropertyValueFactory`)

**TDD — failing test first**
`apps/api/plane/tests/unit/db/test_issue_property_model.py`, marker `@pytest.mark.unit`:
- `test_issue_property_persists_scoped_to_issue_type` — create an `IssueType`, then an `IssueProperty(name="version", property_type="select", settings={"options":[...]})`; assert it saves, `.issue_type_id` matches, and `workspace` is inherited from `BaseModel`.
- `test_duplicate_property_name_on_same_type_rejected` — create `version` twice on the same type (not deleted); assert `IntegrityError` (unique `(issue_type, name)` when not deleted).
- `test_same_name_allowed_on_different_types` — `version` on two distinct types both persist.
- `test_issue_property_value_unique_per_issue_property` — create two `IssuePropertyValue` rows for the same `(issue, property)` (not deleted); assert `IntegrityError`.
- `test_property_value_persists_json_value` — `value={"text":"1.4.0"}` round-trips.

Assertions reference the property-type enum members `text/number/date/select/multi_select/boolean/member/url`.

**Implementation outline**
- Model `IssueProperty(BaseModel)`: fields `issue_type = models.ForeignKey("db.IssueType", on_delete=models.CASCADE, related_name="properties")`, `name`, `display_name`, `property_type` (`models.TextChoices` with the 8 PRD enum members), `settings = models.JSONField(default=dict)`, `is_required = models.BooleanField(default=False)`, `default_value = models.JSONField(null=True, blank=True)`, `sort_order = models.FloatField(default=65535)`, `is_active = models.BooleanField(default=True)`. Soft-delete-aware partial unique constraint on `(issue_type, name)` — follow the `condition=Q(deleted_at__isnull=True)` `UniqueConstraint` pattern used elsewhere in `db/models` (grep `UniqueConstraint` + `deleted_at__isnull` for the exact idiom; do not invent).
- Model `IssuePropertyValue(ProjectBaseModel)`: `issue = models.ForeignKey("db.Issue", ...)`, `property = models.ForeignKey("db.IssueProperty", ...)`, `value = models.JSONField(null=True, blank=True)`. Partial unique `(issue, property)` when not deleted.
- Register exports in `db/models/__init__.py` matching the existing alphabetical/grouped style.
- `makemigrations db`; confirm migration is additive only.

**Acceptance criteria**
- Given an `IssueType`, When an `IssueProperty` is created with a valid `property_type`, Then it persists workspace-scoped with the type FK set.
- Given a non-deleted `version` property on a type, When a second `version` is created on that type, Then an `IntegrityError` is raised; When created on a different type, Then it persists.
- Given an `(issue, property)` pair, When a second non-deleted value row is created, Then an `IntegrityError` is raised.
- (edge) Given a soft-deleted `version` property, When a new `version` is created on the same type, Then it persists (partial constraint ignores deleted rows).

**Verify**
- RED then GREEN: `docker compose -f docker-compose-test.yml run --rm --build api-tests pytest plane/tests/unit/db/test_issue_property_model.py -m unit -v`
- Migration round-trip: `docker compose -f docker-compose-test.yml run --rm api-tests python manage.py migrate db <prev> && python manage.py migrate db <new>` (forward), then migrate back to `<prev>` (reverse) — assert no errors.
- Full unit suite green: `docker compose -f docker-compose-test.yml run --rm api-tests pytest -m unit`

**Done when** Both models + migration exist, all named tests pass RED→GREEN, full unit suite green, migration verified forward+reverse, factories added, exports registered.

---

## CP-2-API — Property-definition CRUD API (ADMIN) + value validation in issue serializer

**Implements** EPIC-CP / WIT-CUSTOMPROPS (story CP-1, CP-2, CP-4)
**Depends on** [CP-1-BE]
**Risk tier** R1 (extends the issue write path under validation; ADMIN-gated definitions)
**Worktree isolation** y

**Context** Property **definitions** are ADMIN-only and workspace-scoped per type; property **values** are MEMBER+ and flow through the **existing** issue create/patch serializer under a `property_values` key (PRD §API Contracts lines 98-101). This card adds the definition CRUD views/URLs and extends the existing issue serializer's validation — it does NOT create a parallel write path. Authorization reuses `@allow_permission` exactly as in `copilot.py:64,199`.

**Files**
- New: `apps/api/plane/app/views/issue/property.py` (or extend an existing issue view module — grep `apps/api/plane/app/views/issue/` first for the convention)
- New: `apps/api/plane/app/serializers/issue_property.py` (+ register in `app/serializers/__init__.py`)
- Edit: `apps/api/plane/app/urls/issue.py` (register property routes)
- Edit: the existing issue create/update serializer (grep `apps/api/plane/app/serializers/issue` for the class threaded by the issue PATCH/POST view) to validate `property_values` against the issue's `type`
- New test: `apps/api/plane/tests/contract/app/test_issue_property_api.py`

**TDD — failing test first**
`apps/api/plane/tests/contract/app/test_issue_property_api.py`, marker `@pytest.mark.contract`:
- `test_admin_creates_select_property_persists_and_logs_activity` — ADMIN POSTs `{name, display_name, property_type:"select", settings:{options:[...]}, is_required:true}` to `/api/workspaces/<slug>/issue-types/<type_id>/properties/`; assert `201`, persisted, and an `IssueActivity` row recorded (grep how copilot/issue views log activity — reuse, do not invent).
- `test_invalid_property_type_rejected_400` — POST `property_type:"frobnicate"` (or `select` with empty `options`); assert `400`, nothing persisted.
- `test_duplicate_property_name_rejected_409` — second `version` on same type → `409`.
- `test_member_cannot_create_property_definition_403` — MEMBER POST → `403`.
- `test_guest_cannot_create_property_definition_403` — GUEST POST → `403`.
- `test_empty_properties_list_returns_200_empty` — GET on a type with no properties → `200`, `[]`.
- `test_member_sets_property_value_upserts_and_logs` — MEMBER PATCHes `/.../issues/<id>/` with `property_values:{<property_id>:"1.4.0"}`; assert value upserted (unique `(issue, property)`), returned on issue, logged.
- `test_missing_required_property_value_rejected_400` — create issue of a type with a required property, omit it; assert `400` naming the missing property.
- `test_property_values_cross_type_rejected_400` — `property_values` references a property of a different `IssueType`; assert `400` `property_not_for_type`.
- `test_guest_cannot_set_property_value_403`.
- `test_property_type_change_with_existing_values_blocked_409` — PATCH a `select` property (with value rows) to `number`; assert `409` `destructive_type_change_blocked`, values untouched.
- `test_property_type_change_without_values_allowed_200`.

**Implementation outline**
- View: a DRF `BaseAPIView`/`ViewSet` consistent with `apps/api/plane/app/views/issue/` (grep for the base class and pagination mixins used by sibling issue views). Decorate writes `@allow_permission([ROLE.ADMIN], level="WORKSPACE")` (definitions are type-scoped → WORKSPACE level per epic), reads with MEMBER+. Filter every queryset by `workspace`/active membership before serialize.
- Serializer: validate `property_type` against the enum; for `select`/`multi_select` require non-empty `settings.options`; on PATCH block `property_type` change when `IssuePropertyValue` rows exist for that property.
- Issue serializer extension: accept optional `property_values` dict; resolve the issue's `type`; reject keys whose `property.issue_type_id != issue.type_id` (`property_not_for_type`); enforce `is_required`; upsert `IssuePropertyValue`; sanitize `text`/`url` values via `strip_tags` (`html_processor.py:28`). Route activity through the existing `IssueActivity` mechanism the issue view already uses.
- URL registration mirrors the existing `issue.py` route style (`workspaces/<slug>/issue-types/<type_id>/properties/`).

**Acceptance criteria**
- Given ADMIN, When POSTing a valid select property, Then `201` + persisted + activity logged.
- Given MEMBER/GUEST, When POSTing a definition, Then `403`.
- Given a MEMBER PATCH with valid `property_values`, Then upsert + return + log; When omitting a required property on create, Then `400` naming it.
- Given `property_values` referencing a different type's property, Then `400` `property_not_for_type` (no cross-type leakage).
- (edge) Given a property with existing values, When changing its `property_type`, Then `409` `destructive_type_change_blocked`; without values, Then `200`.
- (edge) Given an empty type, When GET properties, Then `200` `[]`.

**Verify**
- `docker compose -f docker-compose-test.yml run --rm --build api-tests pytest plane/tests/contract/app/test_issue_property_api.py -m contract -v` (RED then GREEN)
- Full: `docker compose -f docker-compose-test.yml run --rm api-tests pytest -m "unit or contract"`

**Done when** All named contract tests RED→GREEN, suite green, authorization matrix (ADMIN/MEMBER/GUEST/non-member) and cross-type + destructive-change edges covered, value path routed through the existing serializer (no parallel write path).

---

## CP-3-FE — Dynamic type-scoped property fields in issue modal (replace CE stub)

**Implements** EPIC-CP / WIT-CUSTOMPROPS (story CP-3)
**Depends on** [CP-2-API]
**Risk tier** R1 (flag-gated UI; no schema)
**Worktree isolation** y

**Context** `apps/web/core/components/issues/issue-modal/form.tsx:50` renders `WorkItemModalAdditionalProperties` from `@/plane-web/...`, which aliases to the CE stub `apps/web/ce/components/issues/issue-modal/modal-additional-properties.tsx` returning `null`. This card replaces that stub with a real implementation that loads the selected `IssueType`'s properties and renders one input per `property_type`, gated on `work_item_types`. Submit packs values under `property_values` (consumed by CP-2-API).

**Files**
- Edit: `apps/web/ce/components/issues/issue-modal/modal-additional-properties.tsx` (replace stub)
- New: `packages/shared-state/src/store/issue/issue-property.store.ts` (`IssuePropertyStore`; grep `packages/shared-state/src/store` for the MobX store base + root-store registration convention)
- New: `packages/services/src/issue-property/property.service.ts` (extends `APIService` like `ai.service.ts:33`; + barrel export)
- New test: `apps/web/ce/components/issues/issue-modal/modal-additional-properties.test.tsx` (Vitest, alongside `apps/web/ce/lib/self-host-entitlements.test.ts` convention)

**TDD — failing test first**
Vitest in `modal-additional-properties.test.tsx`:
- `renders dynamic property fields for selected issue type` — given a store stub returning a select + text property for the selected type, assert one input rendered per property.
- `removes previous type fields and renders new on type switch` — re-render with a different selected type id; assert old fields gone, new present.
- `renders nothing when selected type has no properties` — no section, no empty-state error.
- `hides property section when work_item_types flag is off` — mock `isSelfHostedFeatureEnabled("work_item_types") === false`; assert component renders null (flag-gated, not merely disabled).

**Implementation outline**
- `IssuePropertyStore`: keyed by `issueTypeId`; `fetchPropertiesForType(workspaceSlug, typeId)` via `property.service.ts`; exposes `loading`/`error`; holds per-issue value map. Register in the MobX root store following the sibling store pattern.
- Component: read `work_item_types` via `isSelfHostedFeatureEnabled` from `apps/web/ce/lib/self-host-entitlements.ts` (return null if off); read the form's selected `issue_type`; render an input per `property_type` (text/number/date/select/multi_select/boolean/member/url) using `@plane/ui` primitives; surface `aria-required` for required props; pack chosen values into the form's `property_values`.
- Reuse the existing form submit pipeline in `form.tsx`; do not fork it.

**Acceptance criteria**
- Given the flag on and a type with properties, When the modal renders, Then one field per property type appears.
- Given a type switch, When the new type is selected, Then prior fields are removed and new fields appear.
- Given a type with no properties, Then no section and no error.
- Given the flag off, Then the section renders null.

**Verify**
- `pnpm --filter web vitest run apps/web/ce/components/issues/issue-modal/modal-additional-properties.test.tsx` (RED then GREEN)
- Types: `pnpm --filter web check:types` (or repo-root `pnpm check` if that is the documented gate — grep `BUILD.md`/`package.json` scripts)

**Done when** Stub replaced, all Vitest cases RED→GREEN, type-check passes, store + service registered, flag-gating verified.

---

## TPL-1-BE — WorkItemTemplate model & migration

**Implements** EPIC-TPL / WIT-TEMPLATES (data layer)
**Depends on** [CP-1-BE] (template_data carries property values)
**Risk tier** R1 (additive schema)
**Worktree isolation** y

**Context** PRD §17: the frontend already threads `templateId` through `apps/web/core/components/issues/issue-modal/modal.tsx`, but no model/API/persistence exists. This card adds `WorkItemTemplate(ProjectBaseModel)` with a `template_data` JSON payload and an optional `issue_type` FK.

**Files**
- New: `apps/api/plane/db/models/work_item_template.py`
- Edit: `apps/api/plane/db/models/__init__.py`
- New migration: `apps/api/plane/db/migrations/0xxx_work_item_templates.py`
- New test: `apps/api/plane/tests/unit/db/test_work_item_template_model.py`
- Edit: `apps/api/plane/tests/factories.py` (`WorkItemTemplateFactory`)

**TDD — failing test first**
`test_work_item_template_model.py`, `@pytest.mark.unit`:
- `test_template_persists_project_scoped` — create with `name`, `description_html`, `template_data={...}`, `issue_type`; assert persisted, `project`/`workspace` inherited from `ProjectBaseModel`.
- `test_template_data_json_roundtrips` — nested payload (priority, labels, sub_items, property_values) round-trips.
- `test_template_issue_type_nullable` — `issue_type=None` persists (null = applies to all types).
- `test_is_active_defaults_true`.

**Implementation outline**
- `WorkItemTemplate(ProjectBaseModel)`: `name = models.CharField(max_length=255)`, `description_html = models.TextField(default="<p></p>")`, `template_data = models.JSONField(default=dict)`, `issue_type = models.ForeignKey("db.IssueType", null=True, blank=True, on_delete=models.SET_NULL, related_name="templates")`, `is_active = models.BooleanField(default=True)`. Add `models.Index(fields=["project","issue_type"])`.
- Register export; `makemigrations db`; confirm additive.

**Acceptance criteria**
- Given a project, When a template is created with `template_data` and an `issue_type`, Then it persists project-scoped and is filterable by `(project, issue_type)`.
- Given `issue_type=None`, Then it persists.

**Verify**
- `docker compose -f docker-compose-test.yml run --rm --build api-tests pytest plane/tests/unit/db/test_work_item_template_model.py -m unit -v` (RED→GREEN)
- Migration forward+reverse; full unit suite green.

**Done when** Model + migration + factory exist, tests RED→GREEN, migration round-trips, exports registered.

---

## TPL-2-API — Template CRUD + create-from-template hydration (skip-and-warn)

**Implements** EPIC-TPL / WIT-TEMPLATES (story TPL-1, TPL-2, TPL-3) + external read
**Depends on** [TPL-1-BE, CP-2-API]
**Risk tier** R1 (new flag-gated routes; create path degrades to plain create on rollback)
**Worktree isolation** y

**Context** MEMBER+ CRUD for templates; server-side hydration on `POST /.../issues/?template_id=<id>` reusing the **existing** issue create (PRD line 94). Missing referenced labels/states/members must skip-and-warn, never hard-fail (PRD line 138). An external read-only `/api/v1/` route is added for parity. Sanitize `description_html` and text property values in `template_data` via `strip_tags`.

**Files**
- New: `apps/api/plane/app/views/issue/template.py` (or extend issue views — match the module convention)
- New: `apps/api/plane/app/serializers/work_item_template.py` (+ register)
- Edit: `apps/api/plane/app/urls/issue.py` (web routes)
- Edit: `apps/api/plane/app/urls/api.py` (external read-only route)
- Edit: existing issue create view to honor `?template_id=` and hydrate from `template_data`
- New test: `apps/api/plane/tests/contract/app/test_work_item_template_api.py`

**TDD — failing test first**
`@pytest.mark.contract`:
- `test_member_creates_template_sanitizes_html_and_persists` — MEMBER POSTs a template with `<script>` in `description_html`; assert `201`, persisted, script stripped (via `strip_tags`).
- `test_blank_template_name_rejected_400`.
- `test_viewer_cannot_create_template_403` (and `test_guest_cannot_create_template_403`).
- `test_templates_filter_by_issue_type` — GET `?issue_type=<id>` returns only that type's templates.
- `test_empty_templates_list_returns_200_empty`.
- `test_create_issue_from_template_hydrates_fields` — POST `/.../issues/?template_id=<id>`; assert new issue hydrated (priority, labels, sub-items, property_values).
- `test_create_from_template_skips_missing_refs_and_warns` — template references a label/state/member absent in the target project; assert issue created, missing refs skipped, non-blocking warning in response (no hard-fail).
- `test_template_id_other_project_rejected` — `template_id` from another project → `404`/`400`, no cross-project leakage.
- `test_deactivated_template_excluded_from_active_lists` — PATCH `is_active:false`; assert hidden from the create-picker query, present in the manager list.
- `test_delete_template_soft_deletes`.

**Implementation outline**
- CRUD view `@allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="PROJECT")`; queryset filtered by project + active membership.
- Hydration: in the existing issue create path, if `template_id` present, load the project-scoped template, map `template_data` onto the create payload (reuse the existing create logic; do not duplicate). Resolve label/state/member references against the target project; collect missing ones into a `warnings` array; never raise on missing refs. Reuse CP-2-API `property_values` validation for template-carried values.
- External read route in `api.py` filtered by API-key workspace scope; read-only.
- Sanitize HTML/text via `strip_tags`.

**Acceptance criteria**
- Given a MEMBER, When POSTing a template, Then `201`, HTML sanitized, persisted; When a VIEWER/GUEST, Then `403`.
- Given `?template_id=<id>`, When creating, Then the issue is hydrated server-side.
- Given a template with missing refs, When hydrated, Then create succeeds with skip-and-warn (never hard-fail).
- Given a `template_id` from another project, Then `404`/`400` with no leakage.
- (rollback) Given the `templateId` create path with the feature flag off, When a create runs, Then it degrades to a plain create (no error).

**Verify**
- `docker compose -f docker-compose-test.yml run --rm --build api-tests pytest plane/tests/contract/app/test_work_item_template_api.py -m contract -v` (RED→GREEN)
- Full: `docker compose -f docker-compose-test.yml run --rm api-tests pytest -m "unit or contract"`

**Done when** CRUD + hydration + external read live, all named tests RED→GREEN, skip-and-warn proven, authz matrix covered, suite green.

---

## TPL-3-FE — Template picker + project-settings template manager (replace CE stub)

**Implements** EPIC-TPL / WIT-TEMPLATES (story TPL-2, TPL-3 UI)
**Depends on** [TPL-2-API]
**Risk tier** R1 (flag-gated UI)
**Worktree isolation** y

**Context** `form.tsx:49` renders `WorkItemTemplateSelect` from the CE stub `apps/web/ce/components/issues/issue-modal/template-select.tsx` (returns `<></>`). This card implements the picker + a project-settings manager, gated on `templates`. Zero templates → first-party self-host empty state ("Self-hosted — no templates yet, create one"), never an upgrade prompt.

**Files**
- Edit: `apps/web/ce/components/issues/issue-modal/template-select.tsx` (replace stub)
- New: project-settings template manager under `apps/web/core/components/settings/templates/` (grep existing settings managers for the layout/route convention)
- Edit: `apps/web/app/routes/core.ts` — add `":workspaceSlug/settings/projects/:projectId/templates"` next to the features routes (grep `core.ts` for the existing features block lines)
- New: `packages/shared-state/src/store/.../work-item-template.store.ts` (`WorkItemTemplateStore`)
- New: `packages/services/src/.../template.service.ts`
- New test: `apps/web/ce/components/issues/issue-modal/template-select.test.tsx` (Vitest)

**TDD — failing test first**
Vitest:
- `shows self-host empty state when no templates exist` — store returns `[]`; assert the first-party empty-state copy renders and no upgrade-modal element is present.
- `renders template options when templates returned`.
- `hides picker when templates flag is off`.
- (manager) `deactivated template hidden from create picker` — store has an `is_active:false` template; assert it is absent from the picker option list but present in the manager list.

**Implementation outline**
- `WorkItemTemplateStore` keyed by `projectId`; `fetchTemplates`/`createTemplate`/`updateTemplate`/`deleteTemplate` via `template.service.ts`.
- Picker reads `templates` flag via `isSelfHostedFeatureEnabled`; lists active templates filtered by selected type; on select, sets the form's `templateId` (the existing `modal.tsx` thread).
- Manager: list/edit/deactivate/delete; reuse `@plane/ui`; empty state is first-party self-host copy.

**Acceptance criteria**
- Given zero templates, When the picker/manager renders, Then a first-party self-host empty state shows (never an upgrade modal).
- Given an `is_active:false` template, Then it is excluded from the picker, present in the manager.
- Given the flag off, Then the picker is hidden.

**Verify**
- `pnpm --filter web vitest run apps/web/ce/components/issues/issue-modal/template-select.test.tsx` (RED→GREEN)
- `pnpm --filter web check:types`

**Done when** Stub replaced, manager + route added, all Vitest cases RED→GREEN, type-check passes, empty state is self-host (no upgrade modal).

---

## REC-1-BE — RecurringWorkItem + RecurringWorkItemRun models & migration

**Implements** EPIC-REC / WIT-RECURRING (data layer + next-run computation)
**Depends on** [TPL-1-BE] (template FK; payload fallback)
**Risk tier** R1 (additive schema)
**Worktree isolation** y

**Context** No recurrence model exists. This card adds `RecurringWorkItem(ProjectBaseModel)` (frequency/rrule/timezone/end-conditions/`next_run_at`/`owned_by`) and `RecurringWorkItemRun(ProjectBaseModel)` with a unique `(recurring_work_item, run_at)` for idempotent generation (PRD line 73). It also implements the **pure** next-run computation function (timezone + end conditions) so REC-2 can call it — unit-tested in isolation, no Celery.

**Files**
- New: `apps/api/plane/db/models/recurring_work_item.py`
- Edit: `apps/api/plane/db/models/__init__.py`
- New: `apps/api/plane/utils/recurrence.py` (pure `compute_next_run_at(...)` + RRULE validation)
- New migration: `apps/api/plane/db/migrations/0xxx_recurring_work_items.py`
- New tests: `apps/api/plane/tests/unit/db/test_recurring_work_item_model.py`, `apps/api/plane/tests/unit/utils/test_recurrence.py`
- Edit: `apps/api/plane/tests/factories.py` (`RecurringWorkItemFactory`)

**TDD — failing test first**
`@pytest.mark.unit`:
- `test_recurring_work_item_persists` — fields persist, `owned_by` set, `project`/`workspace` inherited.
- `test_run_unique_per_recurring_and_run_at` — duplicate `(recurring, run_at)` → `IntegrityError`.
- `test_next_run_at_computed_from_start_in_timezone` (in `test_recurrence.py`) — weekly cadence, given `start_date` + `timezone`, assert the computed `next_run_at` lands in the correct tz-aware instant.
- `test_invalid_rrule_rejected` — `validate_rrule("not-an-rrule")` raises a validation error.
- `test_next_run_respects_end_date` — past `end_date` → returns `None` (no further run).
- `test_next_run_respects_max_iterations` — at `max_iterations` → returns `None`.

**Implementation outline**
- `RecurringWorkItem(ProjectBaseModel)`: `name`, `template = FK(WorkItemTemplate, null, SET_NULL)`, `payload = JSONField(default=dict)`, `frequency` (TextChoices daily/weekly/monthly/custom), `rrule = CharField(null=True, blank=True)`, `timezone = CharField`, `start_date = DateTimeField`, `end_date = DateTimeField(null=True, blank=True)`, `max_iterations = IntegerField(null=True, blank=True)`, `next_run_at = DateTimeField`, `owned_by = FK(user)`, `is_active = BooleanField(default=True)`.
- `RecurringWorkItemRun(ProjectBaseModel)`: `recurring_work_item = FK(...)`, `generated_issue = FK("db.Issue", null=True, on_delete=models.SET_NULL)`, `run_at = DateTimeField`. Unique `(recurring_work_item, run_at)`.
- `recurrence.py`: use the `python-dateutil` `rrule`/`rrulestr` (confirm it is already a dependency — grep `apps/api/requirements*` / `pyproject.toml`; if absent, NOTE and stop rather than adding a dep). `compute_next_run_at(frequency, rrule, timezone, start_date, last_run_at, end_date, max_iterations, iterations_done)` returns next aware datetime or `None`. Validate timezone against the same source the fork uses (grep `apps/api/plane/app/urls/timezone.py` and its view for the canonical tz list).

**Acceptance criteria**
- Given a recurrence, When persisted, Then fields + scoping correct; duplicate `(recurring, run_at)` → `IntegrityError`.
- Given a weekly cadence with tz, When computing next run, Then it lands at the correct tz-aware instant.
- Given an invalid RRULE, Then validation raises; Given past end_date/max_iterations, Then next-run returns `None`.

**Verify**
- `docker compose -f docker-compose-test.yml run --rm --build api-tests pytest plane/tests/unit/db/test_recurring_work_item_model.py plane/tests/unit/utils/test_recurrence.py -m unit -v` (RED→GREEN)
- Migration forward+reverse; full unit suite green.

**Done when** Models + pure recurrence util + migration + factory exist, all named unit tests RED→GREEN, migration round-trips, dependency for RRULE confirmed (or noted as blocker).

---

## REC-2-WORKER — Generation @shared_task on beat (idempotent, no-storm)

**Implements** EPIC-REC / WIT-RECURRING (story REC-2)
**Depends on** [REC-1-BE, TPL-2-API]
**Risk tier** R1 (worker; rollback rule: disable beat schedule + flag **before** reverting worker code)
**Worktree isolation** y

**Context** Generation follows the `@shared_task archive_and_close_old_issues` precedent in `apps/api/plane/bgtasks/issue_automation_task.py:22-23`, registered on `django_celery_beat`. Idempotency is enforced by the `RecurringWorkItemRun` unique `(recurring_work_item, run_at)` constraint from REC-1. After downtime, backfill at most one instance (PRD line 139). Generated issues reuse the issue create path + TPL-2 hydration when `template` is set, else the inline `payload`.

**Files**
- Edit: `apps/api/plane/bgtasks/issue_automation_task.py` (add `generate_recurring_work_items` `@shared_task`)
- Edit: `apps/api/plane/settings/common.py` (`CELERY_IMPORTS` already includes the module; add the beat schedule entry — grep `CELERYBEAT_SCHEDULE`/`beat_schedule` for the existing pattern)
- New test: `apps/api/plane/tests/unit/bgtasks/test_recurring_generation.py`

**TDD — failing test first**
`@pytest.mark.unit` (mock time; call the task function directly, no live broker):
- `test_due_recurrence_generates_one_issue_and_run` — `next_run_at` in the past; run task; assert one `Issue` created (hydrated), one `RecurringWorkItemRun`, `next_run_at` advanced.
- `test_downtime_backfills_at_most_one_instance` — `next_run_at` several windows in the past; run once; assert exactly one issue generated, missed windows skipped forward (no storm).
- `test_idempotent_no_duplicate_for_same_window` — a `RecurringWorkItemRun` already exists for `(recurring, run_at)`; run task; assert no duplicate issue (constraint-guarded).
- `test_recurrence_past_end_does_not_generate` — past `end_date`/`max_iterations`; assert no issue, schedule marked `is_active=False`.
- `test_generation_from_template_skips_missing_refs` — template with missing project refs; assert issue created with skip-and-warn semantics (reuse TPL-2 hydration).

**Implementation outline**
- Task: query active recurrences with `next_run_at <= now()`; for each, within an idempotent `get_or_create(RecurringWorkItemRun, recurring_work_item, run_at)` guard, create the next issue (template hydration via TPL-2 path, else `payload`), set `generated_issue`, advance `next_run_at` via `recurrence.compute_next_run_at`, deactivate when it returns `None`. Backfill only the single current due window (no loop over missed windows).
- Generation runs in `owned_by`'s authorized scope; issues are project-scoped.
- Beat schedule entry at a sane cadence (e.g., every 5 min) following the existing periodic-task registration.

**Acceptance criteria**
- Given a due recurrence, When the task runs, Then exactly one issue + one run row, `next_run_at` advanced.
- Given multi-window downtime, Then at most one backfill (no storm), enforced by the unique constraint.
- Given a duplicate window, Then no duplicate issue.
- Given past end/max, Then no generation and schedule deactivated.

**Verify**
- `docker compose -f docker-compose-test.yml run --rm --build api-tests pytest plane/tests/unit/bgtasks/test_recurring_generation.py -m unit -v` (RED→GREEN)
- Full unit suite green.

**Done when** Task + beat registration added, all named unit tests RED→GREEN, idempotency/no-storm/end-conditions proven, suite green. **Rollback note in PR:** disable beat schedule + `recurring_work_items` flag before reverting this worker code.

---

## REC-3-API-FE — Recurrence CRUD + runs history, modal section, badge

**Implements** EPIC-REC / WIT-RECURRING (story REC-1 API, REC-3 UI)
**Depends on** [REC-1-BE, REC-2-WORKER]
**Risk tier** R1 (flag-gated routes + UI)
**Worktree isolation** y

**Context** Adds MEMBER+ recurrence CRUD + read-only runs history, plus the modal recurrence section and a recurrence badge on cards. Gated on `recurring_work_items`. Validates RRULE and end-conditions before persist; rejects invalid timezone.

**Files**
- New: `apps/api/plane/app/views/issue/recurring.py`; serializer `apps/api/plane/app/serializers/recurring_work_item.py` (+ register)
- Edit: `apps/api/plane/app/urls/issue.py` (`recurring-work-items/`, `/<id>/`, `/<id>/runs/`)
- New: recurrence section component in `apps/web/core/components/issues/issue-modal/`; badge added to card renderers under `apps/web/core/components/issues/issue-layouts/properties/` (grep the shared card-properties renderer to add the badge once)
- New: `packages/shared-state/src/store/.../recurring-work-item.store.ts`; `packages/services/src/.../recurring.service.ts`
- New tests: `apps/api/plane/tests/contract/app/test_recurring_work_item_api.py`; Vitest `apps/web/core/components/issues/issue-layouts/properties/recurrence-badge.test.tsx`

**TDD — failing test first**
Contract `@pytest.mark.contract`:
- `test_member_creates_recurrence_owned_by_set_and_next_run_computed`.
- `test_invalid_rrule_rejected_400` and `test_missing_end_condition_rejected_400` (non-custom with neither `end_date` nor `max_iterations`).
- `test_guest_cannot_create_recurrence_403`.
- `test_empty_recurrence_list_returns_200_empty`.
- `test_runs_history_read_only` — GET `/<id>/runs/` returns `{run_at, generated_issue}` rows; non-GET → 405/403.
Vitest:
- `renders recurrence badge for recurring work item`.
- `hides recurrence section when flag off`.
- `renders empty self-host state for recurrence with zero runs`.

**Implementation outline**
- CRUD `@allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="PROJECT")`; set `owned_by=request.user`; compute `next_run_at` via `recurrence.compute_next_run_at`; validate RRULE + timezone + end-condition presence; runs endpoint read-only.
- FE: store keyed by `projectId`; modal section (toggle/frequency/timezone/end-or-iterations) gated on `recurring_work_items`; badge with `aria-label="Recurring"` (not color-only) added once in the shared card-properties renderer.

**Acceptance criteria**
- Given a MEMBER, When creating a valid recurrence, Then `owned_by` set + `next_run_at` computed; invalid RRULE/missing-end → `400`; GUEST → `403`.
- Given a recurring issue, When rendered on a card, Then a recurrence badge appears.
- Given the flag off, Then no recurrence section; zero runs → empty self-host state.

**Verify**
- `docker compose -f docker-compose-test.yml run --rm --build api-tests pytest plane/tests/contract/app/test_recurring_work_item_api.py -m contract -v` (RED→GREEN)
- `pnpm --filter web vitest run apps/web/core/components/issues/issue-layouts/properties/recurrence-badge.test.tsx`; `pnpm --filter web check:types`
- Full: `docker compose -f docker-compose-test.yml run --rm api-tests pytest -m "unit or contract"`

**Done when** CRUD + runs history + modal section + badge live, all named tests RED→GREEN, both suites green, flag-gating + empty state verified.

---

## DUP-1-API — Similar-items endpoint (read-only, same-project, open issues)

**Implements** EPIC-DUP / WIT-DUPLICATES (story DUP-1)
**Depends on** none (read-only; reuses existing `duplicate` `IssueRelation` for the link action in DUP-2)
**Risk tier** R1 (no migration; read-only endpoint on a critical-tenant-isolation path)
**Worktree isolation** y

**Context** PRD §Duplicate Detection (lines 106-107, 133): a read-only `GET /.../projects/<project_id>/issues/similar/?title=<q>` returns up to N open issues in the same project with a confidence score, strictly scoped to the requester's authorized project (no cross-project title leakage). No schema — deterministic similarity in v1 (embeddings are a future epic). Short/empty title → empty results.

**Files**
- Edit: `apps/api/plane/app/urls/issue.py` (register `issues/similar/`)
- New view (in the issue views module) + a pure scoring helper `apps/api/plane/utils/similarity.py`
- New tests: `apps/api/plane/tests/unit/utils/test_similarity.py`, `apps/api/plane/tests/contract/app/test_similar_issues_api.py`

**TDD — failing test first**
Unit `@pytest.mark.unit`:
- `test_similarity_scoring_ranks_open_issues_by_confidence` — given candidate titles, assert ordering by confidence desc and a `[0,1]`-ish score.
- `test_short_title_returns_empty_results` — title below threshold → `[]`.
Contract `@pytest.mark.contract`:
- `test_similar_returns_same_project_open_issues_with_confidence` — `200` `{results:[{id,name,confidence}]}`, capped at N, sorted desc.
- `test_closed_or_archived_excluded` — completed/cancelled/archived issues never returned.
- `test_cross_project_never_returned` — issue in another project absent (no leakage).
- `test_non_member_cannot_query_similar_403`.
- `test_empty_or_short_title_returns_empty_200`.

**Implementation outline**
- `similarity.py`: deterministic title similarity (e.g., normalized token/trigram overlap — keep it simple and pure; no external deps unless already present). Returns scored, sorted candidates; enforces a min-title-length threshold.
- View: read permission via `@allow_permission([...], level="PROJECT")`; queryset filtered by project + active membership + open states only (use `StateGroup` from `state.py:14` to exclude completed/cancelled; exclude archived). Cap at N. Never touch other projects.

**Acceptance criteria**
- Given open same-project issues, When querying with a substantive title, Then up to N results with confidence, sorted desc.
- Given closed/archived/other-project issues, Then excluded.
- Given a non-member, Then `403`; short/empty title → `200` `[]`.

**Verify**
- `docker compose -f docker-compose-test.yml run --rm --build api-tests pytest plane/tests/unit/utils/test_similarity.py plane/tests/contract/app/test_similar_issues_api.py -m "unit or contract" -v` (RED→GREEN)
- Full: `docker compose -f docker-compose-test.yml run --rm api-tests pytest -m "unit or contract"`

**Done when** Endpoint + pure scorer live, all named tests RED→GREEN, scope-isolation + open-only + short-title edges proven, suite green, no migration introduced.

---

## DUP-2-FE — Inline duplicate banner (debounced, dismiss/link via existing relation)

**Implements** EPIC-DUP / WIT-DUPLICATES (story DUP-2)
**Depends on** [DUP-1-API]
**Risk tier** R1 (UI; reuses existing `duplicate` relation)
**Worktree isolation** y

**Context** `form.tsx` already imports `DeDupeButtonRoot` (47), `DuplicateModalRoot` (48), and `useDebouncedDuplicateIssues` (51) from CE stubs (`apps/web/ce/components/de-dupe/*`) that render empty. This card implements a debounced "similar items" banner under the title field that lists matches with confidence %, is dismissible, and links a match via the **existing** `duplicate` `IssueRelation` UI (no new relation type). Empty results → no banner.

**Files**
- Edit: `apps/web/ce/components/de-dupe/de-dupe-button.tsx` and `apps/web/ce/components/de-dupe/duplicate-modal/*` (replace stubs)
- Edit/confirm: `apps/web/ce/hooks/use-debounced-duplicate-issues` (wire to DUP-1 endpoint via a service)
- New: similarity service method (extend or add under `packages/services`)
- New test: `apps/web/ce/components/de-dupe/de-dupe-button.test.tsx` (Vitest)

**TDD — failing test first**
Vitest:
- `shows similar-items banner with confidence when matches returned` — hook returns matches; assert banner lists them with confidence % and a "link as duplicate" action.
- `no banner when results empty` — empty → nothing renders.
- `dismiss hides banner for session` — after dismiss, re-querying does not re-show.
- `link as duplicate creates duplicate relation` — clicking the action invokes the existing duplicate-relation create (assert the existing relation handler is called with kind `duplicate`).
- `banner is aria-live polite region` (a11y).

**Implementation outline**
- Implement the debounced hook to call DUP-1 (`issues/similar/?title=`) with a min-length guard; render the banner as an `aria-live="polite"` region under the title input in the form's existing slot. Reuse the existing duplicate-relation UI for the link action — do not introduce a new relation kind. Track dismissal in component/edit-session state.

**Acceptance criteria**
- Given matches, When typing a title, Then a debounced banner with confidence % + link action.
- Given empty results, Then no banner.
- Given dismiss, Then it stays hidden for the session.
- Given the link action, Then a `duplicate` `IssueRelation` is created via the existing UI.

**Verify**
- `pnpm --filter web vitest run apps/web/ce/components/de-dupe/de-dupe-button.test.tsx` (RED→GREEN); `pnpm --filter web check:types`

**Done when** Stubs replaced, debounced banner wired to DUP-1, link reuses existing `duplicate` relation, all Vitest cases RED→GREEN, type-check passes.

---

## WF-1-BE — WorkflowTransition / ApprovalPolicy / ApprovalDecision models & migration

**Implements** EPIC-WF / WF-WORKFLOWS (data layer)
**Depends on** [CP-1-BE] (transitions are type-scoped, consistent with the type-scoping foundation)
**Risk tier** R1 (additive schema)
**Worktree isolation** y

**Context** No transition/approval model exists; state is currently any-to-any (PRD line 14). This card adds the three models. `WorkflowTransition` FKs to `db.State` (`state.py:14`) and `db.IssueType` (null). Unique `(project, issue_type, from_state, to_state)` when not deleted. `from_state=null` means "from any state".

**Files**
- New: `apps/api/plane/db/models/workflow.py`
- Edit: `apps/api/plane/db/models/__init__.py`
- New migration: `apps/api/plane/db/migrations/0xxx_workflows_approvals.py`
- New test: `apps/api/plane/tests/unit/db/test_workflow_model.py`
- Edit: `apps/api/plane/tests/factories.py` (`WorkflowTransitionFactory`, `ApprovalPolicyFactory`)

**TDD — failing test first**
`@pytest.mark.unit`:
- `test_transition_persists_with_unique_constraint` — duplicate `(project, issue_type, from_state, to_state)` not deleted → `IntegrityError`.
- `test_from_state_null_means_any` — `from_state=None` persists.
- `test_approval_policy_m2m_approvers`.
- `test_approval_decision_defaults_pending`.

**Implementation outline**
- `WorkflowTransition(ProjectBaseModel)`: `issue_type = FK("db.IssueType", null=True, on_delete=models.CASCADE)`, `from_state = FK("db.State", null=True, related_name="+")`, `to_state = FK("db.State", related_name="+")`, `requires_approval = BooleanField(default=False)`. Partial unique `(project, issue_type, from_state, to_state)` when not deleted.
- `ApprovalPolicy(ProjectBaseModel)`: `transition = FK(WorkflowTransition)`, `approvers = ManyToManyField(user)`.
- `ApprovalDecision(ProjectBaseModel)`: `issue = FK("db.Issue")`, `transition = FK(WorkflowTransition)`, `actor = FK(user, null)`, `decision` (TextChoices approved/rejected/pending, default pending), `note = TextField(blank)`, `decided_at = DateTimeField(null=True)`.

**Acceptance criteria**
- Given a transition, When persisted, Then unique constraint enforced; `from_state=null` allowed.
- Given a policy, Then approvers M2M works; decision defaults pending.

**Verify**
- `docker compose -f docker-compose-test.yml run --rm --build api-tests pytest plane/tests/unit/db/test_workflow_model.py -m unit -v` (RED→GREEN)
- Migration forward+reverse; full unit suite green.

**Done when** Three models + migration + factories exist, tests RED→GREEN, migration round-trips, exports registered.

---

## WF-2-API — Transition enforcement on issue PATCH (R0 gate) + bulk partial-success

**Implements** EPIC-WF / WF-WORKFLOWS (story WF-1 def API, WF-2 enforcement)
**Depends on** [WF-1-BE]
**Risk tier** R1 overall — **enforcement path is an R0 gate** (changes the critical issue write path). Per house rule, no merge without failing-then-green contract tests proving it cannot lock users out and defaults to unrestricted when no workflow exists.
**Worktree isolation** y

**Context** Adds ADMIN-only transition-definition CRUD and injects enforcement into the **existing** issue PATCH view (`apps/api/plane/app/views/issue/`). A state change not in the allow-list → `409 {"error":"transition_not_allowed"}`; empty/absent workflow = unrestricted (backward compatible — PRD line 52). Bulk state change validates each item independently with partial success + per-item errors (PRD line 141). Allowed transitions log to the existing `IssueActivity` trail.

**Files**
- New: workflow-transition CRUD view + serializer (`apps/api/plane/app/views/issue/workflow.py`, `app/serializers/workflow.py`, register)
- Edit: `apps/api/plane/app/urls/issue.py` (`workflow-transitions/`)
- Edit: the existing issue PATCH view + the existing bulk state-change view (grep `apps/api/plane/app/views/issue/` for both)
- New: pure resolver `apps/api/plane/utils/workflow.py` (`is_transition_allowed(project, issue_type, from_state, to_state) -> bool`)
- New tests: `apps/api/plane/tests/unit/utils/test_workflow_resolution.py`, `apps/api/plane/tests/contract/app/test_workflow_enforcement_api.py`

**TDD — failing test first**
Unit `@pytest.mark.unit`:
- `test_no_workflow_allows_any_transition` — zero rows → allowed (proves no lockout).
- `test_from_any_null_matches_all_sources`.
- `test_disallowed_resolves_false`.
Contract `@pytest.mark.contract`:
- `test_admin_creates_workflow_transition_persists`; `test_duplicate_transition_409`; `test_member_cannot_define_transition_403`; `test_empty_transitions_list_200`.
- `test_disallowed_transition_rejected_409` — PATCH to a non-allowed `to_state` → `409 {"error":"transition_not_allowed"}`, state unchanged.
- `test_allowed_transition_succeeds_and_logs` — `200`, state updated, `IssueActivity` logged.
- `test_no_workflow_allows_any_transition_via_api` — backward-compat path.
- `test_bulk_state_change_partial_success_per_item_errors` — mixed bulk; allowed items update, disallowed reported per-item.

**Implementation outline**
- `workflow.py` resolver: load non-deleted transitions for `(project, issue_type)`; match `from_state in (requested_from, NULL)` and `to_state == requested_to`; **return True when no rows exist** (unrestricted default — the lockout guard).
- Inject the resolver into the existing PATCH path before applying a state change; on fail return `409`. Do not alter non-state PATCH behavior.
- Bulk path: validate each item via the resolver; build a per-item error map; apply allowed changes; return partial-success payload.
- Definition CRUD `@allow_permission([ROLE.ADMIN], level="PROJECT")`.

**Acceptance criteria**
- Given defined transitions, When PATCHing to a non-allowed state, Then `409 transition_not_allowed`, state unchanged; When allowed, Then `200` + activity logged.
- Given **no** workflow rows, When changing state, Then it succeeds (unrestricted — cannot lock out).
- Given a mixed bulk change, Then partial success with per-item errors.
- Given MEMBER, When defining a transition, Then `403`.

**Verify**
- `docker compose -f docker-compose-test.yml run --rm --build api-tests pytest plane/tests/unit/utils/test_workflow_resolution.py plane/tests/contract/app/test_workflow_enforcement_api.py -m "unit or contract" -v` (RED→GREEN — show the enforcement + no-lockout tests failing first)
- Full: `docker compose -f docker-compose-test.yml run --rm api-tests pytest -m "unit or contract"`

**Done when** Enforcement + bulk + definition CRUD live, all named tests RED→GREEN (no-lockout + disallowed + bulk shown failing-then-green), suite green, default-unrestricted proven, activity logged.

---

## WF-3-API — Approval-gated transitions + approver decision route

**Implements** EPIC-WF / WF-WORKFLOWS (story WF-3)
**Depends on** [WF-2-API]
**Risk tier** R1 — approval gate sits on the same critical write path (R0-adjacent)
**Worktree isolation** y

**Context** A transition with `requires_approval` does not change state immediately: PATCH returns `202`, state stays pending, and a pending `ApprovalDecision` is created (PRD line 104). Only members in the policy's approver set may decide via `POST /.../issues/<issue_id>/approvals/<decision_id>/` (PRD line 105). Orphaned pending decisions (approver removed) stay pending and are ADMIN-reassignable — never silently approved (PRD line 142).

**Files**
- Edit: the issue PATCH view (branch into pending-approval when `requires_approval`)
- New: approval-decision view + URL in `apps/api/plane/app/urls/issue.py` (`issues/<id>/approvals/<decision_id>/`)
- New test: `apps/api/plane/tests/contract/app/test_approvals_api.py`

**TDD — failing test first**
`@pytest.mark.contract`:
- `test_approval_required_transition_returns_202_creates_pending` — `202`, state unchanged, pending `ApprovalDecision` created.
- `test_approver_approves_completes_transition_and_audits` — approver POSTs approve → transition completes, state updates, decision audited (`actor`, `decided_at`).
- `test_non_approver_cannot_decide_403` — decision stays pending.
- `test_orphaned_pending_decision_not_auto_approved` — approver removed; decision stays pending; ADMIN can reassign approvers.

**Implementation outline**
- In the PATCH path, after WF-2 allow-check, if the matched transition `requires_approval`, create a pending `ApprovalDecision` (linked to the issue + transition), return `202`, leave state unchanged.
- Decision view: verify `request.user` ∈ policy approver set server-side before recording; on approve, complete the transition (reuse the WF-2 allowed-transition apply path) and audit via `IssueActivity`; on reject, record and leave state. ADMIN reassignment of approvers handled through the WF-1 policy CRUD.

**Acceptance criteria**
- Given a `requires_approval` transition, When a member triggers it, Then `202` + pending decision, state unchanged.
- Given a pending decision, When a listed approver approves, Then transition completes + audited; When a non-approver decides, Then `403` and it stays pending.
- Given the approver removed, Then the decision stays pending (never auto-approved) and is ADMIN-reassignable.

**Verify**
- `docker compose -f docker-compose-test.yml run --rm --build api-tests pytest plane/tests/contract/app/test_approvals_api.py -m contract -v` (RED→GREEN)
- Full: `docker compose -f docker-compose-test.yml run --rm api-tests pytest -m "unit or contract"`

**Done when** Pending-approval branch + approver-only decision route live, all named tests RED→GREEN, never-auto-approve + non-approver-403 proven, suite green, decisions audited.

---

## WF-4-FE — Workflow editor, filtered state dropdown, approval banner

**Implements** EPIC-WF / WF-WORKFLOWS (story WF-1 UI, WF-4)
**Depends on** [WF-2-API, WF-3-API]
**Risk tier** R1 (flag-gated UI)
**Worktree isolation** y

**Context** Gated on `workflows_approvals`. The state dropdown in `issue-detail` filters to allowed `to_state`s; a pending transition shows an approval banner (approve/reject for approvers). A project-settings workflow editor defines transitions. No workflow defined → dropdown unrestricted (safe default). Flag off → no filtering, no banner.

**Files**
- New: workflow editor under `apps/web/core/components/settings/workflows/`
- Edit: `apps/web/app/routes/core.ts` — add `":workspaceSlug/settings/projects/:projectId/features/workflows"` (sibling to the existing features routes; grep `core.ts` for the features block)
- Edit: state-dropdown option filtering in `apps/web/core/components/dropdowns/state` (grep for the actual file)
- New: approval banner in `apps/web/core/components/issues/issue-detail`
- New: `WorkflowStore` (`packages/shared-state`), `workflow.service.ts` (`packages/services`)
- New tests: Vitest `state-dropdown.test.tsx`, `approval-banner.test.tsx`

**TDD — failing test first**
Vitest:
- `state dropdown filters to allowed to_states` — given a workflow, only allowed targets selectable.
- `no workflow allows all states` — empty workflow → all states selectable.
- `dropdown unaffected when workflows_approvals flag off`.
- `approval banner shows approve/reject for approver` and `hidden for non-approver`.

**Implementation outline**
- `WorkflowStore` keyed by `projectId`; loads transitions + pending decisions.
- State dropdown reads `workflows_approvals`; when on and a workflow exists, filter options to allowed `to_state`s (omit disallowed entirely — a11y: don't just dim); when no workflow or flag off, show all.
- Approval banner (`aria-live="assertive"`) renders when a pending decision exists; approve/reject buttons gated to approver membership.
- Editor: define `(issue_type, from_state, to_state, requires_approval)` rows; ADMIN-only surface.

**Acceptance criteria**
- Given a workflow, When opening the dropdown, Then only allowed `to_state`s; no workflow → all states.
- Given a pending transition, Then an approval banner with approve/reject (approvers only).
- Given the flag off, Then no filtering or banner.

**Verify**
- `pnpm --filter web vitest run apps/web/core/components/dropdowns/state/state-dropdown.test.tsx apps/web/core/components/issues/issue-detail/approval-banner.test.tsx` (RED→GREEN); `pnpm --filter web check:types`

**Done when** Editor + route + filtered dropdown + banner live, all Vitest cases RED→GREEN, type-check passes, unrestricted-default + flag-off behavior verified.

---

## AI-1-API — Copilot `create_work_item` + `describe` + `summarize_issue` modes (fail-closed)

**Implements** EPIC-AI / AI-WORKITEMS (story AI-1, AI-2, AI-3)
**Depends on** [CP-2-API] (structured create returns `property_values` validated against the type)
**Risk tier** R1 overall — **AI-write is an R0 gate**. No merge without failing-then-green tests for provider-unconfigured → `400` and GUEST-blocked.
**Worktree isolation** y

**Context** Extends the **existing** copilot pipeline (no new conversation table — reuse `CopilotMessage`, PRD line 82). Adds modes to `COPILOT_MODES` (`copilot.py:37`) and the write modes to `WRITE_MODES` (`copilot.py:52`); reuses `_execute_copilot_actions` (708) and `ISSUE_ACTION_FIELDS` (40) for structured create. Provider gating reuses `get_llm_config`/`is_llm_configured`/`is_vertex_provider` (34) — fail closed `400 {"error":"LLM provider not configured"}` (existing pattern at 89-90). GUEST blocked via the existing guard at 83. All AI-returned HTML sanitized via `strip_tags`. Drafts/summaries are returned for review — not auto-saved.

**Files**
- Edit: `apps/api/plane/app/views/copilot.py` (add modes to `COPILOT_MODES` and `WRITE_MODES`; add handlers for `create_work_item`, `describe` with `action` draft/simplify/rewrite, `summarize_issue`)
- Edit: `apps/api/plane/app/urls/external.py` (copilot family already routed at `workspaces/<slug>/copilot/messages/`; confirm no new route needed, only mode handling)
- New test: `apps/api/plane/tests/contract/app/test_copilot_workitem_modes.py`

**TDD — failing test first**
`@pytest.mark.contract` (mock the LLM provider; never call a real one):
- `test_create_work_item_mode_returns_structured_draft` — provider mocked configured; POST `{mode:"create_work_item", prompt}`; assert response returns `{title, description_html, priority, assignee, type, property_values}` for review, NOT persisted.
- `test_describe_mode_returns_text_for_each_action` — `action` ∈ {draft, simplify, rewrite} → sanitized text returned, not auto-saved.
- `test_invalid_describe_action_rejected_400`.
- `test_summarize_issue_returns_scoped_digest` — issue with activity/comments/links → read-only digest within authorized scope; cross-project linked item excluded.
- `test_summarize_empty_issue_graceful` — no activity → graceful empty digest, no error.
- `test_ai_modes_fail_closed_when_provider_unconfigured_400` — `is_llm_configured` mocked false → `400 {"error":"LLM provider not configured"}` for every new mode.
- `test_guest_blocked_from_ai_write_mode_403` — GUEST + write mode → `403` (reuse `WRITE_MODES` guard).
- `test_ai_returned_html_sanitized` — provider returns `<script>` in `description_html` → stripped before reaching client.

**Implementation outline**
- Add `"create_work_item","describe","summarize_issue"` to `COPILOT_MODES`; add the write-capable ones to `WRITE_MODES` (so the GUEST guard at line 83 and provider check at 89-90 apply automatically).
- `create_work_item`: prompt the configured provider for a structured payload; map onto `ISSUE_ACTION_FIELDS`; resolve/validate `property_values` against the chosen type via the CP-2-API path; return draft for review (no save).
- `describe`: branch on `action`; reject invalid actions `400`; return sanitized text.
- `summarize_issue`: gather recent activity + comments + linked items **within the requester's authorized scope** (exclude cross-project linked items); return read-only digest; optional post-as-comment is a follow-up (AI-3 FE).
- Sanitize all returned HTML via `strip_tags` (`html_processor.py:28`). Never log raw prompts/provider keys.

**Acceptance criteria**
- Given a configured provider, When POSTing `create_work_item`, Then a structured draft is returned for review (not saved).
- Given `describe` with a valid action, Then sanitized text for accept/regenerate; invalid action → `400`.
- Given an issue, When `summarize_issue`, Then a scoped read-only digest (cross-project items excluded); empty issue → graceful digest.
- Given no provider, When any AI mode is POSTed, Then `400 {"error":"LLM provider not configured"}`.
- Given a GUEST, When a write mode is POSTed, Then `403`.

**Verify**
- `docker compose -f docker-compose-test.yml run --rm --build api-tests pytest plane/tests/contract/app/test_copilot_workitem_modes.py -m contract -v` (RED→GREEN — show fail-closed + GUEST-block failing first)
- Full: `docker compose -f docker-compose-test.yml run --rm api-tests pytest -m "unit or contract"`

**Done when** Three modes added to the existing pipeline, all named tests RED→GREEN (fail-closed + GUEST-block + sanitization shown), suite green, no new conversation table, no Plane Cloud calls.

---

## AI-2-BE — AgentRun model + queued record (no autonomous execution)

**Implements** EPIC-AI / AI-WORKITEMS (story AI-4 data + status transitions)
**Depends on** [AI-1-API]
**Risk tier** R1 — **agent execution is an R0 gate**; v1 ships only an auditable record + queued stub, no autonomous action.
**Worktree isolation** y

**Context** PRD line 83 and Non-Goal line 44: no self-directing agent in v1 — only an auditable `AgentRun(ProjectBaseModel)` whose status transitions (queued/running/succeeded/failed/cancelled) are recorded and surfaced in `IssueActivity`. No autonomous mutation of work items. One additive migration (only the `AgentRun` table; the AI modes need no schema).

**Files**
- New: `apps/api/plane/db/models/agent_run.py`
- Edit: `apps/api/plane/db/models/__init__.py`
- New migration: `apps/api/plane/db/migrations/0xxx_agent_run.py`
- New: agent-run view + URL (request a run; cancel; read status) in the copilot/issue URL family
- New tests: `apps/api/plane/tests/unit/db/test_agent_run_model.py`, `apps/api/plane/tests/contract/app/test_agent_run_api.py`

**TDD — failing test first**
Unit `@pytest.mark.unit`:
- `test_agent_run_defaults_queued` — created with `status="queued"`, `requested_by` set, project-scoped.
- `test_agent_run_status_transitions_recorded` — queued→running→succeeded/failed/cancelled persists each transition.
Contract `@pytest.mark.contract`:
- `test_agent_run_created_queued_and_logged_no_autonomous_action` — member+ requests a run → `AgentRun` queued, surfaced in `IssueActivity`, NO issue mutation performed.
- `test_guest_or_viewer_cannot_request_agent_run_403`.
- `test_agent_run_provider_unconfigured_400` — `is_llm_configured` false → `400` fail-closed.
- `test_cancelled_run_no_side_effects` — cancel a queued run → `status="cancelled"`, no execution side effects.

**Implementation outline**
- `AgentRun(ProjectBaseModel)`: `issue = FK("db.Issue")`, `agent_key = CharField`, `requested_by = FK(user)`, `status` (TextChoices queued/running/succeeded/failed/cancelled, default queued), `input = JSONField(default=dict)`, `result = JSONField(null=True, blank=True)`, `error = TextField(blank=True)`.
- View: request-run `@allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="PROJECT")` (GUEST/VIEWER blocked); fail-closed `400` when provider unconfigured; create the queued record; log to `IssueActivity`; **perform no autonomous work-item mutation**. Cancel endpoint sets `cancelled`. Status read endpoint.

**Acceptance criteria**
- Given a member+, When requesting an agent run, Then an `AgentRun` is queued, `requested_by` set, surfaced in activity, with no autonomous mutation.
- Given status transitions, Then each is recorded with `result`/`error`.
- Given GUEST/VIEWER, Then `403`; given no provider, Then `400`.
- Given a queued run cancelled, Then `cancelled` with no side effects.

**Verify**
- `docker compose -f docker-compose-test.yml run --rm --build api-tests pytest plane/tests/unit/db/test_agent_run_model.py plane/tests/contract/app/test_agent_run_api.py -m "unit or contract" -v` (RED→GREEN)
- Migration forward+reverse; full suite green.

**Done when** `AgentRun` model + migration + queued/cancel/status endpoints live, all named tests RED→GREEN (no-autonomous-action + fail-closed + role-block proven), migration round-trips, suite green.

---

## AI-3-FE — AI buttons in description editor + summary button + agent-run UI (hide when no provider)

**Implements** EPIC-AI / AI-WORKITEMS (story AI-1/AI-2/AI-3/AI-4 UI)
**Depends on** [AI-1-API, AI-2-BE]
**Risk tier** R1 (flag-gated UI; fail-closed)
**Worktree isolation** y

**Context** Adds Draft/Simplify/Rewrite actions to the description editor (reusing the existing `gpt-assistant-popover.tsx`), a "Generate summary" button in the activity header, an NL-create entry, and an agent-run surface. Gated on `ai_copilot` AND a provider-configured check — when unconfigured, **render nothing** (hide, not disable) so an empty state never implies a broken paid feature (PRD line 123). Extends `AIService` (`packages/services/src/ai/ai.service.ts:33`, currently only `prompt`/`rephraseGrammar`).

**Files**
- Edit: `packages/services/src/ai/ai.service.ts` (add `draftDescription`, `simplify`, `rewrite`, `createWorkItem`, `summarizeIssue` calling `POST /api/workspaces/<slug>/copilot/messages/`)
- Edit: description editor toolbar / `apps/web/core/components/core/modals/gpt-assistant-popover.tsx` (grep exact path) — add Draft/Simplify/Rewrite
- New/Edit: summary button in `apps/web/core/components/issues/issue-detail/.../issue-activity` header
- New: agent-run UI surface in `issue-detail`
- New test: `apps/web/core/components/.../ai-description-actions.test.tsx` (Vitest)

**TDD — failing test first**
Vitest:
- `hides AI description actions when provider unconfigured` — provider-configured flag false → actions render nothing (not disabled).
- `hides AI actions when ai_copilot flag off`.
- `renders Draft/Simplify/Rewrite when provider configured and flag on`.
- `summary button hidden when provider unconfigured`.
- `agent-run action hidden when provider unconfigured`.

**Implementation outline**
- `AIService` methods POST the corresponding copilot mode; HTML returned is already sanitized server-side (AI-1) — still render via the safe editor path.
- A single `isAIAvailable` gate = `isSelfHostedFeatureEnabled("ai_copilot") && providerConfigured` (source the provider-configured signal from the existing copilot/provider config the frontend already reads; grep for how the app surfaces `is_llm_configured` — do not invent a new flag). When false, render null.
- Description actions: accept/regenerate without auto-save. Summary: read-only digest, optional post-as-comment (attributed to the user). Agent-run: request/cancel/status surfaced in activity.

**Acceptance criteria**
- Given provider configured + flag on, Then Draft/Simplify/Rewrite, summary, and agent-run actions render.
- Given no provider OR flag off, Then those actions are hidden (not disabled).

**Verify**
- `pnpm --filter web vitest run apps/web/core/components/**/ai-description-actions.test.tsx` (RED→GREEN); `pnpm --filter web check:types`

**Done when** `AIService` extended, editor/summary/agent UI wired, all Vitest cases RED→GREEN, type-check passes, hide-when-no-provider proven (not disabled).

---

## Execution order & parallelism

**Dependency graph** (→ = depends on):

```
CP-1-BE ─┬─→ CP-2-API ─→ CP-3-FE
         │
         ├─→ TPL-1-BE ─→ TPL-2-API ─→ TPL-3-FE      (TPL-2-API also → CP-2-API)
         │        └─→ REC-1-BE ─→ REC-2-WORKER ─→ REC-3-API-FE   (REC-2 also → TPL-2-API)
         │
         └─→ WF-1-BE ─→ WF-2-API ─→ WF-3-API ─→ WF-4-FE

DUP-1-API ─→ DUP-2-FE                              (independent root, no deps)

CP-2-API ─→ AI-1-API ─→ AI-2-BE ─→ AI-3-FE
```

**Parallel worktree batches** (each card = its own worktree; cards within a batch have no inter-dependencies and can run concurrently):

- **Batch 0 (roots, fully parallel):** `CP-1-BE`, `DUP-1-API`. *(CP-1-BE unblocks the most; DUP-1-API is wholly independent.)*
- **Batch 1 (after CP-1-BE; parallel):** `CP-2-API`, `TPL-1-BE`, `REC-1-BE`, `WF-1-BE`. Also `DUP-2-FE` (after DUP-1-API).
- **Batch 2 (parallel):** `CP-3-FE` (after CP-2-API), `TPL-2-API` (after TPL-1-BE + CP-2-API), `WF-2-API` (after WF-1-BE), `AI-1-API` (after CP-2-API).
- **Batch 3 (parallel):** `TPL-3-FE` (after TPL-2-API), `REC-2-WORKER` (after REC-1-BE + TPL-2-API), `WF-3-API` (after WF-2-API), `AI-2-BE` (after AI-1-API).
- **Batch 4 (parallel):** `REC-3-API-FE` (after REC-2-WORKER), `WF-4-FE` (after WF-3-API), `AI-3-FE` (after AI-2-BE).

**Critical path (longest chain, 5 cards):** `CP-1-BE → TPL-1-BE → TPL-2-API → REC-2-WORKER → REC-3-API-FE`. The WF chain (`CP-1-BE → WF-1-BE → WF-2-API → WF-3-API → WF-4-FE`) and the AI chain (`CP-1-BE → CP-2-API → AI-1-API → AI-2-BE → AI-3-FE`) are the same depth — schedule all three streams in parallel after CP-1-BE lands. R0-gate cards (`WF-2-API`, `AI-1-API`, `AI-2-BE`) must show failing-then-green contract tests before merge.
