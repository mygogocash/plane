# Epics & Initiatives PRD — Self-Host Parity

## Executive Summary

Plane markets Epics (work-item bundles with lead, timeline, progress, custom properties, cross-project duplication, and conversion) and Initiatives (workspace-level aggregation of epics + projects with five lifecycle states, automatic progress rollup, threaded status updates, and multi-format visualization). This fork has the structural primitives — `IssueType.is_epic`, `Issue.parent` hierarchy, the full layout stack (list/kanban/calendar/gantt/spreadsheet), cycles, and intake — but the Epic management UI is a stub, there is no Initiative model/API at all, and structured status updates (On Track / At Risk / Off Track) do not exist as a first-class type.

This PRD scopes only the **PARTIAL** and **MISSING** capabilities. It does not rebuild the visualization layouts, cycle integration, or intake (all PRESENT). The strategy follows `spec.md`: unlock CE-present primitives, build open first-party equivalents for the missing commercial pieces (Initiatives, structured status updates, epic NLQ), and gate everything behind self-host entitlement flags that default on only when fully functional. No proprietary Plane EE source is copied. AI NLQ runs exclusively through the already-configured self-host LLM provider used by `copilot.py` (Vertex/OpenAI-compatible), failing closed when unconfigured.

## Current State in Fork

- **Epic primitive (PARTIAL).** `IssueType.is_epic` exists (`apps/api/plane/db/models/issue_type.py:19`). Epics are Issues whose type is an epic; `Issue.parent` (`apps/api/plane/db/models/issue.py:114-120`) provides the bundling hierarchy. The frontend modal is an empty stub returning `<></>` (`apps/web/ce/components/epics/epic-modal/modal.tsx:24-26`). The epic issue store is non-functional (`@ts-nocheck`, "this class will never be used", `apps/web/ce/store/issue/epic/issue.store.ts`). Epic empty-state assets exist (`apps/web/app/assets/empty-state/epics`) but no route mounts them.
- **Layouts (PRESENT, reusable).** List, kanban, calendar, gantt, and spreadsheet layouts plus the timeline store (`apps/web/ce/store/timeline/base-timeline.store.ts`) are implemented for projects and cycles and can be parameterized for epics once the store is real.
- **Initiatives (MISSING).** No model in `apps/api/plane/db/models/`. The slug `"initiatives"` is reserved (`apps/api/plane/utils/constants.py:47` in `RESTRICTED_WORKSPACE_SLUGS`) but has no implementation. Workspace-level aggregation exists only for cycles (`apps/api/plane/app/views/workspace/cycle.py`, `WorkspaceCyclesEndpoint`), which is the proven pattern to copy.
- **Threaded collaboration (PARTIAL).** `IssueComment` supports nested replies via `parent` self-FK `related_name="parent_issue_comment"` and tracks `comment_html`/`comment_stripped`/`comment_json`. `IssueReaction` and `CommentReaction` support emoji. No `StatusUpdate` model with On Track / At Risk / Off Track semantics.
- **AI (MISSING NLQ).** `apps/api/plane/app/views/copilot.py` has a working LLM pipeline (`COPILOT_MODES`, evidence gathering, `get_llm_config`/`get_vertex_ai_config`/`is_llm_configured`) but no epic/initiative-scoped natural-language query or progress-summary endpoint.
- **Entitlements.** `apps/web/ce/lib/self-host-entitlements.ts` exposes `SELF_HOSTED_FEATURE_FLAGS` but has no `epics` or `initiatives` keys.
- **Custom properties.** No `IssueProperty`/`IssuePropertyValue` model is present in this CE tree, so epic custom properties (text/dropdown/member) must be built as an open first-party model.

## Gap to Close

- Epic management UI: functional create/update modal, real epic MobX store, an epic list route per project, lead assignment, timeline (start/target), progress monitoring, bulk-attach of work items, and conversion epic↔standard work item.
- Epic custom properties: text, dropdown (single/multi option), and member field types scoped to the epic work-item type.
- Cross-project / cross-workspace epic duplication.
- Initiatives: new model + API + workspace-aggregation view; five lifecycle states (Drafts, Planned, Active, Completed, Closed); membership of epics and projects; automatic progress rollup (work items → epics → initiatives); list/board/timeline views reusing existing layouts.
- Structured status updates: first-class `StatusUpdate` (On Track / At Risk / Off Track) attachable to epics and initiatives, with threaded replies and emoji reactions reusing existing reaction infra.
- AI NLQ: a self-host endpoint answering scope/blockers/ownership/status questions and auto-generating progress summaries across the hierarchy, reusing the `copilot.py` provider abstraction.
- Entitlement wiring: `epics` and `initiatives` flags, defaulting on only when each surface is functional.

