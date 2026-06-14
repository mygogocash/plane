# Epics & Initiatives — Design (plane.so alignment)

> Annotated-screenshot design spec. Each reference screen pairs the user's plane.so screenshot with a behavior table (`UI element | plane.so behavior | Fork status | Required change`) and an implementation mapping into this fork. Grounded in `docs/prd-epics-initiatives-2026-06-07.md` and verified against the tree: the epic modal is a stub returning `<></>` (`apps/web/ce/components/epics/epic-modal/modal.tsx:25-27`), the epic store is `@ts-nocheck` dead code (`apps/web/ce/store/issue/epic/issue.store.ts`), `SELF_HOSTED_FEATURE_FLAGS` has no `epics`/`initiatives` keys (`apps/web/ce/lib/self-host-entitlements.ts`), routes are React Router 7 flat-config in `apps/web/app/routes/core.ts`, the proven workspace-aggregation pattern is `WorkspaceCyclesEndpoint` + `WorkspaceViewerPermission` (`apps/api/plane/app/views/workspace/cycle.py:20-21`), and the AI provider abstraction is `is_llm_configured`/`get_llm_config` in `apps/api/plane/app/views/copilot.py`.

**Status legend** — PRESENT (reusable as-is), PARTIAL (primitive exists, surface stubbed/missing), MISSING (no model/route/UI).

**Fork path conventions** — backend `apps/api/plane/{db,app,api}`; frontend `apps/web/{core,ce}`; shared `@plane/{types,services,ui,constants,i18n}`; entitlement gate `apps/web/ce/lib/self-host-entitlements.ts`; routes registered in `apps/web/app/routes/core.ts`.

---

## Reference: plane.so — Settings ▸ Features (Initiatives, Teamspaces, Epics)

> The user's screenshot shows the workspace **Settings ▸ Features** panel: a vertical list of feature rows, each with an icon, a bold title, a one-line description, and a right-aligned toggle. Visible rows include **Initiatives** ("Group projects and epics under company-level goals"), **Teamspaces** ("Organize teams and their work"), and **Epics** ("Bundle work items that span multiple cycles"). Each toggle is a pill switch; some rows carry a small "Pro"/upgrade affordance on plane.so cloud.

| UI element | plane.so behavior | Fork status | Required change |
|---|---|---|---|
| Feature list container | Workspace settings surface listing toggleable capabilities | PARTIAL — settings features list exists (`apps/web/core/components/project/settings/features-list.tsx`) but is project-scoped; no workspace Initiatives row | Add Initiatives row to the workspace features surface; keep Epics on the per-project features list per PRD §Requirements |
| **Epics** toggle | Project-level on/off; when on, exposes an Epics tab in project nav | PARTIAL — `IssueType.is_epic` primitive present; no toggle binding, no route mounts the empty-state assets in `apps/web/app/assets/empty-state/epics` | Reuse existing project-feature toggle (`apps/web/core/components/project/project-feature-update.tsx`), gate behind `epics` entitlement flag |
| **Initiatives** toggle | Workspace-level on/off; gates the top-level Initiatives nav entry | MISSING — no model, no API, no nav entry; slug `"initiatives"` reserved (`apps/api/plane/utils/constants.py:47`) | Add workspace-scoped toggle gated behind `initiatives` entitlement flag |
| **Teamspaces** row | Cross-team grouping | PRESENT but out of scope — `teamspaces: true` already in `SELF_HOSTED_FEATURE_FLAGS` | No change; initiative aggregation must NOT assume teamspace membership (PRD Non-Goals) and must degrade to workspace/project scope |
| "Pro"/upgrade affordance | Cloud paid-plan upsell | N/A on self-host | Self-host shows no upsell; `SELF_HOSTED_PAID_FEATURES_ENABLED = true` already suppresses paid-plan gating. Flags default `false` during build milestone, flip `true` only when surface is functional (PRD UX §Entitlement wiring) |
| Toggle persistence | Toggle state persisted server-side; reflected on reload | PARTIAL — project-feature persistence exists for cycles/modules | Epics reuse existing project-feature persistence; Initiatives toggle is an entitlement-flag read (no per-workspace persisted setting in M1–M5) |

**Implementation mapping**

