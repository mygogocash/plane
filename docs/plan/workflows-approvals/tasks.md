# Workflows & Approvals — Tasks (Claude Code subagent cards)

> **Build status** (see [`../PROGRESS.md`](../PROGRESS.md) for the authoritative tracker):
> **WF-T1 → WF-T10 are DONE & verified** (backend WF-T1–T9 = 62 tests green; frontend store/service/types WF-T10 = 5 store tests + check:types green).
> **Remaining: WF-T11, WF-T12, WF-T13** (frontend UI — CE enforcement components, settings workflow builder, approval banner + AI chip).
> Each remaining card is tracked as a GitHub issue in the backlog.

Each card is self-contained: the executing subagent has no memory of this conversation or the companion EPICS/PRD docs, so all context, file paths, and patterns are inline. Conventions for the whole doc:

- **Backend (`apps/api`)**: Django/DRF. Tests live under `apps/api/plane/tests/{unit,contract}/`. Use `@pytest.mark.unit` (or `@pytest.mark.contract`) plus `@pytest.mark.django_db` (pattern seen in `apps/api/plane/tests/unit/models/test_issue_comment_modal.py`). Models extend `ProjectBaseModel` (`apps/api/plane/db/models/project.py:180`) which supplies `project`, `workspace`, `created_by`, soft-delete. Models are exported from `apps/api/plane/db/models/__init__.py` (e.g. line 65 `from .state import State, StateGroup, DEFAULT_STATES`; line 83 `from .issue_type import IssueType`).
- **Frontend (`apps/web`)**: React Router 7 + MobX. Tests are vitest (`apps/web/package.json` → `"test": "vitest run"`, config `apps/web/vite.config.ts`). Existing test examples: `apps/web/ce/lib/self-host-entitlements.test.ts`, `apps/web/core/constants/ai.test.ts`.
- **Roles**: `ROLE` enum (`apps/api/plane/app/permissions/base.py:13` → `ADMIN=20, MEMBER=15, GUEST=5`); `allow_permission(allowed_roles, level="PROJECT", ...)` decorator at line 19. `ROLE_CHOICES = ((20,"Admin"),(15,"Member"),(5,"Guest"))` at `apps/api/plane/db/models/project.py:21`.
- **Default project posture**: `workflow_status="disabled"`, zero rules ⇒ unrestricted transitions (fully backward-compatible).
- **Entitlement flag**: `workflows_approvals: true` already in `apps/web/ce/lib/self-host-entitlements.ts:27`; `isSelfHostedFeatureEnabled(feature)` at line 33.
- **Verify (backend)**: `docker compose -f docker-compose-test.yml run --rm api-tests pytest <path>`.
- **Verify (frontend)**: `pnpm --filter web exec vitest run <path>` and `pnpm turbo run check:types --filter=web`.

ID prefix for all tasks: `WF`. Tasks ordered backend models/migrations → APIs → frontend.

---

## WF-T1 — Workflow data models + additive migration

**Implements** WF-1 (epic); FR1, FR3, FR4, FR5, data-model + migration sections of the PRD.
**Depends on** none.
**Risk tier** R1 (schema migration, costly to reverse; additive-only, default `disabled`, clean reverse).
**Worktree isolation** yes.

**Context**
The fork has no workflow tables. This task adds four project-scoped models plus one column on `Project`, with zero behavior change (no enforcement, no API, no UI). `State` lives at `apps/api/plane/db/models/state.py` (table `states`), `IssueType` at `apps/api/plane/db/models/issue_type.py` (table `issue_types`), `Issue`/`User`/`ProjectMember`/`Project` are referenceable as string FKs `"db.Issue"`, `"db.User"`, `"db.ProjectMember"`. The existing partial-unique pattern to mirror is in `State.Meta` (`apps/api/plane/db/models/state.py:103-114`):

```python
class Meta:
    unique_together = ["name", "project", "deleted_at"]
    constraints = [
        models.UniqueConstraint(
            fields=["name", "project"],
            condition=Q(deleted_at__isnull=True),
            name="state_unique_name_project_when_deleted_at_null",
        )
    ]
    db_table = "states"
```

`ProjectBaseModel` (`apps/api/plane/db/models/project.py:180`) already provides `project`, `workspace`, `created_by`, soft-delete `deleted_at`. `ArrayField` comes from `django.contrib.postgres.fields` (Postgres is the deploy DB).

**Files**

- New: `apps/api/plane/db/models/workflow.py` (all four new models).
- Edit: `apps/api/plane/db/models/__init__.py` (export the four models, alongside the `from .state ...` / `from .issue_type ...` lines).
- Edit: `apps/api/plane/db/models/project.py` (add `workflow_status` CharField to `Project`; reuse the `disabled|enabled|paused` choices).
- New migration: `apps/api/plane/db/migrations/00NN_workflow_models.py` (generated via `makemigrations`, do not hand-write the dependency graph).
- New test: `apps/api/plane/tests/unit/models/test_workflow_models.py`.

**Model spec (exact)**

- `WorkflowTransition(ProjectBaseModel)`, `db_table="workflow_transitions"`:
  - `from_state` FK `"db.State"` `on_delete=PROTECT`, `related_name="outgoing_transitions"`
  - `to_state` FK `"db.State"` `on_delete=PROTECT`, `related_name="incoming_transitions"`
  - `issue_type` FK `"db.IssueType"` `null=True, blank=True, on_delete=CASCADE`, `related_name="workflow_transitions"`
  - `allowed_roles` `ArrayField(models.PositiveSmallIntegerField(), default=list, blank=True)`
  - `approval_required` `BooleanField(default=False)`
  - `fallback_state` FK `"db.State"` `null=True, blank=True, on_delete=SET_NULL`, `related_name="fallback_for_transitions"`
  - `auto_assign_member` FK `"db.User"` `null=True, blank=True, on_delete=SET_NULL`, `related_name="workflow_auto_assignments"`
  - `auto_assign_role` `PositiveSmallIntegerField(null=True, blank=True)`
  - `Meta`: partial-unique constraint on fields `["project","issue_type","from_state","to_state"]` `condition=Q(deleted_at__isnull=True)`, name `"workflow_transition_unique_when_deleted_at_null"`.
- `WorkflowTransitionActor(ProjectBaseModel)`, `db_table="workflow_transition_actors"`:
  - `transition` FK `WorkflowTransition` `on_delete=CASCADE, related_name="actors"`
  - `member` FK `"db.ProjectMember"` `on_delete=CASCADE`, `related_name="workflow_transition_actors"`
  - `Meta`: partial-unique on `["transition","member"]` `condition=Q(deleted_at__isnull=True)`, name `"workflow_transition_actor_unique_when_deleted_at_null"`.
- `WorkItemApproval(ProjectBaseModel)`, `db_table="work_item_approvals"`:
  - `issue` FK `"db.Issue"` `on_delete=CASCADE, related_name="approvals"`
  - `transition` FK `WorkflowTransition` `on_delete=PROTECT`, `related_name="approvals"`
  - `requested_by` FK `"db.User"` `on_delete=CASCADE`, `related_name="requested_approvals"`
  - `status` `CharField(max_length=20, choices=[("pending","pending"),("approved","approved"),("rejected","rejected")], default="pending")`
  - `decided_by` FK `"db.User"` `null=True, blank=True, on_delete=SET_NULL`, `related_name="decided_approvals"`
  - `decided_at` `DateTimeField(null=True, blank=True)`
  - `comment` `TextField(blank=True, default="")`
  - `target_state` FK `"db.State"` `null=True, on_delete=SET_NULL`, `related_name="approval_targets"`
  - `fallback_state` FK `"db.State"` `null=True, blank=True, on_delete=SET_NULL`, `related_name="approval_fallbacks"`