## Goals / Non-Goals

**Goals**
- Ship a working epic management experience (CRUD, lead, timeline, progress, properties, bulk-attach, conversion, duplication) reusing the issue infrastructure.
- Deliver open Initiatives with lifecycle states and automatic progress rollup across the workspace.
- Add structured status updates and AI NLQ that run entirely on self-host infrastructure.
- Keep every read/write workspace- and project-scoped with server-side role checks.
- Provide forward + rollback migrations and feature-flag kill switches per milestone.

**Non-Goals**
- Do not rebuild list/board/timeline/calendar/spreadsheet layouts, cycle integration, or intake (PRESENT).
- Do not copy proprietary Plane Commercial source.
- Do not build Teamspaces here (separate spec.md Milestone 5 track); initiative aggregation must not assume teamspace membership and must degrade to workspace/project scoping.
- Do not introduce external billing or Plane Cloud dependencies; AI must not require Plane Cloud credentials.
- No general-purpose custom-property framework beyond the epic-scoped types this PRD demands.

## Requirements

**Functional**
- Epics are project-scoped Issues of an `is_epic` IssueType. Per `spec.md` UX, epics are toggled per project via project settings (reuse existing project-feature toggle; gate behind `epics` entitlement).
- Epic CRUD: create/update via a working modal; lead = a dedicated assignee; timeline = `start_date`/`target_date`; progress = rollup of child work-item states.
- Bulk-attach: assign N work items to an epic in one request (set `parent`), enforcing "one epic per work item" (a work item's parent epic is single-valued).
- Conversion: convert an epic to a standard work item (flip type to default non-epic; detach children to grandparent or null per policy) and vice-versa, via dedicated endpoints, recorded in issue activity.
- Duplication: duplicate an epic (and optionally its subtree) into another project or workspace, remapping states/labels/members with graceful fallback when targets are missing (mirrors `spec.md` template-cloning edge cases).
- Custom properties: an epic IssueType may define properties of type `text`, `option` (dropdown, single/multi), and `member`; values are stored per epic and editable in the detail view.
- Initiatives: workspace-scoped; aggregate any set of epics and projects; one of five `state` values; progress computed from member epics and projects; list/board/timeline views with filtering/grouping by lead, state, labels, dates; filters persist across view switches.
- Status updates: create On Track / At Risk / Off Track updates on an epic or initiative, with rich-text body, threaded replies, and emoji reactions.
- AI NLQ: accept a natural-language question scoped to an epic or initiative (or workspace), return an answer grounded in retrieved evidence plus an auto-generated progress summary; never echo secrets or other workspaces' data.

**Authorization / multi-tenant**
- All epic endpoints scope by `slug` (workspace) + `project_id`; reuse existing project role gating (`allow_permission` / project member checks) — epic create/update/delete requires project member with edit role; read requires project viewer.
- Initiative endpoints scope by `slug` only and require workspace membership; create/update/delete requires workspace Admin or Member role; read requires Workspace Viewer (mirror `WorkspaceCyclesEndpoint`'s `WorkspaceViewerPermission`).
- An initiative may only reference epics/projects in the same workspace, validated server-side.
- Status update authorship requires membership of the owning epic's project / initiative's workspace.
- AI NLQ requires the same scope membership as reading the target object; the evidence set must be filtered to objects the caller can read.
- v1 (api-key) routes must enforce the same role checks as session routes.

## Data Models

All models extend the existing base mixins (`ProjectBaseModel` for project-scoped, `BaseModel` for workspace-scoped) and inherit soft-delete (`deleted_at`).

**Reuse (no new model needed)**
- Epics: continue to use `Issue` + `IssueType(is_epic=True)` + `Issue.parent`. No epic table; epic-ness is the type. Lead = existing assignee; timeline = existing `start_date`/`target_date`.
- Status update reactions: reuse `IssueReaction`/`CommentReaction` patterns via a generic reaction or a new `StatusUpdateReaction` (see below).

**New: `IssueProperty` (epic custom properties)** — `apps/api/plane/db/models/issue_property.py`
- `issue_type` FK → `db.IssueType` (`related_name="properties"`); `workspace` FK; `name`, `display_name`, `description`; `property_type` (`text`/`option`/`member`); `is_multi` bool; `is_required` bool; `sort_order` float; `settings` JSON; `external_source`/`external_id`.
- `IssuePropertyOption`: FK → `IssueProperty`, `name`, `sort_order`, `is_default`.
- `IssuePropertyValue`: FK → `Issue`, FK → `IssueProperty`; `value_text` TextField, `value_option` FK → `IssuePropertyOption` (null), `value_uuid` (member id, null). Unique per (issue, property, value) where `deleted_at` is null.

**New: `Initiative`** — `apps/api/plane/db/models/initiative.py`
- Extends `BaseModel`; `workspace` FK (`related_name="initiatives"`); `name`, `description`/`description_html`/`description_stripped`/`description_json`; `lead` FK → AUTH_USER_MODEL (null); `start_date`/`end_date` (null); `state` CharField with choices `DRAFT`/`PLANNED`/`ACTIVE`/`COMPLETED`/`CLOSED` (default `DRAFT`); `sort_order` float; `logo_props` JSON; `progress_snapshot` JSON (cache); `external_source`/`external_id`.
- `InitiativeEpic`: FK → `Initiative`, FK → `Issue` (must be `is_epic` type), unique-when-not-deleted.
- `InitiativeProject`: FK → `Initiative`, FK → `Project`, unique-when-not-deleted.
- `InitiativeLabel`: FK → `Initiative`, FK → `Label` (workspace-scoped labels), for grouping/filtering.

**New: `StatusUpdate`** — `apps/api/plane/db/models/status_update.py`
- Extends `BaseModel`; `workspace` FK; nullable `epic` FK → `Issue` and nullable `initiative` FK → `Initiative` (exactly one set, enforced by `CheckConstraint`); `status` CharField choices `ON_TRACK`/`AT_RISK`/`OFF_TRACK`; `comment_html`/`comment_stripped`/`comment_json`; `parent` self-FK (`related_name="replies"`) for threading; `actor` FK.
- `StatusUpdateReaction`: FK → `StatusUpdate`, `actor` FK, `reaction` Text; unique-when-not-deleted (mirror `CommentReaction`).

**Migration notes**
- Forward: each model ships an additive migration creating new tables/columns only; no alteration to `issues`, `issue_comments`, or `issue_types` schema (epic-ness already exists). Add `CheckConstraint` on `StatusUpdate` for the epic XOR initiative invariant and `UniqueConstraint(... condition=Q(deleted_at__isnull=True))` for join tables, matching existing project-issue-type constraint style.
- Rollback: migrations are reverse-safe (`migrate <app> <prev>`); because all changes are additive new tables, reverse drops them with zero impact on existing issue data. `IssuePropertyValue` references existing issues by FK only — dropping it does not touch issue rows.
- The reserved `"initiatives"` slug already protects the route namespace; no constants change required.

## API Contracts

Session routes under `/api/...` (no version segment, matching existing app urls); api-key routes under `/api/v1/...`. All paths scope by `slug` / `project_id` consistently with `apps/api/plane/app/urls/cycle.py`.

**Epics (session)** — `apps/api/plane/app/urls/epic.py`
- `GET|POST /api/workspaces/<slug>/projects/<project_id>/epics/` — list/create epics (Issues filtered to `is_epic` type).
- `GET|PATCH|DELETE /api/workspaces/<slug>/projects/<project_id>/epics/<pk>/`.
- `GET /api/workspaces/<slug>/projects/<project_id>/epics/<epic_id>/progress/` — rollup snapshot (counts by state group, percent complete).
- `POST /api/workspaces/<slug>/projects/<project_id>/epics/<epic_id>/work-items/` — bulk-attach work items (`{ "issue_ids": [...] }`), sets `parent`, enforces one-epic-per-item.
- `POST /api/workspaces/<slug>/projects/<project_id>/epics/<epic_id>/convert/` — convert to standard work item (`{ "target_issue_type_id": ... }`).
- `POST /api/workspaces/<slug>/projects/<project_id>/work-items/<issue_id>/convert-to-epic/`.
- `POST /api/workspaces/<slug>/projects/<project_id>/epics/<epic_id>/duplicate/` — body `{ "target_project_id"?, "target_workspace_slug"?, "include_subtree": bool }`.
- Epic property CRUD: `GET|POST /api/workspaces/<slug>/issue-types/<type_id>/properties/`, `.../properties/<pk>/`, `.../properties/<pk>/options/`; values at `/api/workspaces/<slug>/projects/<project_id>/epics/<epic_id>/property-values/`.

**Initiatives (session)** — `apps/api/plane/app/urls/initiative.py`
- `GET|POST /api/workspaces/<slug>/initiatives/`; `GET|PATCH|DELETE /api/workspaces/<slug>/initiatives/<pk>/`.
- `POST|DELETE /api/workspaces/<slug>/initiatives/<initiative_id>/epics/` and `.../projects/` — attach/detach members.
- `GET /api/workspaces/<slug>/initiatives/<initiative_id>/progress/` — aggregated rollup across member epics + projects (annotate-based, mirroring `WorkspaceCyclesEndpoint`).
- `GET /api/workspaces/<slug>/initiatives-summary/` — workspace aggregation list with progress annotations and lifecycle-state grouping.

**Status updates (session)**
- `GET|POST /api/workspaces/<slug>/projects/<project_id>/epics/<epic_id>/status-updates/` and `GET|PATCH|DELETE .../status-updates/<pk>/`.
- `GET|POST /api/workspaces/<slug>/initiatives/<initiative_id>/status-updates/`.
- `POST|DELETE .../status-updates/<status_update_id>/reactions/`.

**AI NLQ (session)** — extends copilot routing
- `POST /api/workspaces/<slug>/copilot/query/` — body `{ "scope": "epic"|"initiative"|"workspace", "object_id": uuid?, "question": str }`. Returns `{ "answer", "summary", "evidence": [...] }`. Reuses `is_llm_configured`/`get_llm_config`; returns `409`/feature-disabled when no provider configured (fail closed). Evidence retrieval is filtered to caller-readable objects only.

**api-key parity (v1)** — `apps/api/plane/api/urls/epic.py`, `initiative.py`
- `GET|POST /api/v1/workspaces/<slug>/projects/<project_id>/epics/` and detail; `GET|POST /api/v1/workspaces/<slug>/initiatives/` and detail; same role enforcement. No AI NLQ exposed over v1 in this milestone.

**Response envelope:** follow existing Plane DRF serializer/paginator conventions (paginated list with `results`/`count`/grouped responses as cycles use), not a custom envelope.

## UX / UI Alignment

**Entitlement wiring** (`apps/web/ce/lib/self-host-entitlements.ts`)
- Add `epics: true` and `initiatives: true` to `SELF_HOSTED_FEATURE_FLAGS`, with the `TSelfHostedFeatureFlag` type picking them up automatically. Default each to `true` only after its surface is functional; ship behind a temporary `false` during the building milestone, flip in the milestone that completes the surface. Add Vitest coverage in `self-host-entitlements.test.ts` asserting both flags resolve via `isSelfHostedFeatureEnabled`.

**Epics**
- Replace the stub `apps/web/ce/components/epics/epic-modal/modal.tsx` with a real create/update modal built on the existing issue-create form components (project selector honoring `isProjectSelectionDisabled`, name, lead, description editor, start/target date, custom-property fields).
- Implement the epic store: rewrite `apps/web/ce/store/issue/epic/issue.store.ts` removing `@ts-nocheck`, backed by a real `EpicService` in `packages/services`. Wire `apps/web/ce/store/issue/epic/filter.store.ts` for persisted filters across layout switches.
- Add a project epics route: `apps/web/app/(all)/[workspaceSlug]/(projects)/projects/[projectId]/epics/` mounting the existing list/board(kanban)/timeline(gantt) layouts via the timeline store. Epic detail view shows the bundled work items as cards, a bulk-attach interface, a progress card, the status-update thread, and the convert action.
- Empty state: reuse `apps/web/app/assets/empty-state/epics` assets; render "Enable epics in project settings" CTA gated on the `epics` entitlement.

**Initiatives**
- New top-level workspace route: `apps/web/app/(all)/[workspaceSlug]/(projects)/initiatives/` (slug already reserved server-side). List/board/timeline layouts; board columns = the five lifecycle states; timeline zoom week/month/quarter reusing the timeline store; filtering/grouping by lead/state/labels/dates persisted across view switches.
- Initiative detail: card-based progress display (rollup from epics + projects), members panel (attach epics/projects), threaded status-update section with On Track / At Risk / Off Track chips and emoji reactions.
- New MobX initiative store under `apps/web/ce/store/initiative/` + `InitiativeService` in `packages/services`; types in `packages/types`; lifecycle-state and status labels in `packages/constants`/`packages/i18n`.
- Empty state: "Create your first initiative" with workspace-scoped CTA gated on `initiatives` entitlement.

**AI NLQ**
- Add a query affordance in epic and initiative detail headers (a "Ask AI / Summarize progress" action) wired to `/api/workspaces/<slug>/copilot/query/`. When the provider is unconfigured, show a disabled state with a "configure AI provider" hint rather than an error toast.

## Security

- Least-privilege: epic write requires project edit role; initiative write requires workspace Admin/Member; reads require the matching viewer role. Reuse `allow_permission`/`ROLE` and `WorkspaceViewerPermission` rather than ad-hoc checks.
- Multi-tenant isolation: every queryset filters by `workspace__slug` (and `project_id` for epics). Initiative member-attach validates that epics/projects belong to the same workspace; reject cross-workspace references with `400`.
- Rich text: sanitize `description_html`/`comment_html` for epics, initiatives, and status updates using the same strip/sanitize path as `IssueComment` (`strip_tags` for `_stripped`, server-side HTML sanitization before persist) to prevent stored XSS.
- Signed URLs: any epic/initiative attachments reuse the existing private-asset signed-URL flow; no public exposure. Space/public API must not surface initiatives, status updates, or NLQ.
- AI: NLQ evidence is built only from caller-readable objects; prompts must never include API keys, tokens, or other workspaces' data. Do not log raw prompts/responses containing secrets (per spec.md security). Fail closed to non-AI workflows when provider config is absent.
- Duplication: when copying across workspaces, re-resolve members/labels/states in the target tenant — never carry source-tenant IDs into another workspace.

## Edge Cases

- Work item already parented to another epic during bulk-attach (one-epic-per-item): reject or reparent per explicit request flag; default reject with a clear error.
- Converting an epic that has children: choose policy (reparent children to epic's parent, or orphan to null) and record in activity; block silent data loss.
- Cross-workspace duplication with missing target states/labels/members: fall back to target defaults, report a remap summary (mirrors spec.md template-clone edge case).
- Initiative referencing an epic that is later converted to a standard work item or deleted: progress rollup must skip non-epic/deleted members; `InitiativeEpic` soft-deletes cascade-clean.
- Progress rollup with zero work items: report 0% without divide-by-zero.
- StatusUpdate with both epic and initiative set, or neither: blocked by `CheckConstraint`.
- Lifecycle-state transitions (e.g., Closed → Active) — allow but log; no enforced workflow in this milestone.
- AI provider outage / quota exhaustion: return graceful 503-style "AI unavailable", never block manual viewing.
- Old workspaces created before the `initiatives` slug reservation: validate none collide; the slug is already in `RESTRICTED_WORKSPACE_SLUGS`.
- Concurrent edits to initiative membership while another session has the detail view open: last-write-wins with refetch on conflict.

## Testing Strategy

TDD per spec.md (RED → GREEN → REFACTOR); write the failing test first for every behavior.

- **API contract tests (pytest, ~70%/primary):** epic CRUD + authorization (viewer cannot write, non-member 403, cross-workspace 400); bulk-attach enforcing one-epic-per-item; convert epic↔work-item with child-reparenting; duplication remap across project/workspace; initiative CRUD + `WorkspaceViewer` gating; initiative member-attach rejecting cross-workspace refs; progress rollup math (counts by state group, 0-item case); StatusUpdate XOR constraint and reaction uniqueness; NLQ scope filtering (evidence excludes unreadable objects) and fail-closed when `is_llm_configured` is false.
- **Frontend gating tests (Vitest):** `self-host-entitlements.test.ts` asserts `epics`/`initiatives` flags resolve; epic modal renders fields and submits; initiative board renders five lifecycle columns; routes hidden when entitlement off; empty states render.
- **Migration checks:** run forward + reverse migrations on the Docker test stack; assert additive-only (no destructive ops on `issues`/`issue_comments`/`issue_types`); verify `CheckConstraint` and partial unique constraints apply.
- **Type/lint/format:** mypy/ruff/black for touched API modules; `tsc`/eslint for touched web packages.
- **Smoke:** post-GKE rollout, hit `GET https://app.manut.xyz/api/instances/` and a new `GET /api/workspaces/<slug>/initiatives/` happy path per spec.md.

## Milestones

Each milestone is one focused commit with its own rollback.

1. **M1 — Epic store + modal (frontend foundation).** Replace modal stub, implement real epic store/service/filter, add project epics route reusing existing layouts. Flag `epics` stays `false` until M2. *Rollback:* revert commit; stub restored; no schema change.
2. **M2 — Epic backend: progress, bulk-attach, convert, duplicate.** Add session + v1 endpoints, serializers, authorization, activity logging. Flip `epics` flag `true`. *Rollback:* revert routes + set flag `false`; no schema migration to reverse (uses existing Issue tables).
3. **M3 — Epic custom properties.** Add `IssueProperty`/`IssuePropertyOption`/`IssuePropertyValue` models + migration + API + detail-view fields. *Rollback:* reverse migration drops new tables; revert UI.
4. **M4 — Initiatives model + API + aggregation.** Add `Initiative` + join tables + migration; CRUD, member-attach, progress, workspace-summary endpoints (mirror `WorkspaceCyclesEndpoint`). *Rollback:* reverse migration (additive tables only); revert routes.
5. **M5 — Initiatives UI.** Store/service/types/constants, initiatives route, list/board/timeline, detail with progress + members. Flip `initiatives` flag `true`. *Rollback:* set flag `false`; revert UI commit.
6. **M6 — Structured status updates.** `StatusUpdate` + `StatusUpdateReaction` models/migration/API; threaded UI with On Track/At Risk/Off Track + reactions on epics and initiatives. *Rollback:* reverse migration; revert UI.
7. **M7 — AI NLQ.** `/copilot/query/` endpoint reusing provider abstraction; epic/initiative "Ask AI / Summarize" affordance; fail-closed behavior. *Rollback:* disable AI feature flag; remove route; manual workflows unaffected.

## Rollback Plan

- Frontend-only milestones (M1, M5 UI, M6 UI) roll back by reverting the milestone commit and redeploying the web image; entitlement flags (`epics`, `initiatives`) act as instant kill switches without redeploy.
- Schema milestones (M3, M4, M6) ship additive new tables only; reverse migrations (`migrate <app> <prev>`) drop them with zero impact on existing issue/comment data. Reverse migrations are reviewed before deploy per spec.md.
- AI (M7) fails closed to non-AI workflows; disable the AI feature flag to remove the surface.
- Production rollback uses a prior immutable Artifact Registry `preview-<short_sha>` tag or GKE rollout history, per spec.md. No Railway path is valid.

## Risk Tier

**R1 overall.** New API contracts (epics, initiatives, status updates, NLQ) and three additive schema migrations are costly-to-reverse changes that must be announced, logged, and ship with reviewed reverse migrations and rollback paths — exactly the R1 definition. They are not R0 because migrations are additive-only (no destructive change to existing `issues`/`issue_comments`/`issue_types`), every surface is behind a feature flag that fails closed, and AI degrades safely. Individual sub-steps vary: the entitlement-flag wiring and frontend store/modal work are R2 (reversible with green tests and a flag flip); the epic↔work-item conversion and cross-workspace duplication paths touch hierarchy/tenant data and must be treated R1 with full test coverage on the conversion/remap logic before merge — any conversion path lacking test coverage is automatically R0 and must stop for explicit sign-off.