- **Entitlement wiring** (`apps/web/ce/lib/self-host-entitlements.ts`): add `epics: false` and `initiatives: false` to the `SELF_HOSTED_FEATURE_FLAGS` object literal. `TSelfHostedFeatureFlag = keyof typeof SELF_HOSTED_FEATURE_FLAGS` picks both keys up automatically; `isSelfHostedFeatureEnabled(feature)` reads them with no signature change. Flip `epics → true` in M2 (when backend endpoints land), `initiatives → true` in M5 (when UI completes), per PRD Milestones.
- **Tests** (`apps/web/ce/lib/self-host-entitlements.test.ts`, Vitest, TDD-first): `isSelfHostedFeatureEnabled > given "epics" flag > then resolves to its configured value`; same for `"initiatives"`. RED first (keys absent), GREEN after adding keys.
- **Project features surface** (`apps/web/core/components/project/settings/features-list.tsx`, `project-feature-update.tsx`): render the Epics row only when `isSelfHostedFeatureEnabled("epics")`; bind toggle to the existing project-feature persistence path used by cycles/modules.
- **Workspace features surface**: render the Initiatives row gated on `isSelfHostedFeatureEnabled("initiatives")`.
- **Empty / loading / error**: feature panel is synchronous client config — no loading state. If an entitlement read throws (it cannot, it is a plain object access), default closed (feature hidden).
- **Responsive**: feature rows stack vertically; toggle stays right-aligned at ≥640px, wraps under the description on narrow viewports — reuse existing features-list responsive rules.
- **a11y**: each toggle is `role="switch"` with `aria-checked` and an `aria-label` naming the feature; description linked via `aria-describedby`; keyboard-operable (Space/Enter) — inherit from the existing toggle component in `@plane/ui`.

---

## Reference: plane.so — Initiatives (cross-project grouping, lifecycle + progress rollup)

> The user's screenshot shows the **Initiatives** workspace surface: a header with the initiative name, a **state chip** (one of Draft / Planned / Active / Completed / Closed), a **lead avatar**, and a date range. The main area offers **List / Board / Timeline** layout switchers. In **Board** view, columns map to the five lifecycle states with initiative cards beneath each. Each card shows a **progress bar** (rolled up from member epics + projects), label pills, and counts of attached epics/projects. A right-rail or detail panel lists **member epics and projects** with an attach control, plus a **status-update thread** (On Track / At Risk / Off Track chips with emoji reactions).

| UI element | plane.so behavior | Fork status | Required change |
|---|---|---|---|
| Top-level Initiatives nav + route | Workspace-scoped surface at `/<slug>/initiatives` | MISSING — no route, no nav entry; slug reserved server-side | New route + nav entry gated on `initiatives` flag |
| List / Board / Timeline switcher | Same layout stack as projects/cycles | PRESENT — list/kanban/gantt layouts + timeline store (`apps/web/ce/store/timeline/base-timeline.store.ts`) reusable | Parameterize layouts for the Initiative entity; do NOT rebuild (PRD Non-Goals) |
| Board columns = 5 lifecycle states | Draft → Planned → Active → Completed → Closed | MISSING — no `Initiative.state` field | `Initiative.state` CharField, choices `DRAFT/PLANNED/ACTIVE/COMPLETED/CLOSED` default `DRAFT`; board groups by `state`. Transitions allowed but logged, no enforced workflow (PRD Edge Cases) |
| State chip | Colored chip per lifecycle state | MISSING | Lifecycle labels/colors in `@plane/constants` + `@plane/i18n` |
| Lead avatar | Single owner per initiative | MISSING | `Initiative.lead` FK → AUTH_USER_MODEL (nullable) |
| Date range | Start/end dates drive timeline placement | MISSING | `Initiative.start_date`/`end_date` (nullable) |
| Progress bar (rollup) | Auto-aggregated from member epics + member projects' work items | MISSING — only cycle-level workspace aggregation exists (`WorkspaceCyclesEndpoint`) | `GET .../initiatives/<id>/progress/` annotate-based rollup mirroring the cycle endpoint; cache in `Initiative.progress_snapshot` JSON; 0 work items → 0% with no divide-by-zero (PRD Edge Cases) |
| Member epics + projects panel + attach | Attach/detach any workspace epic or project | MISSING | `InitiativeEpic` (FK Issue, must be `is_epic`), `InitiativeProject` (FK Project), each unique-when-not-deleted; attach/detach endpoints validate same-workspace, reject cross-workspace with `400` |
| Label pills | Grouping/filtering by workspace labels | MISSING | `InitiativeLabel` (FK workspace-scoped `Label`) |
| Filter / group by lead, state, labels, dates | Filters persist across view switches | PRESENT (mechanism) — filter store pattern reusable | New initiative filter store persisting selection across layout switches |
| Status-update thread | On Track / At Risk / Off Track, threaded, emoji reactions | MISSING — `IssueComment` has nested-reply + reaction infra but no structured status type | See StatusUpdate screen below; reuse reaction infra |