- `WorkItemApprovalApprover(ProjectBaseModel)`, `db_table="work_item_approval_approvers"`:
  - `approval` FK `WorkItemApproval` `on_delete=CASCADE, related_name="approvers"`
  - `member` FK `"db.ProjectMember"` `on_delete=CASCADE`, `related_name="approval_assignments"`
  - `responded` `BooleanField(default=False)`
- `Project.workflow_status` `CharField(max_length=20, choices=[("disabled","disabled"),("enabled","enabled"),("paused","paused")], default="disabled")`.

**TDD — failing test first**
Test path: `apps/api/plane/tests/unit/models/test_workflow_models.py`, markers `@pytest.mark.unit` + `@pytest.mark.django_db`. Write these first and watch them fail with `ImportError`/`OperationalError` (table missing) — the right reason, not a typo:

- `WorkflowTransition > creating with from/to state in a project > persists with workflow_status default disabled on its project` — asserts `Project.workflow_status == "disabled"` for a freshly created project; asserts a transition row saves and `allowed_roles == []`.
- `WorkflowTransition > duplicate (project, issue_type, from, to) not soft-deleted > raises IntegrityError` — create one, create identical second ⇒ `IntegrityError`; then soft-delete first (`deleted_at` set) ⇒ identical new row permitted.
- `WorkflowTransition > deleting a referenced from_state > raises ProtectedError` — PROTECT guard.
- `WorkflowTransition > deleting a referenced fallback_state > nulls fallback_state` — SET_NULL guard; reload and assert `fallback_state is None`.
- `WorkItemApproval > created for a transition > defaults status pending and approvers attachable`.

**Implementation outline**
Mirror `State.Meta` constraint style (`apps/api/plane/db/models/state.py:103`). Import `ArrayField` from `django.contrib.postgres.fields`, `Q` from `django.db.models`. Add `workflow_status` near other `Project` fields in `apps/api/plane/db/models/project.py`. Generate the migration with `makemigrations`, then confirm `makemigrations --check` is clean. Register all four in `apps/api/plane/db/models/__init__.py`.

**Acceptance criteria**

- Given an existing project predating this change, When the migration applies, Then its `workflow_status` is `disabled` and no transition rows exist (regression guard).
- Given the migration applied then reversed on a test DB, When `migrate` runs forward then backward, Then all four tables and the column drop cleanly with no PROTECT violation.
- Given a `WorkflowTransition` referencing a `from_state`, When that state is deleted, Then `ProtectedError` is raised.
- Given a `WorkflowTransition` whose `fallback_state` is deleted, When the delete succeeds, Then `fallback_state` becomes null.
- Given two transitions with identical `(issue_type, from_state, to_state)` both un-deleted, When the second saves, Then `IntegrityError`; after soft-deleting the first, an identical new row is permitted.
- Authz/edge: models carry `project` + `workspace` (via `ProjectBaseModel`) so later queries can scope by workspace slug + project; no enforcement is reachable yet.

**Verify**

```
docker compose -f docker-compose-test.yml run --rm api-tests pytest plane/tests/unit/models/test_workflow_models.py -v
docker compose -f docker-compose-test.yml run --rm api-tests python manage.py makemigrations --check --dry-run
```

**Done when** all five tests pass red→green, `makemigrations --check` is clean, forward+reverse migration verified on the test DB, four models exported from `__init__.py`, and `Project.workflow_status` defaults `disabled`.

---

## WF-T2 — Workflow DRF serializers + Django admin registration

**Implements** WF-1 (epic); data-model section (serializers/admin).
**Depends on** WF-T1.
**Risk tier** R2 (additive serializers/admin, no behavior on hot path).
**Worktree isolation** yes.