**Implementation mapping**

- **Routes** (`apps/web/app/routes/core.ts`): register a new workspace-scoped route inside the `(projects)` layout block (alongside `active-cycles`/`workspace-views`), e.g. `route(":workspaceSlug/initiatives", "./(all)/[workspaceSlug]/(projects)/initiatives/page.tsx")` with a matching `layout(...)` wrapper, and a detail route `":workspaceSlug/initiatives/:initiativeId"`. Mirrors the flat-config `layout()/route()` style already in the file (lines 53–158).
- **Components** (`apps/web/core` for shared, `apps/web/ce` for fork-specific store glue): initiatives list/board/timeline reuse the existing layout components parameterized to the Initiative entity; new `InitiativeCard`, `InitiativeStateChip`, `InitiativeMembersPanel`, `InitiativeProgressCard` under `apps/web/core/components/initiatives/`.
- **MobX stores** (`apps/web/ce/store/initiative/`): `InitiativeStore` (CRUD + membership), `InitiativeFilterStore` (persisted filters across view switches). Follow the cycle/project store shape; do NOT reuse the dead epic store pattern.
- **Services** (`@plane/services`, i.e. `packages/services`): `InitiativeService` with `list/create/retrieve/update/destroy/attachEpics/attachProjects/progress/summary`. Types in `@plane/types`; lifecycle-state + status-update labels in `@plane/constants` + `@plane/i18n`.
- **Backend** (`apps/api/plane/db/models/initiative.py`): `Initiative` extends `BaseModel` (workspace-scoped, soft-delete via `deleted_at`); `InitiativeEpic`/`InitiativeProject`/`InitiativeLabel` join tables with `UniqueConstraint(condition=Q(deleted_at__isnull=True))` matching existing project-issue-type constraint style. Views in `apps/api/plane/app/views/initiative.py`; URLs `apps/api/plane/app/urls/initiative.py`; v1 parity `apps/api/plane/api/urls/initiative.py`. Permission: `WorkspaceViewerPermission` for read, workspace Admin/Member for write — mirror `WorkspaceCyclesEndpoint` (`apps/api/plane/app/views/workspace/cycle.py:20-21`). The `initiatives-summary` endpoint mirrors `WorkspaceCyclesEndpoint`'s annotate-based aggregation with lifecycle-state grouping.
- **Entitlement wiring**: route + nav entry render only when `isSelfHostedFeatureEnabled("initiatives")`.
- **Empty state**: "Create your first initiative" with a workspace-scoped CTA, gated on the `initiatives` flag (no dedicated asset exists yet — reuse a generic empty-state illustration or add one under `apps/web/app/assets/empty-state/initiatives`).
- **Loading state**: skeleton cards in board columns / skeleton rows in list while the list query resolves; progress bars render an indeterminate state until `progress_snapshot` loads.
- **Error state**: list fetch failure → inline retry banner, not a blocking toast. Cross-workspace attach rejection (`400`) → inline field error on the attach control naming the offending object. Concurrent membership edit → last-write-wins with refetch on conflict (PRD Edge Cases).
- **Responsive**: board columns horizontal-scroll on narrow viewports; detail panel collapses members + status thread into stacked accordions below the progress card at <768px.
- **a11y**: state chips expose state name as text (not color-only); board columns are labeled regions with `aria-label` = state name; progress bar is `role="progressbar"` with `aria-valuenow`/`aria-valuetext` ("65% complete"); attach control is a labeled combobox with keyboard selection.

---

## Reference: plane.so — Epics (IssueType.is_epic, hierarchy, multi-layout, status-update types)

> The user's screenshot shows the **Epics** project surface and an epic detail view. The list/board header carries the same **List / Board / Timeline** switchers as work items. An epic row/card shows the epic name, a **lead avatar**, a **start→target timeline**, and a **progress bar** rolled up from child work items. The epic **detail view** has: a header with name + lead + dates + an **"Ask AI / Summarize progress"** action; a body of **bundled work items** rendered as cards with a **bulk-attach** control; a **progress card**; **custom-property fields** (text / dropdown / member); a **status-update thread** with On Track / At Risk / Off Track chips and emoji reactions; and a **Convert to work item** action in the overflow menu. A "duplicate" action offers cross-project/workspace copy.

| UI element | plane.so behavior | Fork status | Required change |
|---|---|---|---|
| Epics tab + project route | Per-project surface at `/<slug>/projects/<id>/epics` | PARTIAL — empty-state assets exist (`apps/web/app/assets/empty-state/epics`) but no route mounts them | New project epics route reusing list/board/timeline layouts |
| Create/Update epic modal | Form: project selector, name, lead, description, start/target, custom properties | PARTIAL — modal is a stub returning `<></>` (`apps/web/ce/components/epics/epic-modal/modal.tsx:25-27`) | Replace stub with a real modal built on existing issue-create form components, honoring `isProjectSelectionDisabled` |
| Epic = `is_epic` IssueType | Epics are Issues whose type is an epic; lead = assignee; timeline = `start_date`/`target_date` | PRESENT (primitive) — `IssueType.is_epic` (`apps/api/plane/db/models/issue_type.py:19`), `Issue.parent` hierarchy | No new epic table; reuse Issue + type. Make the store real (remove `@ts-nocheck`) |
| List / Board / Timeline layouts | Same layout stack as work items | PRESENT — reusable once store is real | Parameterize via timeline store; do NOT rebuild |
| Progress bar | Rollup of child work-item states | MISSING (endpoint) | `GET .../epics/<id>/progress/` — counts by state group, percent complete; 0 children → 0% |
| Bundled work items + bulk-attach | Attach N work items in one action; one epic per item | PARTIAL — `Issue.parent` exists; no bulk endpoint | `POST .../epics/<id>/work-items/` body `{ "issue_ids": [...] }`; enforce one-epic-per-item; default reject if already parented, reparent only on explicit flag (PRD Edge Cases) |
| Custom-property fields | text / dropdown (single+multi) / member, scoped to epic type | MISSING — no `IssueProperty` model in this CE tree | New first-party `IssueProperty`/`IssuePropertyOption`/`IssuePropertyValue` (M3); detail-view editable fields |
| Convert to work item ↔ epic | Flip type; reparent/orphan children per policy | PARTIAL — type flip possible; no endpoint/policy | `POST .../epics/<id>/convert/` and `.../work-items/<id>/convert-to-epic/`; child reparent-to-grandparent-or-null recorded in issue activity; block silent data loss. **Conversion paths require full test coverage — untested = R0** (PRD Risk Tier) |
| Duplicate (cross-project/workspace) | Copy epic + optional subtree, remap states/labels/members | MISSING | `POST .../epics/<id>/duplicate/` body `{ target_project_id?, target_workspace_slug?, include_subtree }`; re-resolve members/labels/states in target tenant, never carry source IDs; report remap summary |
| Status-update thread | On Track / At Risk / Off Track, threaded, reactions | MISSING (structured type) | `StatusUpdate` model (M6); see below |
| "Ask AI / Summarize progress" | NL query + auto progress summary | MISSING | `POST .../copilot/query/` scoped to epic; fail-closed disabled state when provider unconfigured |
| Filters | Persist across layout switches | PRESENT (mechanism) — `apps/web/ce/store/issue/epic/filter.store.ts` exists | Wire the epic filter store to the real epic store |

**Implementation mapping**