**Context**
WF-T1 created models `WorkflowTransition`, `WorkflowTransitionActor`, `WorkItemApproval`, `WorkItemApprovalApprover` (`apps/api/plane/db/models/workflow.py`) and added `Project.workflow_status`. Serializers must follow the existing module conventions in `apps/api/plane/app/serializers/` (state serializer is in `apps/api/plane/app/serializers/state.py`; the package `__init__` re-exports serializers). Admin registration follows `apps/api/plane/db/admin/` (or the project's admin module — grep `admin.site.register` to confirm the location before editing).

**Files**

- New: `apps/api/plane/app/serializers/workflow.py` (`WorkflowTransitionSerializer`, `WorkflowTransitionActorSerializer`, `WorkItemApprovalSerializer`, `WorkItemApprovalApproverSerializer`).
- Edit: `apps/api/plane/app/serializers/__init__.py` (export the new serializers).
- Edit/new: admin registration file (grep `apps/api/plane/db/admin/` and `apps/api/plane/admin.py` to find the convention; register the four models read-only-friendly).
- New test: `apps/api/plane/tests/unit/serializers/test_workflow_serializers.py`.

**TDD — failing test first**
Path `apps/api/plane/tests/unit/serializers/test_workflow_serializers.py`, markers `@pytest.mark.unit` + `@pytest.mark.django_db`:

- `WorkflowTransitionSerializer > serializing a rule > exposes from_state to_state issue_type allowed_roles approval_required fallback_state auto_assign fields`.
- `WorkflowTransitionSerializer > deserializing with allowed_roles [15] > validates and saves`.
- `WorkItemApprovalSerializer > serializing > exposes status target_state fallback_state and nested approvers`.
- `WorkItemApprovalSerializer > comment with <script> > is preserved as raw on the serializer field` (note: sanitization is enforced at the write path in WF-T6, not in the serializer — assert the serializer itself does not crash; sanitization assertion belongs to WF-T6).

**Implementation outline**
Subclass `serializers.ModelSerializer` like `apps/api/plane/app/serializers/state.py`. Set `read_only_fields = ["workspace","project","created_by","deleted_at"]`. Nest approvers in `WorkItemApprovalSerializer` via `WorkItemApprovalApproverSerializer(many=True, read_only=True)`. Do not add validation logic that belongs to the enforcement service (WF-T4) — keep serializers thin.

**Acceptance criteria**

- Given a saved `WorkflowTransition`, When serialized, Then all fields above appear and `allowed_roles` is a list.
- Given input `{"allowed_roles":[15], "from_state":..., "to_state":...}`, When deserialized in a project context, Then it validates.
- Authz/edge: serializers expose no cross-project data by themselves; scoping is the viewset's job (WF-T5).

**Verify**

```
docker compose -f docker-compose-test.yml run --rm api-tests pytest plane/tests/unit/serializers/test_workflow_serializers.py -v
```

**Done when** serializer tests pass red→green, serializers exported, four models visible in Django admin.

---

## WF-T3 — `enforce_state_transition` core service: rule resolution + actor authorization

**Implements** WF-2 (epic); FR1, FR2, AR1, AR3, AR5; fail-closed (Security).
**Depends on** WF-T1.
**Risk tier** R1 (critical-path authorization logic; untested critical path would be R0 — TDD mandatory before any wiring).
**Worktree isolation** yes.

**Context**
This is the single authoritative gate that WF-T5 (endpoint/seam) calls. It is a pure-ish service that, given an issue, a target state id, and an acting user, decides allow / deny-actor (403) / illegal-transition (409) / unrestricted. It must NOT itself perform the `state_id` write — it returns a decision object (or raises typed exceptions); the caller applies the move. Roles: `ROLE` enum (`apps/api/plane/app/permissions/base.py:13`, `ADMIN=20, MEMBER=15, GUEST=5`). A member's project role is read from `ProjectMember` (`apps/api/plane/db/models/project.py`, `role` is `PositiveSmallIntegerField`). Models from WF-T1: `WorkflowTransition` (`allowed_roles` array + `approval_required` + `issue_type`), `WorkflowTransitionActor` (explicit member grants, `related_name="actors"`). Scope reads by `project_id` + `deleted_at__isnull=True`; this service receives already-resolved project/issue context. Allowed-actor set = union of `allowed_roles` membership and explicit `WorkflowTransitionActor.member` grants; **empty allowed set ⇒ any active project member**.

This task implements rule resolution for the **project-default** rule set (`issue_type=None`) only. Typed resolution is layered in WF-T8 by changing the resolution input, not the enforcement mechanics — so write `enforce_state_transition` to accept/compute a resolved queryset of candidate transitions and keep the typed-vs-default selection in a small, replaceable `resolve_rule_set(issue, project)` helper.

**Files**

- New: `apps/api/plane/utils/workflow.py` — `enforce_state_transition(issue, new_state_id, actor)`, `resolve_rule_set(issue, project)`, typed exceptions `IllegalTransition`, `ActorNotAllowed`.
- New test: `apps/api/plane/tests/unit/utils/test_enforce_state_transition.py`.

**TDD — failing test first**
Path `apps/api/plane/tests/unit/utils/test_enforce_state_transition.py`, markers `@pytest.mark.unit` + `@pytest.mark.django_db`. Build fixtures: a project, two states A/B, a `ProjectMember` per role. Write these red first:

- `enforce_state_transition > project workflow_status disabled > returns allow regardless of rules`.
- `enforce_state_transition > workflow_status enabled and NO rule exists for project > returns allow (unrestricted, backward-compatible)`.
- `enforce_state_transition > rule A→B allowing role MEMBER, actor is a Member > returns allow`.
- `enforce_state_transition > rule A→B exists but actor attempts A→C (no rule) > raises IllegalTransition` (maps to 409).
- `enforce_state_transition > rule A→B excludes GUEST, actor is Guest > raises ActorNotAllowed` (maps to 403).
- `enforce_state_transition > member granted via BOTH allowed_roles and explicit WorkflowTransitionActor > allowed (union deduped, no error)`.
- `enforce_state_transition > rule with empty allowed_roles and no actor grants > any active project member allowed`.
- `enforce_state_transition > rule belongs to project A, evaluating an issue in project B > rule invisible, treated as no-rule (multi-tenant isolation)`.

**Implementation outline**
Read `project.workflow_status`; if `disabled` or `paused` → allow (paused is non-enforcing — but `paused` gating proper lands in WF-T8; for this task treat only `enabled` as enforcing and everything else as allow). `resolve_rule_set` returns `WorkflowTransition.objects.filter(project=project, issue_type__isnull=True, deleted_at__isnull=True)`. Find the rule for `(from_state=issue.state_id, to_state=new_state_id)`; if none and any rule exists for `from_state` → `IllegalTransition`; if no rule set at all → allow. Resolve actor role from `ProjectMember.objects.get(project=project, member=actor, is_active=True)`. Allowed = `actor.role in rule.allowed_roles` OR `WorkflowTransitionActor.objects.filter(transition=rule, member__member=actor, deleted_at__isnull=True).exists()` OR (`rule.allowed_roles == []` and no actor grants ⇒ any member). Wrap the whole body so any unexpected exception re-raises as a deny (fail-closed) — never return allow on internal error.

**Acceptance criteria**

- Given `enabled` + rule A→B for role Member + a Member actor, When called for A→B, Then allow.
- Given a rule A→B and no rule B→C, When any actor calls B→C, Then `IllegalTransition`.
- Given a rule A→B excluding Guests + a Guest actor, When called, Then `ActorNotAllowed`.
- Given `disabled`/no-rules, When called, Then allow.
- Authz/edge: a project-A rule is invisible when evaluating a project-B issue; union of role + explicit grants is deduped; internal error ⇒ deny (fail-closed), proven by a test that forces a raised exception in resolution and asserts deny.

**Verify**

```
docker compose -f docker-compose-test.yml run --rm api-tests pytest plane/tests/unit/utils/test_enforce_state_transition.py -v
```

**Done when** all eight tests pass red→green, the service returns a decision/raises typed errors without writing `state_id`, and fail-closed behavior is covered.

---

## WF-T4 — `WorkflowViewSet` + session routes for transition-rule CRUD (admin-only)

**Implements** WF-2 (epic); AR1, AR2; API-contract `workflow-transitions` (session).
**Depends on** WF-T2, WF-T3.
**Risk tier** R1 (new public endpoints; admin-gated writes).
**Worktree isolation** yes.

**Context**
Add CRUD for transition rules + their explicit-member actors, scoped to `workspaces/<slug>/projects/<project_id>/`. Mirror the existing state viewset exactly for scoping and permission style: `StateViewSet` is at `apps/api/plane/app/views/state/base.py` (full CRUD, `allow_permission([ROLE.ADMIN])` on writes, `get_queryset` filters by `workspace__slug` + `project_id` + active `ProjectMember`). Session routes for state are in `apps/api/plane/app/urls/state.py`; register the new routes the same way in a new `apps/api/plane/app/urls/workflow.py` and include it from the urls package (`apps/api/plane/app/urls/__init__.py`). `allow_permission` decorator + `ROLE` from `apps/api/plane/app/permissions/base.py`. Serializers from WF-T2.

**Files**

- New: `apps/api/plane/app/views/workflow/__init__.py`, `apps/api/plane/app/views/workflow/base.py` (`WorkflowTransitionViewSet`).
- New: `apps/api/plane/app/urls/workflow.py`.
- Edit: `apps/api/plane/app/urls/__init__.py` (include workflow urls).
- New test: `apps/api/plane/tests/contract/app/test_workflow_transitions_crud.py`.

**Routes**

- `GET/POST .../workflow-transitions/` — list (query filters `issue_type`, `from_state`); create. Writes `allow_permission([ROLE.ADMIN])`.
- `GET/PATCH/DELETE .../workflow-transitions/<pk>/` — manage one rule + nested actors.

**TDD — failing test first**
Path `apps/api/plane/tests/contract/app/test_workflow_transitions_crud.py`, markers `@pytest.mark.contract` + `@pytest.mark.django_db`, DRF `APIClient` authenticated as project members of differing roles:

- `workflow-transitions POST > as project Admin > 201 creates rule`.
- `workflow-transitions POST > as Member > 403`.
- `workflow-transitions GET > filter by from_state > returns only matching rules`.
- `workflow-transitions GET > rule in project A requested under project B slug > not returned (multi-tenant)`.
- `workflow-transitions PATCH > as Admin updating allowed_roles + actors > 200 and persists`.
- `workflow-transitions DELETE > as Admin > soft-deletes the rule`.

**Implementation outline**
Subclass the same base viewset `StateViewSet` uses (grep its import in `apps/api/plane/app/views/state/base.py` — likely `BaseViewSet`). Copy its `get_queryset` scoping verbatim, swapping the model to `WorkflowTransition`. Decorate `create`/`partial_update`/`destroy` with `@allow_permission([ROLE.ADMIN])`. Validate that `from_state`, `to_state`, `fallback_state`, `issue_type` all belong to the same `project_id` (reject cross-project references → 400). Accept nested `actors` (list of `member` ids) and upsert `WorkflowTransitionActor` rows in a transaction.

**Acceptance criteria**

- Given a project Admin, When POSTing a valid rule, Then 201.
- Given a Member, When POSTing, Then 403.
- Given a rule in project A, When listed under project B's slug, Then absent (AR1 isolation).
- Authz/edge: a rule referencing a `to_state` from another project → 400; DELETE soft-deletes (sets `deleted_at`), does not hard-delete.

**Verify**

```
docker compose -f docker-compose-test.yml run --rm api-tests pytest plane/tests/contract/app/test_workflow_transitions_crud.py -v
```

**Done when** all tests pass red→green, writes are admin-only, reads are workspace+project scoped, cross-project references rejected.

---

## WF-T5 — `state-transition` endpoint + wire `enforce_state_transition` into the issue-update seam (session + bulk)

**Implements** WF-2 (epic); FR1–FR2, AR3; API-contract `state-transition` (200/403/409); single-gate guarantee.
**Depends on** WF-T3, WF-T4.
**Risk tier** R1 (changes effective behavior of issue `state_id` writes; feature-flag + `workflow_status` gated; fail-closed).
**Worktree isolation** yes.

**Context**
Every `state_id` write must pass through `enforce_state_transition` (WF-T3, `apps/api/plane/utils/workflow.py`). The seam is `IssueViewSet.partial_update` in `apps/api/plane/app/views/issue/base.py` (class at line 196; `partial_update` at line 616 — it builds `current_instance`, then `serializer = IssueCreateSerializer(issue, data=request.data, partial=True, ...)` then `serializer.save()`). Insert the gate **before** `serializer.save()` when `request.data` contains a changed `state_id`. On deny, return 403/409 and do NOT save. Also add a dedicated `POST .../issues/<issue_id>/state-transition/` endpoint (body `{ to_state }`) that calls the same service and applies the move on allow. Bulk: the only bulk state-touching path in this codebase to guard is verified absent for `state_id` (the bulk endpoints found are `BulkDeleteIssuesEndpoint` line 761 and `IssueBulkUpdateDateEndpoint` line 1094, which update dates/archive, not state). If a bulk `state_id` path is later found via grep `state_id` across `apps/api/plane/app/views/issue/`, route it through the same service per-item; otherwise document that single-item `partial_update` + `state-transition` are the only state seams. Approval `202` path is added in WF-T6 — this task returns only 200/403/409.

**Files**

- Edit: `apps/api/plane/app/views/issue/base.py` (`partial_update` seam ~line 616; add gate before `serializer.save()`).
- Edit: `apps/api/plane/app/views/workflow/base.py` (add `IssueStateTransitionEndpoint`).
- Edit: `apps/api/plane/app/urls/workflow.py` (add `state-transition` route).
- New test: `apps/api/plane/tests/contract/app/test_state_transition_enforcement.py`.

**TDD — failing test first**
Path `apps/api/plane/tests/contract/app/test_state_transition_enforcement.py`, markers `@pytest.mark.contract` + `@pytest.mark.django_db`:

- `partial_update state_id > workflow enabled, rule A→B allows Member, Member moves item A→B > 200 and state_id updated`.
- `partial_update state_id > rule A→B but actor attempts B→C > 409 and state_id unchanged`.
- `state-transition POST > rule A→B excludes Guest, Guest actor > 403 and state_id unchanged`.
- `partial_update state_id > workflow_status disabled > move succeeds unrestricted`.
- `state-transition POST and partial_update for the same illegal move > both return 409 (single gate)`.
- `partial_update > request without state_id change (e.g. only name) > never invokes enforcement, succeeds`.

**Implementation outline**
In `partial_update`, after building `issue` and before `serializer.is_valid()/save()`: if `request.data.get("state_id")` is present and differs from `issue.state_id`, call `enforce_state_transition(issue, request.data["state_id"], request.user)`. Catch `ActorNotAllowed` → `Response(status=403)`; `IllegalTransition` → `Response(status=409)`; any other exception → 409/deny (fail-closed) with the state change rejected. The new `IssueStateTransitionEndpoint` (a `BaseAPIView`) loads the issue scoped by slug+project, calls the same service, on allow performs the `state_id` update via the same serializer/save path so activity logging stays consistent, and returns the updated issue (200).

**Acceptance criteria**

- Given enabled + rule A→B for Member + Member actor, When moving A→B (either seam), Then 200 and `state_id` updated.
- Given rule A→B and no rule B→C, When attempting B→C, Then 409, unchanged.
- Given rule A→B excluding Guest + Guest actor, When attempting A→B, Then 403, unchanged.
- Given `disabled`/no rules, When moving, Then unrestricted.
- Authz/edge: both seams return identical 409 for the same illegal move (single gate); a non-state-changing `partial_update` skips enforcement; internal service error ⇒ state change rejected (fail-closed).

**Verify**

```
docker compose -f docker-compose-test.yml run --rm api-tests pytest plane/tests/contract/app/test_state_transition_enforcement.py -v
docker compose -f docker-compose-test.yml run --rm api-tests pytest plane/tests/contract/app/test_workflow_transitions_crud.py -v
```

**Done when** all tests pass red→green, the seam rejects illegal/disallowed moves without saving, both seams share one gate, and non-state updates are untouched.

---

## WF-T6 — Approval gates, fallback routing, notifications + activity, comment sanitization

**Implements** WF-3 (epic); FR3, FR4, FR7, AR4; comment sanitization (Security); approval snapshot edge cases.
**Depends on** WF-T1, WF-T3, WF-T5.
**Risk tier** R1 (governance-critical; new endpoints; changes gated `state_id` behavior; fail-closed on null fallback).
**Worktree isolation** yes.

**Context**
When a matched rule has `approval_required=True`, the move must NOT change `state_id`; instead create a `WorkItemApproval` (status `pending`) + `WorkItemApprovalApprover` rows, snapshot `target_state` and `fallback_state` at request time, and return `202` + `{ approval_id }`. On final approval (all required approvers approved) apply `target_state` via the same gated write path (WF-T5). On rejection route to `fallback_state`; if null, leave the item in the source state and return a validation error (fail-closed — never silent). Models from WF-T1: `WorkItemApproval` (`status`, `target_state`, `fallback_state`, `comment`), `WorkItemApprovalApprover` (`responded`). Notifications: `Notification` model at `apps/api/plane/db/models/notification.py` (`receiver, triggered_by, entity_name, entity_identifier, data`), dispatched via `apps/api/plane/bgtasks/notification_task.py`. Activity via `apps/api/plane/bgtasks/issue_activities_task.py`. HTML sanitizer: reuse the project's existing server-side sanitizer used for issue/comment rich text — grep `bleach`/`sanitize`/`nh3` under `apps/api/plane/` and reuse that helper; sanitize `comment` on write AND before render. Approvers: only `ProjectMember`s in the approval's approver set may decide (AR4); workspace-admin override allowed but logged to activity.

**Files**

- Edit: `apps/api/plane/utils/workflow.py` (extend the service to detect `approval_required` and signal "needs approval"; add `create_approval(...)`, `apply_approval_decision(...)` helpers).
- Edit: `apps/api/plane/app/views/workflow/base.py` (`IssueApprovalsEndpoint` GET; `ApprovalDecisionEndpoint` POST; have `state-transition`/`partial_update` return 202 when approval is required).
- Edit: `apps/api/plane/app/urls/workflow.py` (`issues/<issue_id>/approvals/`, `approvals/<approval_id>/decision/`).
- New: sanitization usage in the approval write path (reuse existing helper; do not write a new sanitizer).
- New test: `apps/api/plane/tests/contract/app/test_approvals.py`.

**TDD — failing test first**
Path `apps/api/plane/tests/contract/app/test_approvals.py`, markers `@pytest.mark.contract` + `@pytest.mark.django_db`:

- `state-transition > rule A→Done approval_required with 2 approvers > returns 202 + approval_id, state stays A, WorkItemApproval pending created, each approver gets a Notification row`.
- `decision approve > first of two approvers approves > item stays A; second approves > item advances to Done and an activity entry records approval`.
- `decision reject > rule fallback_state=Backlog > item routes to Backlog and original assignee + creator get rejection Notification + activity`.
- `decision reject > rule has no fallback > item stays in source state, returns validation error (no silent move)`.
- `decision > non-approver project member posts decision > 403; workspace-admin override > allowed and logged in activity`.
- `decision > rule edited (fallback changed) after request > approval resolves using snapshotted target/fallback, not edited rule`.
- `approval comment > contains <script> markup > sanitized server-side on persist and on render`.

**Implementation outline**
Extend `enforce_state_transition` to return a decision flag `requires_approval` when the matched rule has `approval_required=True` (still deny disallowed actors/illegal transitions first). The endpoint, on `requires_approval`, calls `create_approval`: snapshot `target_state=new_state`, `fallback_state=rule.fallback_state`, create approver rows from rule actors/roles, enqueue `notification_task` for each approver, return 202. `ApprovalDecisionEndpoint`: verify the actor is an approver (or workspace admin → log override); sanitize `comment` with the existing helper; mark `WorkItemApprovalApprover.responded`; if all responded approved → apply `target_state` through the WF-T5 gated write path and emit approval activity; if rejected → if `fallback_state` set apply it + notify assignee+creator + activity, else error. Wrap all async-boundary dispatch in try/except and log context.

**Acceptance criteria**

- Given a gated rule with 2 approvers, When an allowed actor requests, Then 202 + `approval_id`, state unchanged, pending approval + per-approver notifications created.
- Given a pending approval, When the last required approver approves, Then item advances and approval activity recorded.
- Given rejection with fallback=Backlog, When rejected, Then item routes to Backlog and assignee+creator notified.
- Given rejection with null fallback, When rejected, Then item stays + validation error (no silent move).
- Authz/edge: non-approver → 403; workspace-admin override allowed + logged; in-flight approval resolves on snapshot after rule edit; `<script>` comment sanitized on write and render.

**Verify**

```
docker compose -f docker-compose-test.yml run --rm api-tests pytest plane/tests/contract/app/test_approvals.py -v
```

**Done when** all tests pass red→green, gated moves defer state, approval/rejection routing works, notifications + activity emitted, comments sanitized, and approvals are independently flag-disable-able without disabling transition enforcement.

---

## WF-T7 — api-key v1 mirror for `workflow-transitions` CRUD + `state-transition`

**Implements** WF-2 (epic); AR5; API-contract v1 mirror; edge case "api-key Guest → 403 identical to session".
**Depends on** WF-T4, WF-T5.
**Risk tier** R1 (public v1 API surface).
**Worktree isolation** yes.

**Context**
Mirror the session `workflow-transitions` CRUD and `state-transition` under `/api/v1/...`, resolving the API key to a `ProjectMember` and applying the same `ROLE` checks and the same `enforce_state_transition` gate (`apps/api/plane/utils/workflow.py`). v1 state routes for reference: `apps/api/plane/api/urls/state.py`; v1 views follow the `apps/api/plane/api/views/` convention (api-key auth resolves the requesting member). The v1 response envelope follows existing v1 serializers. The gate must be identical to session so a Guest api-key caller attempting an admin-only/ disallowed transition gets the same 403/409.

**Files**

- New: `apps/api/plane/api/views/workflow.py` (v1 viewset + state-transition endpoint).
- New: `apps/api/plane/api/urls/workflow.py`.
- Edit: `apps/api/plane/api/urls/__init__.py` (include v1 workflow urls).
- New test: `apps/api/plane/tests/contract/api/test_workflow_v1.py`.

**TDD — failing test first**
Path `apps/api/plane/tests/contract/api/test_workflow_v1.py`, markers `@pytest.mark.contract` + `@pytest.mark.django_db`, using api-key auth fixtures:

- `v1 workflow-transitions POST > api key whose member is Admin > 201`.
- `v1 workflow-transitions POST > api key whose member is Member > 403`.
- `v1 state-transition > illegal move > 409 (identical to session)`.
- `v1 state-transition > api key mapped to Guest attempting disallowed move > 403 (identical to session)`.
- `v1 workflow-transitions GET > scoped to the api key's workspace+project only`.

**Implementation outline**
Follow `apps/api/plane/api/views/` base classes for api-key auth (grep the state v1 view referenced by `apps/api/plane/api/urls/state.py` for the exact base + how it resolves the member). Reuse `enforce_state_transition` and the same serializers (WF-T2). Resolve the acting `ProjectMember` from the api key and pass `request.user`/member to the service identically to session.

**Acceptance criteria**

- Given an Admin-keyed caller, When POSTing a rule, Then 201; Given a Member-keyed caller, Then 403.
- Given an illegal move via v1, Then 409 matching session.
- Authz/edge: a Guest-keyed caller's disallowed transition → 403 identical to session; v1 reads scoped to the key's workspace+project.

**Verify**

```
docker compose -f docker-compose-test.yml run --rm api-tests pytest plane/tests/contract/api/test_workflow_v1.py -v
```

**Done when** v1 endpoints behave identically to session for CRUD authz and transition enforcement.

---

## WF-T8 — Type-specific rule resolution + lifecycle controls (config endpoint, paused, maintenance bypass)

**Implements** WF-4 (epic); FR5, FR6, AR2; edge cases (typed-vs-default, paused mid-approval, creation into default state, per-item bulk).
**Depends on** WF-T3, WF-T4, WF-T5.
**Risk tier** R1 (changes resolution semantics for typed items; adds config API + logged bypass).
**Worktree isolation** yes.

**Context**
Extend rule resolution so a work item's bound `IssueType` selects the typed rule set (`WorkflowTransition.issue_type = <type>`); items with no bound type fall back to the project-default set (`issue_type=None`). The `resolve_rule_set(issue, project)` helper from WF-T3 (`apps/api/plane/utils/workflow.py`) is the single replacement point. `IssueType`/`ProjectIssueType` at `apps/api/plane/db/models/issue_type.py` (`ProjectIssueType` links a workspace type to a project, `unique_together=["project","issue_type","deleted_at"]`) — typed resolution must only resolve a type's rules for projects it is linked to. Lifecycle: `Project.workflow_status` (`disabled|enabled|paused`, WF-T1). `paused` keeps rules listable/editable but `enforce_state_transition` does not gate. Add `GET/PATCH .../workflow-config/` (admin-only) to read/update `workflow_status`. Add an admin-only maintenance bypass on the transition path that skips enforcement and writes an issue activity entry (`apps/api/plane/bgtasks/issue_activities_task.py`). Creation always lands in the project default state regardless of rules (rules govern subsequent transitions only).

**Files**

- Edit: `apps/api/plane/utils/workflow.py` (`resolve_rule_set` typed-vs-default; honor `paused`; `maintenance_bypass` flag path).
- Edit: `apps/api/plane/app/views/workflow/base.py` (`WorkflowConfigEndpoint` GET/PATCH).
- Edit: `apps/api/plane/app/urls/workflow.py` (`workflow-config/`).
- New test: `apps/api/plane/tests/unit/utils/test_rule_resolution_and_lifecycle.py` and `apps/api/plane/tests/contract/app/test_workflow_config.py`.

**TDD — failing test first**
Unit `apps/api/plane/tests/unit/utils/test_rule_resolution_and_lifecycle.py` (`@pytest.mark.unit`+`@pytest.mark.django_db`):

- `resolve_rule_set > Bug type has rule A→B, default set has A→C, Bug item attempts A→B > allowed`.
- `resolve_rule_set > same Bug item attempts A→C (default-only) > IllegalTransition (typed set takes precedence for typed items)`.
- `resolve_rule_set > item with no issue_type > governed by default (issue_type=None) set`.
- `enforce_state_transition > workflow_status paused > not gated (allow) even with a matching restrictive rule`.
- `resolve_rule_set > workspace type not linked to project B (no ProjectIssueType) > type's rules never resolved for project-B item`.
- `enforce_state_transition > admin maintenance_bypass on an illegal move > allowed and an activity bypass entry is emitted`.

Contract `apps/api/plane/tests/contract/app/test_workflow_config.py` (`@pytest.mark.contract`+`@pytest.mark.django_db`):

- `workflow-config PATCH > as Admin sets enabled > 200 and persists`.
- `workflow-config PATCH > as Member > 403`.
- `workflow-config GET > returns current workflow_status scoped to project`.

**Implementation outline**
In `resolve_rule_set`: if the issue has a bound type and that type is linked via `ProjectIssueType` to the project, return the typed queryset (`issue_type=<type>`); else return the default queryset (`issue_type__isnull=True`). In `enforce_state_transition`, treat `paused`/`disabled` as non-gating. `maintenance_bypass` is an explicit kwarg the endpoint passes only for project admins; when set, skip enforcement and enqueue an issue activity entry naming the admin. `WorkflowConfigEndpoint` reads/writes `Project.workflow_status` with `@allow_permission([ROLE.ADMIN])`. Per-item bulk evaluation: each item resolves its own type set (covered if a bulk state path exists; otherwise N/A as in WF-T5).

**Acceptance criteria**

- Given Bug rule A→B and default A→C, When a Bug item attempts A→B Then allowed; A→C Then `IllegalTransition`.
- Given an untyped item, When it transitions, Then default set governs.
- Given `paused`, When any transition is attempted, Then not gated; rules remain listable/editable.
- Given an admin maintenance bypass on an illegal move, Then it succeeds and an activity entry records the admin + bypass.
- Authz/edge: a workspace type not linked to project B never resolves for project-B items; `workflow-config` writes are 403 for non-admins.

**Verify**

```
docker compose -f docker-compose-test.yml run --rm api-tests pytest plane/tests/unit/utils/test_rule_resolution_and_lifecycle.py plane/tests/contract/app/test_workflow_config.py -v
```

**Done when** typed resolution and lifecycle gating pass red→green, config endpoint is admin-only and project-scoped, and maintenance bypass is logged.

---

## WF-T9 — AI-suggested transition endpoint (rules-first, copilot-optional) + transition auto-assignment

**Implements** WF-6 (epic); FR8, AR (prompt minimization); edge "copilot unavailable → rules-only 200, never 500".
**Depends on** WF-T3, WF-T5, WF-T6, WF-T8.
**Risk tier** R1 (new public endpoint + transition side effect on the state-change path; rules-first deterministic fallback + kill switch).
**Worktree isolation** yes.

**Context**
Add `GET .../issues/<issue_id>/suggested-transition/` returning `{ to_state, confidence, source: "rules"|"ai" }` — the highest-ranked legal `to_state` from the item's resolved rule set (WF-T8 `resolve_rule_set` in `apps/api/plane/utils/workflow.py`) plus recent transition history. Copilot enrichment is optional: reuse the existing Gemini/Vertex copilot client already in the fork (grep `gemini`/`vertex`/`copilot` under `apps/api/plane/` to find the client; do NOT add a new ML dependency). If the copilot is unavailable or times out, return the rules-only result with `source:"rules"` and HTTP 200 — never 500. The AI path must send only state names, issue type, and recent transition history — never API keys, member emails (display names only), or full descriptions; and the system prompt / model id must never appear in the response. Auto-assignment: on a successful transition (WF-T5 apply path, and WF-T6 approval-apply path), apply the matched rule's `auto_assign_member`/`auto_assign_role` (WF-T1 fields) and emit a `Notification` (`apps/api/plane/bgtasks/notification_task.py`). An `auto_assign_member` must be an active `ProjectMember`; if not, skip assignment without corrupting the transition.

**Files**

- New: `apps/api/plane/app/views/workflow/suggestion.py` (`SuggestedTransitionEndpoint`).
- Edit: `apps/api/plane/app/urls/workflow.py` (`issues/<issue_id>/suggested-transition/`).
- Edit: `apps/api/plane/utils/workflow.py` (auto-assign application on the apply path; ranking helper `rank_legal_transitions`).
- New test: `apps/api/plane/tests/contract/app/test_suggested_transition.py` and `apps/api/plane/tests/unit/utils/test_auto_assign.py`.

**TDD — failing test first**
Contract `apps/api/plane/tests/contract/app/test_suggested_transition.py` (`@pytest.mark.contract`+`@pytest.mark.django_db`, copilot client mocked):

- `suggested-transition > legal targets B and C, copilot available > returns highest-ranked target with source:"ai" and a confidence`.
- `suggested-transition > copilot raises/times out > returns rules-only result source:"rules" 200, never 500, response contains no prompt or model id`.
- `suggested-transition > item has no legal next state from rules > returns nothing rankable (empty/null to_state) for the UI to hide the chip`.

Unit `apps/api/plane/tests/unit/utils/test_auto_assign.py` (`@pytest.mark.unit`+`@pytest.mark.django_db`):

- `auto-assign > rule A→B with auto_assign_member=X, allowed actor completes A→B > X assigned and gets a Notification`.
- `auto-assign > auto_assign_member is not an active ProjectMember > assignment skipped, transition still succeeds`.
- `auto-assign > approval-gated transition with auto-assign > assignment fires on the applied move after final approval, not on the pending request`.

**Implementation outline**
`rank_legal_transitions` returns legal `to_state`s from `resolve_rule_set` ordered by recent transition history frequency. The endpoint computes the rules-only top pick first (always), then attempts copilot enrichment inside a try/except with a timeout; on any failure return the rules-only result. Serialize only `{to_state, confidence, source}`. Auto-assign: in the WF-T5 apply path and the WF-T6 approval-apply path, after a successful move, if the matched rule has `auto_assign_member`/`auto_assign_role`, resolve to an active `ProjectMember`, assign, and enqueue a notification; guard so a missing/invalid member is a no-op (never rolls back the transition).

**Acceptance criteria**

- Given legal targets and an available copilot, When suggested-transition is called, Then highest-ranked target + `source:"ai"` + confidence.
- Given copilot unavailable/timeout, When called, Then rules-only `source:"rules"` 200, no prompt/model id leaked.
- Given no legal next state, When called, Then nothing rankable (chip hidden).
- Authz/edge: `auto_assign_member=X` on a completed A→B assigns X + notifies; invalid member ⇒ skip without corrupting transition; approval-gated auto-assign fires only on the applied move post-approval.

**Verify**

```
docker compose -f docker-compose-test.yml run --rm api-tests pytest plane/tests/contract/app/test_suggested_transition.py plane/tests/unit/utils/test_auto_assign.py -v
```

**Done when** suggestion degrades to rules-only with no leakage and auto-assignment fires safely on successful (incl. post-approval) moves.

---

## WF-T10 — `@plane/types` workflow types + `workflow.service.ts` + MobX `workflow.store.ts`

**Implements** WF-5 (epic); UX store/service layer; optimistic transition + rollback on 403/409.
**Depends on** WF-T5, WF-T6, WF-T8 (consumes those endpoints; can be built against their contracts).
**Risk tier** R2 (frontend; server is authoritative).
**Worktree isolation** yes.

**Context**
Add shared types, an API service, and a MobX store for workflows. Service files live in `packages/services` (follow the existing service module conventions there — grep for an existing `state.service.ts`/similar to copy the axios/base-client pattern). Store lives in `apps/web/core/store/workflow.store.ts` and must be registered in the root store (grep `apps/web/core/store/root.store.ts` or equivalent to wire it in). Shared types go in `@plane/types` (the `packages/types` package). The store holds `transitions`, `approvals`, and `workflowStatus` per project, and performs an optimistic transition that rolls back when the server returns 403/409. Endpoints to call (all under `workspaces/<slug>/projects/<project_id>/`): `workflow-transitions/` (CRUD), `issues/<id>/state-transition/`, `issues/<id>/approvals/`, `approvals/<id>/decision/`, `workflow-config/`, `issues/<id>/suggested-transition/`.

**Files**

- New: types in `packages/types` (e.g. `packages/types/src/workflow.d.ts`) + export from the package index.
- New: `packages/services/src/workflow.service.ts` (or the dir convention used by sibling services) + export.
- New: `apps/web/core/store/workflow.store.ts`.
- Edit: root store registration file.
- New test: `apps/web/core/store/workflow.store.test.ts`.

**TDD — failing test first**
Path `apps/web/core/store/workflow.store.test.ts` (vitest). Mock the service:

- `workflow.store > fetchTransitions > populates transitions for the project` — asserts store map keyed by project id.
- `workflow.store > optimistic transition > applies new state immediately then keeps it on 200`.
- `workflow.store > optimistic transition > rolls back to previous state when service rejects with 403`.
- `workflow.store > optimistic transition > rolls back when service rejects with 409`.
- `workflow.store > setWorkflowStatus > updates workflowStatus for the project`.

**Implementation outline**
Service: a class wrapping the shared API base client (copy a sibling service in `packages/services`), one method per endpoint, typed by the new `@plane/types`. Store: MobX `makeObservable`/`observable`/`action` (copy a sibling store in `apps/web/core/store`). Optimistic action: snapshot current `state_id`, set new state, call service; on rejection restore the snapshot and surface an error flag. Register the store in the root store constructor.

**Acceptance criteria**

- Given the service returns transitions, When `fetchTransitions` runs, Then the store holds them per project.
- Given an optimistic transition that the service rejects (403 or 409), When the promise rejects, Then the store restores the previous `state_id`.
- Authz/edge: the store never treats client state as authoritative — a server rejection always wins via rollback.

**Verify**

```
pnpm --filter web exec vitest run core/store/workflow.store.test.ts
pnpm turbo run check:types --filter=web
```

**Done when** store tests pass red→green, types compile, service + store are exported and root-registered.

---

## WF-T11 — CE component replacement: drag enforcement, state-option filtering, disabled overlay (flag-gated)

**Implements** WF-5 (epic); board drag enforcement; preserve disabled-overlay behavior when flag off.
**Depends on** WF-T10.
**Risk tier** R2 (frontend consumer; revertible by flag flip).
**Worktree isolation** yes.

**Context**
Replace the no-op CE stubs in `apps/web/ce/components/workflow/` with real, store-driven behavior, all gated by `isSelfHostedFeatureEnabled("workflows_approvals")` (`apps/web/ce/lib/self-host-entitlements.ts:33`; flag at line 27). Current stubs:

- `use-workflow-drag-n-drop.ts` — `useWorkFlowFDragNDrop(...)` returns `{ workflowDisabledSource: undefined, isWorkflowDropDisabled: false, getIsWorkflowWorkItemCreationDisabled: () => false, handleWorkFlowState: () => {} }`.
- `state-option.tsx` — accepts a `filterAvailableStateIds` prop but ignores it.
- `workflow-disabled-overlay.tsx`, `workflow-group-tree.tsx`, `workflow-disabled-message.tsx` — empty/no-op fragments.
- `index.ts` re-exports them.
  When the flag is false, every component must keep returning today's disabled-overlay/no-op behavior exactly (current behavior preserved). When true, they read legal targets from the workflow store (WF-T10) and enforce: drop disabled for illegal targets, state dropdown greys out illegal targets via `filterAvailableStateIds`, overlay shows the reason (e.g. "Moving to Done requires approval").

**Files**

- Edit: `apps/web/ce/components/workflow/use-workflow-drag-n-drop.ts`
- Edit: `apps/web/ce/components/workflow/state-option.tsx`
- Edit: `apps/web/ce/components/workflow/workflow-disabled-overlay.tsx`
- Edit: `apps/web/ce/components/workflow/workflow-group-tree.tsx`
- Edit: `apps/web/ce/components/workflow/workflow-disabled-message.tsx`
- New test: `apps/web/ce/components/workflow/workflow-enforcement.test.tsx`

**TDD — failing test first**
Path `apps/web/ce/components/workflow/workflow-enforcement.test.tsx` (vitest + React testing). Mock `isSelfHostedFeatureEnabled` and the workflow store:

- `state-option > flag false > renders all states selectable (current behavior preserved)`.
- `state-option > flag true, rule A→B only, item in A > C is greyed out via filterAvailableStateIds, B selectable`.
- `use-workflow-drag-n-drop > flag false > isWorkflowDropDisabled is false (no-op)`.
- `use-workflow-drag-n-drop > flag true, illegal target group > isWorkflowDropDisabled true and workflowDisabledSource set`.
- `workflow-disabled-overlay > flag true, approval-required target > renders the reason text`.

**Implementation outline**
Each component reads the flag first; if false, return the existing stub output unchanged. If true, pull legal target state ids for the current item from the workflow store (WF-T10) and compute `isWorkflowDropDisabled`/`getIsWorkflowWorkItemCreationDisabled`/`filterAvailableStateIds`. `state-option.tsx` must actually apply `filterAvailableStateIds` (disable/grey non-member ids). Keep `index.ts` exports stable.

**Acceptance criteria**

- Given flag false, When components render, Then disabled overlay + drag no-op (today's behavior).
- Given flag true + rule A→B (no A→C) + item in A, When the state dropdown renders, Then C is greyed and B selectable.
- Given flag true + an illegal drag target, Then drop disabled and overlay shows the reason.
- Authz/edge: client gating is presentation only; the server (WF-T5) remains authoritative.

**Verify**

```
pnpm --filter web exec vitest run ce/components/workflow/workflow-enforcement.test.tsx
pnpm turbo run check:types --filter=web
```

**Done when** flag-off preserves current behavior exactly, flag-on enforces via the store, and `filterAvailableStateIds` is honored.

---

## WF-T12 — Workflows settings sub-route: visual builder + lifecycle toggle + empty states

**Implements** WF-5 (epic); visual builder (per-state-group cards, issue-type selector, transition editor, live preview), lifecycle toggle, empty states.
**Depends on** WF-T10, WF-T11.
**Risk tier** R2 (frontend; revertible by commit/flag).
**Worktree isolation** yes.

**Context**
Add a new settings sub-route next to the existing states page. The states route is `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/projects/[projectId]/states/{page,header}.tsx` — reuse its `StateGroup` grouping and layout idioms. Build the workflows page at the sibling path. The page: card-based per-state-group layout; each state card lists outgoing transitions with allowed roles/members chips + an approval badge; clicking a transition opens an editor (allowed actors, approval toggle, fallback state picker, auto-assign member/role field); an issue-type selector at top scopes the rule set; a read-only live preview pane renders the resulting graph before save. Header has an enabled/paused lifecycle toggle (calls `workflow-config` via the WF-T10 store). Empty states: no rules → "Transitions are unrestricted. Add a rule to start governing this project."; paused → muted "Workflow paused — rules are not enforced." Use empty-state assets under `apps/web/app/assets/empty-state/project-settings`. UI primitives from `@plane/ui`, constants from `@plane/constants`. Gate the whole route behind `isSelfHostedFeatureEnabled("workflows_approvals")` (`apps/web/ce/lib/self-host-entitlements.ts`); when false, render the disabled overlay.

**Files**

- New: `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/projects/[projectId]/workflows/page.tsx`
- New: `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/projects/[projectId]/workflows/header.tsx`
- New: components under `apps/web/core/components/workflows/` (builder card, transition editor, live preview, lifecycle toggle, empty state) — split into small files (<300 lines each).
- New test: `apps/web/core/components/workflows/workflow-builder.test.tsx`

**TDD — failing test first**
Path `apps/web/core/components/workflows/workflow-builder.test.tsx` (vitest + React testing). Mock the workflow store (WF-T10) and the entitlement flag:

- `workflow builder > flag false > renders disabled overlay`.
- `workflow builder > flag true, no rules > renders the unrestricted empty state copy`.
- `workflow builder > flag true, workflow_status paused > renders the muted paused banner`.
- `workflow builder > issue-type selector changed > requests the typed rule set from the store`.
- `transition editor > toggling approval + picking fallback + saving > calls store create/update with the edited fields`.
- `live preview > shows the resulting graph read-only before save`.

**Implementation outline**
Reuse the states page's `StateGroup` grouping (`apps/web/app/.../states/page.tsx`) to render one card per group. Read transitions/`workflowStatus` from the WF-T10 store; the issue-type selector sets a store filter that re-fetches the typed set. The transition editor is a controlled form that calls store create/update actions. Live preview is a read-only render of the in-memory edited rule set. Lifecycle toggle calls the store's `setWorkflowStatus` (→ `workflow-config`). Use `@plane/ui` primitives and the empty-state asset pattern.

**Acceptance criteria**

- Given flag false, Then disabled overlay.
- Given flag true + no rules, Then unrestricted empty state; Given paused, Then muted paused banner.
- Given the issue-type selector changes, Then the typed rule set is requested.
- Given a transition edited (actors/approval/fallback/auto-assign) and saved, Then the store persists via the service; live preview renders read-only before save.
- Authz/edge: the page is presentation; all enforcement is server-side; admin-only writes are enforced by the backend (WF-T4/WF-T8), the UI surfaces errors on 403.

**Verify**

```
pnpm --filter web exec vitest run core/components/workflows/workflow-builder.test.tsx
pnpm turbo run check:types --filter=web
```

**Done when** builder tests pass red→green, the route is flag-gated, empty/paused states render, and the editor persists through the store.

---

## WF-T13 — Work-item approval banner + AI suggestion chip on the detail view

**Implements** WF-5 (epic, approval surface) + WF-6 (chip surface); approver-only actions; sanitized comment render.
**Depends on** WF-T10, WF-T6, WF-T9.
**Risk tier** R2 (frontend; revertible by flag/commit).
**Worktree isolation** yes.

**Context**
Add an inline "Approval pending" banner near the state selector on the work-item detail view, and a small AI suggestion chip near the state selector. The banner shows requester/target/fallback with Approve/Reject buttons visible only to approvers (a non-approver sees the banner without action buttons). It reuses existing notification components rather than introducing a new surface — grep `apps/web/core/components/` for the work-item detail state selector and the notification component to mount alongside. The chip calls `issues/<id>/suggested-transition/` via the WF-T10 store/service; it is hidden when the suggestion returns nothing rankable. Approval `comment` must be rendered through sanitized output only — never `dangerouslySetInnerHTML` on raw HTML (server already sanitizes in WF-T6; the client must not re-introduce raw injection). Everything gated by `isSelfHostedFeatureEnabled("workflows_approvals")`.

**Files**

- New: `apps/web/core/components/workflows/approval-banner.tsx`
- New: `apps/web/core/components/workflows/ai-suggestion-chip.tsx`
- Edit: the work-item detail state-selector container (grep `apps/web/core/components/issues/` for the detail-view state selector; mount banner + chip beside it).
- New test: `apps/web/core/components/workflows/approval-banner.test.tsx` and `apps/web/core/components/workflows/ai-suggestion-chip.test.tsx`

**TDD — failing test first**
`apps/web/core/components/workflows/approval-banner.test.tsx` (vitest + React testing):

- `approval banner > pending approval + approver viewer > shows requester/target/fallback with Approve/Reject`.
- `approval banner > pending approval + non-approver viewer > shows banner WITHOUT action buttons`.
- `approval banner > comment with markup > rendered via sanitized text, never dangerouslySetInnerHTML`.

`apps/web/core/components/workflows/ai-suggestion-chip.test.tsx`:

- `ai suggestion chip > suggestion returns a to_state > renders the chip, clicking accepts (calls store transition)`.
- `ai suggestion chip > suggestion returns nothing rankable > chip is hidden`.

**Implementation outline**
Banner reads the item's approvals from the WF-T10 store; renders Approve/Reject only when the current user is in the approver set; calls the store's decision action. Render `comment` as sanitized text/markdown component (no raw HTML injection). Chip calls the store's suggestion fetch on mount; if `to_state` is empty/null, render nothing; clicking invokes the optimistic transition action.

**Acceptance criteria**

- Given a pending approval, When an approver views, Then Approve/Reject + requester/target/fallback shown; When a non-approver views, Then banner without buttons.
- Given a suggestion with a target, Then chip renders and accepting triggers the transition; Given nothing rankable, Then chip hidden.
- Authz/edge: approver-only actions are presentation gating; the server (WF-T6) is authoritative; comment never rendered via `dangerouslySetInnerHTML` on raw HTML.

**Verify**

```
pnpm --filter web exec vitest run core/components/workflows/approval-banner.test.tsx core/components/workflows/ai-suggestion-chip.test.tsx
pnpm turbo run check:types --filter=web
```

**Done when** banner + chip tests pass red→green, approver-only actions gate correctly, comment renders sanitized, and the chip hides on empty suggestions.

---

## Execution order & parallelism

Dependency graph (text):

```
WF-T1 (models + migration)
 ├─> WF-T2 (serializers + admin)
 └─> WF-T3 (enforce_state_transition core)
        ├─> WF-T4 (transition CRUD viewset)         [also needs WF-T2]
        │     ├─> WF-T5 (state-transition + seam)   [needs WF-T3]
        │     │     ├─> WF-T6 (approvals + notify)  [needs WF-T1, WF-T3]
        │     │     ├─> WF-T7 (api-key v1 mirror)   [needs WF-T4]
        │     │     └─> WF-T8 (typed resolution + lifecycle) [needs WF-T3, WF-T4]
        │     │           └─> WF-T9 (AI suggest + auto-assign) [needs WF-T3,5,6,8]
        ▼
Frontend (consume backend contracts):
WF-T10 (types + service + store)   [needs WF-T5, WF-T6, WF-T8 contracts]
 ├─> WF-T11 (CE component replacement)             [needs WF-T10]
 │     └─> WF-T12 (visual builder route)           [needs WF-T10, WF-T11]
 └─> WF-T13 (approval banner + AI chip)            [needs WF-T10, WF-T6, WF-T9]
```

Parallel batches (each task in its own worktree):

- **Batch 1 (foundation, serial start):** WF-T1. Must land first (everything depends on the schema).
- **Batch 2 (parallel after WF-T1):** WF-T2 (serializers/admin) ∥ WF-T3 (enforcement core). No shared files (serializers vs `utils/workflow.py`).
- **Batch 3 (after WF-T2 + WF-T3):** WF-T4 (transition CRUD viewset).
- **Batch 4 (after WF-T4 + WF-T3):** WF-T5 (state-transition + seam).
- **Batch 5 (parallel after WF-T5):** WF-T6 (approvals) ∥ WF-T7 (api-key v1) ∥ WF-T8 (typed resolution + lifecycle). WF-T6 and WF-T8 both edit `apps/api/plane/utils/workflow.py` and `apps/web`-free backend files — run them in separate worktrees but **merge sequentially** (WF-T8 then WF-T6, or rebase the second) to avoid a conflict in `utils/workflow.py` and `views/workflow/base.py`; WF-T7 touches only `apps/api/plane/api/**` and is conflict-free.
- **Batch 6 (after WF-T6 + WF-T8):** WF-T9 (AI suggestion + auto-assignment).
- **Batch 7 (frontend, can begin against contracts once WF-T5/T6/T8 are merged):** WF-T10 (types + service + store) first, then in parallel **WF-T11 ∥ WF-T13** (different component files), then **WF-T12** (depends on WF-T11's CE components). WF-T13 additionally depends on WF-T9's suggestion endpoint for the chip's live path (mock-tested earlier, real-wired here).

Notes for the orchestrator: backend Batches 1–6 and frontend Batch 7 are decoupled by API contract — frontend worktrees can start as soon as the relevant backend endpoints' contracts are fixed (WF-T5/T6/T8), using mocked services in tests, and only need the real backend merged before final `verify`. The two `utils/workflow.py` editors (WF-T6, WF-T8, WF-T9) are the only backend serialization point; sequence them WF-T8 → WF-T6 → WF-T9 to minimize rebases.