- **Routes** (`apps/web/app/routes/core.ts`): add inside the project detail layout block (sibling to `cycles`, lines 150–158): `route(":workspaceSlug/projects/:projectId/epics", "./(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/epics/(list)/page.tsx")` plus a detail route `":workspaceSlug/projects/:projectId/epics/:epicId"`.
- **Components** (`apps/web/ce/components/epics/`): replace the stub `epic-modal/modal.tsx` with `CreateUpdateEpicModal` composing the existing issue-create form components — keep the exported `EpicModalProps` signature (`data`, `isOpen`, `onClose`, `beforeFormSubmit`, `onSubmit`, `fetchIssueDetails`, `primaryButtonText`, `isProjectSelectionDisabled`) so call sites don't change. Detail view (`apps/web/core/components/epics/`): `EpicProgressCard`, `EpicWorkItemsList` (cards), `EpicBulkAttach`, `EpicCustomPropertyFields`, `EpicConvertAction`, `EpicStatusThread`.
- **MobX stores** (`apps/web/ce/store/issue/epic/`): rewrite `issue.store.ts` removing both `@ts-nocheck` banners and the "this class will never be used" note; back `ProjectEpics` with a real `EpicService` instead of inheriting dead `ProjectIssues` behavior. Wire `filter.store.ts` (`IProjectEpicsFilter`) for persisted filters.
- **Services** (`@plane/services`): `EpicService` (`list/create/retrieve/update/destroy/progress/attachWorkItems/convert/convertToEpic/duplicate/listProperties/setPropertyValues`).
- **Backend** (`apps/api/plane/app/views/epic.py`, urls `apps/api/plane/app/urls/epic.py`, v1 `apps/api/plane/api/urls/epic.py`): epics are Issues filtered to `is_epic` type, scoped by `slug` + `project_id`; reuse `allow_permission`/`ROLE` — write = project edit role, read = project viewer; v1 enforces the same checks. `IssueProperty` models in `apps/api/plane/db/models/issue_property.py` (M3, additive migration).
- **AI affordance** (`apps/api/plane/app/views/copilot.py` extension): `POST .../copilot/query/` reuses `is_llm_configured`/`get_llm_config`; evidence retrieval filtered to caller-readable objects only; returns `409`/feature-disabled when no provider (fail closed); never logs raw prompts/responses containing secrets.
- **Entitlement wiring**: epics route + tab render only when `isSelfHostedFeatureEnabled("epics")`.
- **Empty state**: reuse `apps/web/app/assets/empty-state/epics` (`epics-{light,dark}.webp`, `settings-{light,dark}.webp`); when epics are disabled in project settings, render an "Enable epics in project settings" CTA using the `settings-*` asset, gated on the `epics` entitlement.
- **Loading state**: skeleton rows/cards in list+board; progress card shows indeterminate bar; modal shows a disabled submit with the `primaryButtonText.loading` label during create/update.
- **Error state**: bulk-attach conflict (item already parented) → inline error listing the conflicting work item with a "reparent" confirm; convert-with-children → confirmation dialog stating the reparent/orphan policy before committing; cross-workspace duplicate with missing targets → success with a remap-summary panel listing fallbacks (PRD Edge Cases). AI provider outage → graceful "AI unavailable", manual viewing never blocked.
- **Responsive**: epic detail collapses work-items list, properties, and status thread into stacked sections at <1024px; modal goes full-width sheet on mobile.
- **a11y**: progress bar `role="progressbar"` + `aria-valuetext`; status chips text-labeled (not color-only); bulk-attach is a labeled multi-select with keyboard add/remove; the "Convert" and "Duplicate" overflow actions are reachable via keyboard and announce their destructive/cross-tenant consequence via `aria-describedby`.

---

## Reference: plane.so — Structured status updates (On Track / At Risk / Off Track)

> The user's screenshot shows the **status-update composer + thread** attached to an epic and to an initiative. The composer has a **status selector** with three chips — green **On Track**, amber **At Risk**, red **Off Track** — a rich-text body editor, and a post button. Below, posted updates render as thread items: author avatar, status chip, timestamp, rich-text body, an **emoji reaction** row, and a **Reply** affordance that nests replies under the parent update.

| UI element | plane.so behavior | Fork status | Required change |
|---|---|---|---|
| Status selector (3 states) | On Track / At Risk / Off Track | MISSING — no first-class status type | `StatusUpdate.status` CharField choices `ON_TRACK/AT_RISK/OFF_TRACK` |
| Attach target | Attaches to an epic OR an initiative | MISSING | Nullable `epic` FK → Issue and nullable `initiative` FK → Initiative, **exactly one set** enforced by `CheckConstraint` (PRD Edge Cases: both-or-neither blocked) |
| Rich-text body | HTML body with stripped + JSON variants | PARTIAL — `IssueComment` has `comment_html`/`comment_stripped`/`comment_json` | `StatusUpdate.comment_html`/`comment_stripped`/`comment_json`; sanitize on the same path as `IssueComment` (`strip_tags` for `_stripped`, server-side HTML sanitization before persist) to prevent stored XSS |
| Threaded replies | Replies nest under a parent update | PARTIAL — `IssueComment` self-FK pattern reusable | `StatusUpdate.parent` self-FK `related_name="replies"` |
| Emoji reactions | React to any update | PRESENT (pattern) — `IssueReaction`/`CommentReaction` | New `StatusUpdateReaction` (FK StatusUpdate, `actor`, `reaction`, unique-when-not-deleted) mirroring `CommentReaction` |
| Authorship | Logged-in member posts | PARTIAL — actor pattern exists | `StatusUpdate.actor` FK; authorship requires membership of the owning epic's project / initiative's workspace |

**Implementation mapping**

- **Backend** (`apps/api/plane/db/models/status_update.py`, M6 additive migration): `StatusUpdate` extends `BaseModel` (workspace FK, soft-delete); `CheckConstraint` for the epic-XOR-initiative invariant; `StatusUpdateReaction` with `UniqueConstraint(condition=Q(deleted_at__isnull=True))` matching `CommentReaction`. Views/urls: `GET|POST .../epics/<id>/status-updates/`, `GET|POST .../initiatives/<id>/status-updates/`, detail `GET|PATCH|DELETE`, `POST|DELETE .../status-updates/<id>/reactions/`. Scope checks: authorship requires owning-object membership; reads require the matching viewer role.
- **Frontend** (`apps/web/core/components/`): shared `StatusUpdateComposer`, `StatusUpdateThread`, `StatusChip`, `StatusReactionBar` consumed by both `EpicStatusThread` and the initiative detail. Reuse the existing comment editor + reaction components rather than building new editors.
- **Services / types / constants**: status CRUD + reactions on `EpicService`/`InitiativeService`; the three status enum values + colors/labels in `@plane/constants` + `@plane/i18n`.
- **Empty state**: "No status updates yet — post the first update" with the status selector inline.
- **Loading state**: skeleton thread items; optimistic insert of a freshly posted update with rollback on failure.
- **Error state**: post failure → inline error on the composer with retained draft body (no data loss); reaction failure → revert the optimistic emoji.
- **Responsive**: composer status chips wrap above the editor on narrow viewports; reply nesting caps indentation depth on mobile (flattens to a quoted-parent reference).
- **a11y**: status selector is a `radiogroup` (status conveyed as text + icon, not color alone); each thread item is an `article` with an accessible name "{author} — {status} — {timestamp}"; reaction buttons are toggle buttons with `aria-pressed` and counts in the accessible name; Reply opens a labeled composer with focus moved into the editor.

---

**Cross-cutting design constraints (apply to every screen above)**

- Every read/write is workspace- and project-scoped with server-side role checks (`allow_permission`/`ROLE`, `WorkspaceViewerPermission`); v1 api-key routes enforce identical checks; no Space/public-API exposure of initiatives, status updates, or NLQ.
- All four surfaces fail safe: features hidden when their entitlement flag is `false`; AI degrades to manual workflows when the provider is unconfigured; cross-workspace references rejected `400`; progress rollups skip deleted/non-epic members and never divide by zero.
- Migrations are additive-only (new tables/columns), each with a reviewed reverse migration; no destructive change to `issues`/`issue_comments`/`issue_types`. Entitlement flags are the instant kill switches.
- No proprietary Plane EE source is copied; the reuse-first strategy parameterizes the PRESENT layout/timeline/reaction infrastructure rather than rebuilding it.
