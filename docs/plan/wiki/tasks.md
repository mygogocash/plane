# Wiki & Pages — Tasks (Claude Code subagent cards)

These cards decompose the verified PARTIAL/MISSING capabilities into self-contained, cold-start-safe units. Each card assumes a fresh subagent with no memory of this conversation or the PRD. All paths are absolute. Backend lands before its API surface; API before frontend. Each card is ~1 PR.

Global facts every card relies on (re-verify with grep if unsure):
- Repo root: `/Users/kunanonjarat/Developer/plane-preview`. Monorepo: backend `apps/api` (Django/DRF), web `apps/web` (React Router 7 + MobX), live server `apps/live`, shared packages `packages/{types,services,ui,constants,editor}`.
- Entitlement flags live in `/Users/kunanonjarat/Developer/plane-preview/apps/web/ce/lib/self-host-entitlements.ts` — a `const` object `SELF_HOSTED_FEATURE_FLAGS` whose keys derive the `TSelfHostedFeatureFlag` union; exposed via `isSelfHostedFeatureEnabled(key)`. Existing keys (all `true`): `ai_copilot`, `teamspaces`, `templates`, `public_views_pages`, `audit_logs`.
- Editor extension gating lives in `/Users/kunanonjarat/Developer/plane-preview/apps/web/ce/hooks/use-editor-flagging.ts`, which hard-codes `disabled: ["ai", "collaboration-cursor"]` for three profiles (`document`, `liteText`, `richText`).
- Page RBAC: `/Users/kunanonjarat/Developer/plane-preview/apps/api/plane/app/permissions/page.py` (`ProjectPagePermission`) — private pages owner-only; ADMIN/MEMBER create+edit; GUEST read; ADMIN delete.
- Page models: `/Users/kunanonjarat/Developer/plane-preview/apps/api/plane/db/models/page.py` (`Page`, `PageVersion`, `PageLog`, `ProjectPage`). Models registered in `/Users/kunanonjarat/Developer/plane-preview/apps/api/plane/db/models/__init__.py`.
- Page API: views `/Users/kunanonjarat/Developer/plane-preview/apps/api/plane/app/views/page/base.py`, urls `/Users/kunanonjarat/Developer/plane-preview/apps/api/plane/app/urls/page.py`, serializers `/Users/kunanonjarat/Developer/plane-preview/apps/api/plane/app/serializers/page.py`.
- Backend tests: pytest under `apps/api`; run inside the API Docker container. Confirm the exact invocation from `/Users/kunanonjarat/Developer/plane-preview/TESTING.md` and `BUILD.md` before relying on the commands below; treat the docker invocation as `assumed` until verified.
- Web tests: vitest. Confirm runner + config from `package.json` / `TESTING.md` before relying on commands.
- Sanitize-on-save pattern: mirror `IssueComment` (search `apps/api/plane/db/models/issue.py` for `comment_stripped` / `strip_tags`) for any new rich-text model.
- HARD RULE (R0 gate): any new server route that lands without RBAC tests AND a sanitize test (for rich-text writes) must NOT merge.

---

## WIKI-T1 — Add `collaboration_cursor` entitlement flag + conditional editor flagging

**Implements:** WIKI-E1 / WIKI-COLLAB-1, WIKI-COLLAB-2 (M1)
**Depends on:** none
**Risk tier:** R2 (frontend-only entitlement flip; single revertable commit)
**Worktree isolation:** n (small, isolated frontend change)

**Context:** The fork ships live-collaboration scaffolding (`apps/live` server + `@plane/editor` `CollaborativeDocumentEditorWithRef`) but switches cursors/presence off. `use-editor-flagging.ts` hard-codes `disabled: ["ai", "collaboration-cursor"]` for all three editor profiles, and there is no `collaboration_cursor` entitlement flag. This task adds the flag and makes the `collaboration-cursor` disable conditional on it. The `ai` disable stays untouched (owned by WIKI-T15).

**Files:**
- `/Users/kunanonjarat/Developer/plane-preview/apps/web/ce/lib/self-host-entitlements.ts` (add flag)
- `/Users/kunanonjarat/Developer/plane-preview/apps/web/ce/hooks/use-editor-flagging.ts` (conditional disable)
- Test (new): `/Users/kunanonjarat/Developer/plane-preview/apps/web/ce/hooks/__tests__/use-editor-flagging.test.ts` (confirm test dir convention first; co-located `*.test.ts` is the fallback)

**TDD — failing test first:**
- File: `use-editor-flagging.test.ts`. Mock `isSelfHostedFeatureEnabled` from the entitlements module.
- `useEditorFlagging > given collaboration_cursor flag is true > then document profile disabled excludes "collaboration-cursor" but still includes "ai"` — assert `result.document.disabled` does NOT contain `"collaboration-cursor"` and DOES contain `"ai"`.
- `useEditorFlagging > given collaboration_cursor flag is false > then every profile disabled includes "collaboration-cursor"` — assert for `document`, `liteText`, `richText`.
- `useEditorFlagging > given collaboration_cursor flag unset/unknown key > then isSelfHostedFeatureEnabled returns falsy and collaboration-cursor stays disabled` (edge: missing key safe default).
- Runner: vitest (`assumed` — confirm). Run, watch it fail because the hook unconditionally disables the cursor.

**Implementation outline:**
1. In `self-host-entitlements.ts`, add `collaboration_cursor: true` to the `SELF_HOSTED_FEATURE_FLAGS` const object (the union type extends automatically). Verify `isSelfHostedFeatureEnabled` returns a safe falsy for unknown keys; if not, that is out of scope — note it, do not fix here.
2. In `use-editor-flagging.ts`, read `isSelfHostedFeatureEnabled("collaboration_cursor")` once, then build each profile's `disabled` array conditionally: always include `"ai"`; include `"collaboration-cursor"` only when the flag is `false`. Keep immutable construction (new arrays, no mutation).
3. Do not touch `editor-body.tsx`; just confirm it consumes `disabled` from this hook.

**Acceptance criteria:**
- Given the flag is `true`, When the `document` profile is computed, Then `disabled` excludes `"collaboration-cursor"` and includes `"ai"`.
- Given the flag is `false`, When any profile is computed, Then `disabled` includes `"collaboration-cursor"`.
- Given an unknown flag key, When `isSelfHostedFeatureEnabled` is called, Then it returns falsy (no throw) and the cursor stays disabled.
- (Manual/integration, note only) Given two members editing with the flag on and `apps/live` reachable, Then live cursors render; with `apps/live` down, the editor falls back to non-realtime save without crashing.

**Verify:**
- `pnpm --filter web vitest run apps/web/ce/hooks/__tests__/use-editor-flagging.test.ts` (`assumed` — confirm filter/runner from `package.json`).
- `pnpm --filter web check:types` (confirm script name).

**Done when:** named tests went red then green; full web vitest suite green; type check passes; flag present and conditional disable verified; no change to the `ai` disable.

---

## WIKI-T2 — Full-text page-content search: backend query + functional index

**Implements:** WIKI-E2 / WIKI-SEARCH-1, WIKI-SEARCH-2 (M2)
**Depends on:** none
**Risk tier:** R1 (adds a DB index object; reverse migration must be reviewed; query change is read-only)
**Worktree isolation:** y (migration + DB index; isolate to avoid clashing migrations)

**Context:** Global search currently matches page `name` only. `GlobalSearchEndpoint.filter_pages()` does `name__icontains` and returns `name`, `id`, `project_ids`, `project_identifiers`, `workspace__slug`, filtered to the requester's project membership via `projects__project_projectmember__member=self.request.user`. This task adds `description_stripped` matching plus a `snippet` (length-capped excerpt around the match) and `parent_path` (ancestor page names via `Page.parent` self-FK) per result, backed by a Postgres functional full-text index.

**Files:**
- `/Users/kunanonjarat/Developer/plane-preview/apps/api/plane/app/views/search/base.py` (extend `filter_pages`)
- New migration under `/Users/kunanonjarat/Developer/plane-preview/apps/api/plane/db/migrations/` (next sequential number — list dir first)
- Tests (new): `/Users/kunanonjarat/Developer/plane-preview/apps/api/plane/tests/` search test module (confirm test layout first; place near existing search/view tests)

**TDD — failing test first:**
- pytest module, marker `@pytest.mark.django_db`.
- `filter_pages > given page body contains query but title does not > then page is returned with non-empty snippet` (seed a `Page` with `name` not matching, `description_stripped` matching).
- `filter_pages > given match in a very large description_stripped > then snippet length is capped` (assert `len(snippet) <= CAP`).
- `filter_pages > given page in a project the requester is not a member of > then page is excluded` (authz isolation).
- `filter_pages > given nested page parent>child>grandchild > then parent_path lists ancestor names in order`.
- `filter_pages > given top-level page with no parent > then parent_path is empty`.
- Run red first; failures must be assertion failures (page absent / missing keys), not import errors.

**Implementation outline:**
1. List existing migrations to get the next number and confirm app label.
2. Extend `filter_pages`: add `Q(description_stripped__icontains=q)` OR `name__icontains=q`; preserve the membership filter exactly. Compute `snippet` by locating the match index in `description_stripped` and slicing a capped window (define `SNIPPET_MAX_LEN` constant, e.g. 200). Compute `parent_path` by walking `parent` (bounded loop) or a single annotated query — prefer minimal queries; note N+1 risk if walking.
3. Add functional index migration: `atomic = False`, `CREATE INDEX CONCURRENTLY` GIN over `to_tsvector('english', coalesce(name,'') || ' ' || coalesce(description_stripped,''))` (or a `pg_trgm` GIN on `description_stripped`). Provide a reverse op dropping the index. The `icontains` query path must still work when the index is absent (rollback fallback).
4. Do not change the result route or response envelope beyond adding `snippet` + `parent_path`.

**Acceptance criteria:**
- Given a body-only match, When searching, Then the page is returned with a non-empty `snippet`.
- Given a huge body, When matched, Then `snippet` is length-capped.
- Given a non-member's project page matches, When searching, Then it is excluded (membership filter preserved).
- Given a nested page, Then `parent_path` is ancestor names in order; top-level → empty.
- Given the index is dropped (rollback), When searching, Then `icontains` still returns matches (no 500).
- Given migration applied then reversed on the test DB, Then both run clean.

**Verify:**
- Backend tests in Docker: confirm the exact command from `/Users/kunanonjarat/Developer/plane-preview/TESTING.md`; `assumed` form: `docker compose -f <compose-file> exec api pytest plane/tests/<search_test>.py -q`.
- Migration round-trip: `... exec api python manage.py migrate <app> <new>` then `... migrate <app> <prev>`.

**Done when:** named tests red→green; full backend suite green; forward+reverse migration both clean; membership isolation test passing (R0 gate: authz covered).

---

## WIKI-T3 — Search results: snippet + breadcrumb rendering

**Implements:** WIKI-E2 / WIKI-SEARCH-1, WIKI-SEARCH-2 (M2)
**Depends on:** WIKI-T2
**Risk tier:** R2 (presentational; renders fields the API now returns)
**Worktree isolation:** n

**Context:** WIKI-T2 makes the search API return `snippet` and `parent_path` per page result. The Cmd/Ctrl-K power-k surface renders page rows under `apps/web/core/components/power-k/ui/pages/`. This task renders the highlighted snippet excerpt and the ancestor breadcrumb in each result row. Search is core (not entitlement-gated).

**Files:**
- `/Users/kunanonjarat/Developer/plane-preview/apps/web/core/components/power-k/ui/pages/` (confirm exact file — list dir; the page result row component)
- Page types in `packages/types` if a search-result type needs `snippet?`/`parent_path?` (grep for the existing page search result type first)
- Test (new): co-located component test next to the row component

**TDD — failing test first:**
- vitest + React Testing Library (confirm RTL is the convention).
- `page search row > given a result with snippet and parent_path > then renders the snippet text and the breadcrumb of ancestor names`.
- `page search row > given a result with empty parent_path > then renders no breadcrumb element`.
- `page search row > given a result with no snippet > then renders the row without a snippet block (no crash)`.
- Run red (component does not yet read these fields).

**Implementation outline:**
1. Extend the result-row props/type to optionally include `snippet` and `parent_path: string[]`.
2. Render `parent_path` as a breadcrumb (join with a separator; render nothing when empty) and `snippet` as a truncated excerpt below the title. Cap render length defensively even though the API caps it.
3. Reuse existing power-k row styling; no new design system.

**Acceptance criteria:**
- Given snippet + parent_path, Then both render.
- Given empty parent_path, Then no breadcrumb.
- Given missing snippet, Then row still renders.

**Verify:** `pnpm --filter web vitest run <row test path>`; `pnpm --filter web check:types`.

**Done when:** tests red→green; full web suite green; type check clean.

---

## WIKI-T4 — Page backlinks read API

**Implements:** WIKI-E3 / WIKI-LINK-1 (M3)
**Depends on:** none
**Risk tier:** R2 read-only endpoint over existing `PageLog`; but RBAC + 403 test required to merge (R0 gate)
**Worktree isolation:** n

**Context:** `PageLog` (`apps/api/plane/db/models/page.py`) already records entity-link rows with `entity_name` values including `back_link`, `forward_link`, `page_mention`, `user_mention`. No API exposes inbound references. This task adds a read endpoint returning pages whose `PageLog` references the target page, resolving moved pages (`Page.moved_to_page`) and excluding soft-deleted/unreadable ones.

**Files:**
- `/Users/kunanonjarat/Developer/plane-preview/apps/api/plane/app/views/page/base.py` (new backlinks view/action)
- `/Users/kunanonjarat/Developer/plane-preview/apps/api/plane/app/urls/page.py` (add route)
- `/Users/kunanonjarat/Developer/plane-preview/apps/api/plane/app/serializers/page.py` (backlink result serializer)
- Tests (new): page API test module

**TDD — failing test first:**
- pytest, `@pytest.mark.django_db`.
- `backlinks > given page B references page A in PageLog > then GET A/backlinks returns B`.
- `backlinks > given a referencing page is soft-deleted > then it is excluded`.
- `backlinks > given a referencing page was moved (moved_to_page set) > then the new page is returned, not the tombstone`.
- `backlinks > given page A has no inbound references > then returns empty list with 200`.
- `backlinks > given a non-member (or GUEST on a private page) requests backlinks > then returns 403` (authz; R0 gate).
- Run red (route 404 / view absent).

**Implementation outline:**
1. Confirm `PageLog` field names and the exact `entity_name` constants (grep the model). Confirm `Page.moved_to_page` exists.
2. Add a view that queries `PageLog` rows whose target identifies page A and `entity_name in ("back_link","page_mention")`, collects source page ids, then returns the source pages filtered to readable + not soft-deleted, resolving `moved_to_page`.
3. Apply `ProjectPagePermission` so private-page read rules and 403 behavior match existing page routes.
4. Add the route mirroring an existing scoped page sub-route (e.g. the `lock`/`unlock` pattern): `GET workspaces/<slug>/projects/<project_id>/pages/<page_id>/backlinks/`.

**Acceptance criteria:** as TDD list; plus the response only contains pages the requester can read (no private/unreadable leakage).

**Verify:** Docker pytest on the new module (confirm command from TESTING.md); ensure 403 test passes.

**Done when:** tests red→green; full backend suite green; RBAC/403 covered (R0 gate satisfied); soft-delete + moved-page edge cases green.

---

## WIKI-T5 — Backlinks navigation-pane panel

**Implements:** WIKI-E3 / WIKI-LINK-2 (M3)
**Depends on:** WIKI-T4
**Risk tier:** R2
**Worktree isolation:** n

**Context:** The page navigation pane lives under `apps/web/core/components/pages/navigation-pane/` with an Info tab (`tab-panels/info/`). WIKI-T4 exposes a backlinks read endpoint. This task adds a collapsible "Backlinks" section under Info listing referencing pages, navigating on click. Renders for any readable page (gated by page read RBAC only, no entitlement flag).

**Files:**
- `/Users/kunanonjarat/Developer/plane-preview/apps/web/core/components/pages/navigation-pane/tab-panels/info/` (new backlinks block — confirm exact dir)
- Page service: extend `/Users/kunanonjarat/Developer/plane-preview/apps/web/core/services/page/project-page.service.ts` with `getBacklinks(...)` (services live here, NOT in `packages/services` — verified)
- Page store getter: `/Users/kunanonjarat/Developer/plane-preview/apps/web/core/store/pages/project-page.store.ts` (computed read; immutable)
- Test (new): co-located component test

**TDD — failing test first:**
- vitest + RTL.
- `backlinks panel > given backlinks exist > then renders referencing pages and clicking navigates`.
- `backlinks panel > given no backlinks > then renders empty state ("No pages link here yet."), not a spinner`.
- `backlinks panel > given an unreadable referencing page > then it is not shown` (relies on API filtering; assert the panel renders only what the service returns).
- Run red.

**Implementation outline:**
1. Add `getBacklinks` to the page service calling the WIKI-T4 route.
2. Add a computed/observable in the page store; render a collapsible section under Info using existing collapsible primitives.
3. Empty/loading/error states: empty copy fixed string; loading via existing loaders; error inline.

**Acceptance criteria:** as TDD list.

**Verify:** `pnpm --filter web vitest run <panel test>`; `check:types`.

**Done when:** tests red→green; web suite green; type check clean.

---

## WIKI-T6 — `PageTemplate` model + migration

**Implements:** WIKI-E4 / WIKI-TMPL-1 (M4)
**Depends on:** none
**Risk tier:** R1 (new model + additive migration; reverse migration reviewed)
**Worktree isolation:** y (migration)

**Context:** No template concept exists. This task adds the `PageTemplate` model, mirroring `Page`'s rich-text + `logo_props` + `access` shape and sanitize-on-save. Workspace-scoped, optional project scope (null = workspace-global). API/UI land in later tasks.

**Files:**
- `/Users/kunanonjarat/Developer/plane-preview/apps/api/plane/db/models/page.py` (or new module in `db/models/`) — define `PageTemplate`
- `/Users/kunanonjarat/Developer/plane-preview/apps/api/plane/db/models/__init__.py` (register)
- New migration under `db/migrations/`
- Tests (new): model test module

**TDD — failing test first:**
- pytest, `@pytest.mark.django_db`.
- `PageTemplate > given html with malicious markup > when saved > then description_stripped is sanitized` (sanitize-on-save; R0 gate for rich text).
- `PageTemplate > given a template with project=null > then it is workspace-global (saved without project)`.
- `PageTemplate > given access=PRIVATE and owned_by set > then fields persist`.
- Run red (model absent → import/attribute error is acceptable here only because the model does not exist yet; once stubbed, assertions drive behavior).

**Implementation outline:**
1. Inspect `Page` for the exact rich-text field set (`description_html`, `description_json`, `description_binary`, `description_stripped`), `logo_props` JSON, `access` choices, and the `save()` strip/sanitize implementation. Mirror them.
2. Define `PageTemplate(BaseModel)`: `workspace` FK, `name`, the four `description_*` fields, `logo_props` JSON, `template_type` (choices: `meeting_notes`/`runbook`/`charter`/`custom`), `access` (PRIVATE/PUBLIC), `owned_by` FK, optional `project` FK (null), `sort_order`. Implement `save()` to compute `description_stripped` via the same `strip_tags`/sanitizer used by `Page`/`IssueComment`.
3. Generate the migration; ensure reverse drops the table.

**Acceptance criteria:** sanitize-on-save enforced; project-null allowed; fields persist; migration forward+reverse clean.

**Verify:** Docker pytest model module; migration round-trip.

**Done when:** tests red→green; backend suite green; migration reversible; sanitize test green (R0 gate).

---

## WIKI-T7 — Page template API: CRUD + instantiate-from-template

**Implements:** WIKI-E4 / WIKI-TMPL-1, WIKI-TMPL-2 (M4)
**Depends on:** WIKI-T6
**Risk tier:** R1 (new public contract incl. API-key parity for apply; flag-gated; RBAC+sanitize required → else R0)
**Worktree isolation:** n

**Context:** With `PageTemplate` in place, add list/create/retrieve/update/delete plus an instantiate endpoint that clones `description_*` + `logo_props` into a new `Page` and returns it. RBAC mirrors `ProjectPagePermission` (`_check_project_action_access` POST rule: ADMIN/MEMBER create, GUEST 403). Cross-workspace template ids rejected.

**Files:**
- New view in `/Users/kunanonjarat/Developer/plane-preview/apps/api/plane/app/views/page/` (e.g. `template.py`)
- Serializer in `/Users/kunanonjarat/Developer/plane-preview/apps/api/plane/app/serializers/page.py`
- `/Users/kunanonjarat/Developer/plane-preview/apps/api/plane/app/urls/page.py` (session routes)
- API-key parity (apply only): `/Users/kunanonjarat/Developer/plane-preview/apps/api/plane/api/urls/` + corresponding `api/` view (confirm structure)
- Tests (new): template API module

**TDD — failing test first:**
- pytest, `@pytest.mark.django_db`.
- `templates > given ADMIN/MEMBER > when POST create with name+content+scope > then persisted with owner, workspace FK, access`.
- `templates > given GUEST > when POST create > then 403` (authz; R0 gate).
- `templates > given empty/invalid body > when POST > then 400`.
- `apply > given a readable template > when POST pages/from-template/<id>/ > then a new Page is created cloning description_* and logo_props, returned in response`.
- `apply > given a template id from another workspace > when POST > then 403/400` (cross-workspace rejected).
- `apply (api-key) > given a scoped API key > when POST apply > then scoping enforced` (contract test).
- `templates > given a private template > when a non-owner lists > then excluded`.
- Run red (routes 404).

**Implementation outline:**
1. Model a ViewSet/views mirroring existing page views; reuse `ProjectPagePermission` and the project-action access checks.
2. Routes: `GET/POST workspaces/<slug>/page-templates/`, `GET/PATCH/DELETE .../page-templates/<template_id>/`, `POST workspaces/<slug>/projects/<project_id>/pages/from-template/<template_id>/`.
3. Apply: load template (verify same workspace), create `Page` cloning the four `description_*` fields + `logo_props`; do NOT clone labels/states/members. Return the new page via the existing page serializer.
4. Sanitize on template create/update via the model `save()` (WIKI-T6).
5. API-key parity for apply only: add the apply route under `api/v1/` with a scoping contract test; do NOT expose CRUD on the API-key surface unless an existing pattern requires it.

**Acceptance criteria:** as TDD list; templates carry only content + `logo_props`.

**Verify:** Docker pytest template module; ensure 403 (GUEST), cross-workspace rejection, and api-key scoping tests pass.

**Done when:** tests red→green; backend suite green; RBAC + sanitize + cross-workspace + api-key scoping covered (R0 gate satisfied).

---

## WIKI-T8 — Template store/service + gallery modal (gated on `templates`)

**Implements:** WIKI-E4 / WIKI-TMPL-2, WIKI-TMPL-3 (M4)
**Depends on:** WIKI-T7
**Risk tier:** R2 (frontend; gated; hidden until backend live)
**Worktree isolation:** n

**Context:** The create-page flow uses `apps/web/core/components/pages/modals/create-page-modal.tsx`. This task adds a template-gallery modal off "Create Page" showing "Blank page" first then cards by `template_type`, plus a new MobX store slice and a service for list/apply. Gated on `isSelfHostedFeatureEnabled("templates")` (existing flag, `true`). "Save as template" entry from the page ⋯ menu (`editor/toolbar/options-dropdown.tsx`).

**Files:**
- New: `/Users/kunanonjarat/Developer/plane-preview/apps/web/core/store/pages/page-template.store.ts`
- Service: extend `/Users/kunanonjarat/Developer/plane-preview/apps/web/core/services/page/project-page.service.ts` (or new `page-template.service.ts` alongside) with `list()` / `apply(templateId, {projectId})` / `createFromPage(...)`
- New: `/Users/kunanonjarat/Developer/plane-preview/apps/web/core/components/pages/modals/template-gallery-modal.tsx`
- Edit: `create-page-modal.tsx`, `options-dropdown.tsx` (add "Save as template")
- Tests (new): store test + modal component test

**TDD — failing test first:**
- vitest.
- `template gallery > given templates flag on and templates exist > then "Blank page" renders first then cards grouped by template_type`.
- `template gallery > given no templates > then empty state "No templates yet — create one from any page via the ⋯ menu." renders`.
- `template gallery > given templates flag off > then gallery is hidden (Blank only)`.
- `page-template store > given apply succeeds > then navigates to new page (optimistic) and rolls back on failure`.
- Run red.

**Implementation outline:**
1. Store slice: `list`, `apply` actions; immutable state; optimistic navigation with rollback on apply failure.
2. Modal: gate the gallery surface on the flag; "Blank page" always first; group cards by `template_type`. Empty-state copy exactly as specified.
3. Wire "Save as template" into the ⋯ menu calling `createFromPage`.

**Acceptance criteria:** as TDD list; surface hidden when backend/flag absent (no "coming soon" stub).

**Verify:** `pnpm --filter web vitest run <store+modal tests>`; `check:types`.

**Done when:** tests red→green; web suite green; type check clean; gating verified.

---

## WIKI-T9 — `PageComment` + `PageActivity` models + migrations

**Implements:** WIKI-E5 / WIKI-CMT-1 (models); introduces `PageActivity` for WIKI-E6 (M5)
**Depends on:** none (pattern reuse from WIKI-T6 helpful but not blocking)
**Risk tier:** R1 (two new models + additive migrations; reverse reviewed)
**Worktree isolation:** y (migrations)

**Context:** No page comment or page-activity tables exist. This task adds `PageComment` (whole-page or text-anchored, threaded, resolvable, soft-deletable, sanitized) and `PageActivity` (append-only event log; its feed surface lands in WIKI-E6). Both mirror existing `IssueComment` / `IssueActivity` shapes (`apps/api/plane/db/models/issue.py`).

**Files:**
- `/Users/kunanonjarat/Developer/plane-preview/apps/api/plane/db/models/` (new module(s) for `PageComment`, `PageActivity`)
- `/Users/kunanonjarat/Developer/plane-preview/apps/api/plane/db/models/__init__.py` (register)
- New migrations under `db/migrations/`
- Tests (new): model test module

**TDD — failing test first:**
- pytest, `@pytest.mark.django_db`.
- `PageComment > given malicious html > when saved > then comment_stripped sanitized` (R0 gate for rich text).
- `PageComment > given anchor {from,to,quoted_text} > then anchor JSON persists`.
- `PageComment > given parent set > then it threads under root`.
- `PageComment > given is_resolved toggled with resolved_by/resolved_at > then fields persist`.
- `PageActivity > given verb/field/old_value/new_value/epoch > then row persists` (shape parity with IssueActivity).
- Run red (models absent).

**Implementation outline:**
1. Inspect `IssueComment` for the rich-text field set + `save()` sanitize, and `IssueActivity` for the activity shape (`verb`, `field`, `old_value`, `new_value`, `comment`, `epoch`).
2. `PageComment(BaseModel)`: `workspace` FK, `page` FK, `actor` FK, `parent` self-FK (null), `comment_html`/`_json`/`_stripped`, `anchor` JSON (null), `is_resolved` bool, `resolved_by` FK (null), `resolved_at` (null), `external_id`/`external_source`. Sanitize on `save()`.
3. `PageActivity(BaseModel)` (`page_activities`): `workspace`/`page`/`actor` FKs, `verb`, `field`, `old_value`, `new_value`, `comment`, `epoch`.
4. Two migrations (or one with both `CreateModel`s); reverse drops them.

**Acceptance criteria:** sanitize-on-save; anchor JSON; threading FK; resolve fields; activity shape; migrations forward+reverse clean.

**Verify:** Docker pytest model module; migration round-trip.

**Done when:** tests red→green; backend suite green; migrations reversible; sanitize test green (R0 gate).

---

## WIKI-T10 — Page comments API: CRUD + resolve/unresolve

**Implements:** WIKI-E5 / WIKI-CMT-1, WIKI-CMT-2, WIKI-CMT-3 (M5)
**Depends on:** WIKI-T9
**Risk tier:** R1 (new public contract; RBAC + sanitize required → else R0)
**Worktree isolation:** n

**Context:** With `PageComment`/`PageActivity` models present, add the comment API. RBAC: create = any active member (ADMIN/MEMBER/GUEST) on a readable page; edit/delete = author or ADMIN; resolve = author, page owner, ADMIN, or MEMBER (GUEST cannot resolve). Private pages stay owner-gated for read. Resolution writes a `PageActivity` row.

**Files:**
- New view in `/Users/kunanonjarat/Developer/plane-preview/apps/api/plane/app/views/page/` (e.g. `comment.py`)
- Serializer in `/Users/kunanonjarat/Developer/plane-preview/apps/api/plane/app/serializers/page.py` (mirror IssueComment serializer)
- `/Users/kunanonjarat/Developer/plane-preview/apps/api/plane/app/urls/page.py` (routes)
- Tests (new): comment API module

**TDD — failing test first:**
- pytest, `@pytest.mark.django_db`.
- `comments > given a readable page > when GUEST creates an anchored comment > then created with anchor JSON, appears in thread` (GUEST may comment).
- `comments > given non-author non-ADMIN > when PATCH/DELETE another's comment > then 403` (authz; R0 gate).
- `comments > given a reply with parent > then threads in chronological order`.
- `resolve > given page owner resolves > then is_resolved/resolved_by/resolved_at set AND a PageActivity row logged`.
- `resolve > given GUEST (not author/owner/admin) resolves > then 403`.
- `comments > given a non-member or GUEST-on-private page > when create > then 403`.
- `comments > given invalid/empty body > when POST > then 400`.
- `comments > given soft-deleted comment > when thread re-listed > then excluded`.
- `comments > given malicious html > when created > then stored comment_stripped sanitized` (R0 gate).
- Run red (routes 404).

**Implementation outline:**
1. Mirror `IssueComment` views/serializers. Enforce `ProjectPagePermission` for read; layer object-level checks for edit/delete (author|ADMIN) and resolve (author|page owner|ADMIN|MEMBER).
2. Routes: `GET/POST .../pages/<page_id>/comments/`, `PATCH/DELETE .../comments/<comment_id>/`, `POST .../comments/<comment_id>/resolve/` and `DELETE` to unresolve.
3. On resolve/unresolve and on comment create, write a `PageActivity` row (verb `commented`/resolution).
4. @mention notifications reuse existing mention infra and must respect page read access (do not leak page existence to non-members) — note if mention wiring is larger than this PR and split.

**Acceptance criteria:** as TDD list.

**Verify:** Docker pytest comment module; confirm 403 (edit/delete/resolve/private), 400, sanitize, soft-delete tests pass.

**Done when:** tests red→green; backend suite green; RBAC + sanitize covered for every write path (R0 gate satisfied).

---

## WIKI-T11 — Comments tab + inline comment bubble + store

**Implements:** WIKI-E5 / WIKI-CMT-1..4 (M5)
**Depends on:** WIKI-T10
**Risk tier:** R2 (frontend; behind a comments flag)
**Worktree isolation:** n

**Context:** The navigation pane tab union lives in `apps/web/ce/components/pages/navigation-pane/index.ts` (`TPageNavigationPaneTab = "outline" | "info" | "assets"` + an ordered list). This task adds a "Comments" tab and a text-selection "Add comment" bubble, with resolve/unresolve toggles and @mention reuse. Add a dedicated `page_comments` flag to `SELF_HOSTED_FEATURE_FLAGS` (default `true`); tab hidden until backend lands. Orphaned anchors show `quoted_text` flagged "context changed" rather than mis-highlighting.

**Files:**
- `/Users/kunanonjarat/Developer/plane-preview/apps/web/ce/components/pages/navigation-pane/index.ts` (extend tab union + ordered list)
- New: `/Users/kunanonjarat/Developer/plane-preview/apps/web/core/components/pages/navigation-pane/tab-panels/comments.tsx`
- Editor selection bubble under `apps/web/core/components/pages/editor/`
- New: `/Users/kunanonjarat/Developer/plane-preview/apps/web/core/store/pages/page-comment.store.ts`
- Service: extend page service with comment methods
- Flag: `/Users/kunanonjarat/Developer/plane-preview/apps/web/ce/lib/self-host-entitlements.ts` (add `page_comments`)
- Tests (new): store + tab component tests

**TDD — failing test first:**
- vitest + RTL.
- `comments tab > given page_comments flag on and threads exist > then renders threads with resolve toggles`.
- `comments tab > given page_comments flag off > then tab is hidden`.
- `selection bubble > given text selected > then "Add comment" bubble appears and opens an anchored thread`.
- `comments tab > given an anchored comment whose quoted text was deleted > then shows quoted_text flagged "context changed", no mis-highlight` (edge).
- `comments tab > given a private page the user cannot read > then no comment requests fire` (no data leakage).
- Run red.

**Implementation outline:**
1. Add `page_comments` flag; extend the tab union + ordered list; register the Comments tab gated on the flag.
2. Store: threads, optimistic add/rollback, resolve/unresolve; immutable updates.
3. Selection bubble computes `{from,to,quoted_text}` from the editor selection; orphaned-anchor detection compares stored `quoted_text` to the current range and falls back to the "context changed" flag.
4. @mention reuses existing mention infra.

**Acceptance criteria:** as TDD list.

**Verify:** `pnpm --filter web vitest run <store+tab tests>`; `check:types`.

**Done when:** tests red→green; web suite green; type check clean; flag gating + orphaned-anchor handling verified.

---

## WIKI-T12 — `PageActivity` signal writes + merged activity feed endpoint

**Implements:** WIKI-E6 / WIKI-ACT-1 (M6)
**Depends on:** WIKI-T9 (model), WIKI-T10 (comment events)
**Risk tier:** R1 (signal-backed writes to a new table + read endpoint; rollback = disable signal handler)
**Worktree isolation:** n

**Context:** `PageActivity` exists (WIKI-T9) and comment resolution already writes rows (WIKI-T10). This task adds signal/service writes of `PageActivity` on page mutations and access/share/move/restore changes, plus a read endpoint returning a merged, paginated, chronological feed from `PageLog` + `PageComment` + `PageActivity`. Legacy pages (no activity rows) return version history only.

**Files:**
- Signal handler/service near existing activity signals (mirror `IssueActivity` signal conventions — grep for the issue activity signal registration)
- `/Users/kunanonjarat/Developer/plane-preview/apps/api/plane/app/views/page/base.py` (merge-feed view)
- `/Users/kunanonjarat/Developer/plane-preview/apps/api/plane/app/urls/page.py` (route)
- Tests (new): activity feed + signal test module

**TDD — failing test first:**
- pytest, `@pytest.mark.django_db`.
- `activities > given a page edited, commented, access-changed > then GET activities returns all three types reverse-chronological with actor+timestamp`.
- `activities > given a page access change > then a PageActivity row verb="access_changed" with actor is written` (signal).
- `activities > given a legacy page with no PageActivity rows > then feed returns version history without error`.
- `activities > given a non-member/GUEST-on-private > when GET activities > then 403` (authz; R0 gate).
- `activities > given the signal handler disabled (rollback path) > when a page mutates > then no PageActivity row written and the page op still succeeds`.
- Run red.

**Implementation outline:**
1. Add a signal handler (registered like the issue-activity signal) writing `PageActivity` rows for verbs `edited`/`commented`/`shared`/`access_changed`/`moved`/`restored`. Make it cleanly disableable (single registration point) for rollback.
2. Merge-feed view: union `PageLog` (edits/version events) + `PageComment` (non-deleted) + `PageActivity`, ordered by `epoch`/timestamp, paginated. Never expose comment bodies the requester cannot read.
3. Route: `GET .../pages/<page_id>/activities/` (paginated), `ProjectPagePermission`.

**Acceptance criteria:** as TDD list.

**Verify:** Docker pytest activity module; confirm 403 + legacy-page + rollback tests pass.

**Done when:** tests red→green; backend suite green; RBAC covered; rollback path verified (disabling signal does not break page mutation).

---

## WIKI-T13 — Activity tab with jump-to-version (gated on `audit_logs`)

**Implements:** WIKI-E6 / WIKI-ACT-2 (M6)
**Depends on:** WIKI-T12
**Risk tier:** R2 (frontend; gated)
**Worktree isolation:** n

**Context:** WIKI-T12 exposes a merged feed. This task adds an "Activity" tab in the navigation pane: timeline with avatars/timestamps/verbs and a "jump to version" link reusing `apps/web/core/components/pages/version/` components. Gated on `isSelfHostedFeatureEnabled("audit_logs")` (existing, `true`). Legacy pages show version history only.

**Files:**
- `/Users/kunanonjarat/Developer/plane-preview/apps/web/ce/components/pages/navigation-pane/index.ts` (extend union + ordered list)
- New: `/Users/kunanonjarat/Developer/plane-preview/apps/web/core/components/pages/navigation-pane/tab-panels/activity.tsx`
- Service: add `getActivities(...)` to the page service
- Reuse `apps/web/core/components/pages/version/` for jump-to-version
- Tests (new): activity tab component test

**TDD — failing test first:**
- vitest + RTL.
- `activity tab > given feed entries exist > then renders timeline with avatars, timestamps, verbs`.
- `activity tab > given a version-save entry > when clicking "jump to version" > then the version view opens that version`.
- `activity tab > given empty feed > then empty state renders, no error`.
- `activity tab > given audit_logs flag off > then tab hidden`.
- Run red.

**Implementation outline:**
1. Extend the tab union + ordered list; register Activity gated on `audit_logs`.
2. Render the merged feed; map version-save entries to the existing `version/` jump-to-version action.
3. Empty/loading/error states.

**Acceptance criteria:** as TDD list.

**Verify:** `pnpm --filter web vitest run <activity tab test>`; `check:types`.

**Done when:** tests red→green; web suite green; type check clean; gating verified.

---

## WIKI-T14 — Async export server path (Markdown/HTML/PDF, recursive) + signed-URL artifact

**Implements:** WIKI-E7 / WIKI-EXP-1 (M7)
**Depends on:** none
**Risk tier:** R1 (new public contract + worker + signed-URL handling; RBAC + signed-URL coverage required → else R0)
**Worktree isolation:** n

**Context (with verified correction):** The fork already ships a CLIENT-SIDE single-page export modal at `apps/web/core/components/pages/modals/export-page-modal.tsx` (PDF via `@react-pdf/renderer` + `@/components/editor/pdf` `PDFDocument`; Markdown via in-browser blob download). So export is PARTIAL, not missing. This task adds only the SERVER ASYNC path for HTML + `include_sub_pages` + large/recursive trees, producing a private `FileAsset` served via a signed, expiring URL. `FileAsset` (`apps/api/plane/db/models/asset.py`) already has a `page` FK and a `PAGE_DESCRIPTION` entity type with signed-URL access. Keep the client path for small single-page exports.

**Files:**
- New export view in `/Users/kunanonjarat/Developer/plane-preview/apps/api/plane/app/views/page/` (e.g. `export.py`)
- Worker task in the existing worker (Celery/bgtasks — confirm location; grep for existing task registration)
- `/Users/kunanonjarat/Developer/plane-preview/apps/api/plane/app/urls/page.py` (routes)
- API-key parity (trigger only): `api/v1/` route + scoping contract test
- Rate limiting via `apps/api/plane/.../rate_limit.py` (confirm path)
- Tests (new): export API + worker test module

**TDD — failing test first:**
- pytest, `@pytest.mark.django_db`.
- `export > given a readable page > when POST export {format: markdown} > then returns {export_id} and a job is enqueued`.
- `export status > given a completed export > when GET export/<id> > then {status: "completed", url} where url is a signed FileAsset link (never a raw object-store path)` (R0 gate: signed-URL).
- `export > given include_sub_pages=true and a descendant the requester cannot read > then that descendant is excluded from the artifact` (authz).
- `export > given the worker is down > when GET status > then status "queued", no crash`.
- `export > given a non-member/GUEST-on-private > when POST export > then 403` (R0 gate).
- `export > given an invalid format > when POST > then 400`.
- `export (api-key) > given a scoped key > when POST trigger > then scoping enforced`.
- Run red (routes 404).

**Implementation outline:**
1. Confirm `FileAsset` `PAGE_DESCRIPTION`/private + signed-URL helper; confirm worker task registration pattern and rate-limit util path.
2. `POST .../pages/<page_id>/export/` body `{format, include_sub_pages}` → enqueue worker, return `{export_id}`. `GET .../export/<export_id>/` → `{status, url}` (signed URL only when completed).
3. Worker renders the page (and readable descendants when recursive) to the requested format, stores a PRIVATE `FileAsset`, sets status. Exclude unreadable/private descendants.
4. Rate-limit the trigger; `ProjectPagePermission` on both routes. API-key parity for trigger only with a scoping contract test.

**Acceptance criteria:** as TDD list; artifacts are private and served only via expiring signed URLs.

**Verify:** Docker pytest export module; confirm 403, signed-URL, recursive-exclusion, and api-key scoping tests pass.

**Done when:** tests red→green; backend suite green; RBAC + signed-URL + recursive-exclusion covered (R0 gate satisfied). Note in the PR that the client-side path remains for small single-page exports and the PRD's "[MISSING]" should read "[PARTIAL]".

---

## WIKI-T15 — Export menu: add HTML + include_sub_pages + async progress/polling

**Implements:** WIKI-E7 / WIKI-EXP-2 (M7)
**Depends on:** WIKI-T14
**Risk tier:** R2 (frontend; behind a `page_export` flag for the server path)
**Worktree isolation:** n

**Context:** The ⋯ menu (`apps/web/core/components/pages/editor/toolbar/options-dropdown.tsx`) already opens `ExportPageModal` (PDF+Markdown client-side, single page). This task extends the modal to add HTML format + an `include_sub_pages` checkbox + a server-async branch (request export, poll status, reveal download link). Add a `page_export` flag (default `true`) gating the server-async features; existing client PDF/Markdown stays available.

**Files:**
- Edit: `/Users/kunanonjarat/Developer/plane-preview/apps/web/core/components/pages/modals/export-page-modal.tsx`
- Edit: `/Users/kunanonjarat/Developer/plane-preview/apps/web/core/components/pages/editor/toolbar/options-dropdown.tsx`
- Service: add `requestExport(...)` / `getExportStatus(...)` to the page service
- Store: export polling state (in page store or a small export slice)
- Flag: add `page_export` to `self-host-entitlements.ts`
- Tests (new): modal component test

**TDD — failing test first:**
- vitest + RTL.
- `export modal > given page_export flag on > then HTML format option and include_sub_pages checkbox render`.
- `export modal > given a server export started > when polling reports completed > then a download link is revealed`.
- `export modal > given page_export flag off (rollback) > then the Export item/server options are hidden` (client PDF/Markdown unaffected — assert they still render).
- `export modal > given the job stays queued (worker down) > then UI keeps polling without error`.
- Run red.

**Implementation outline:**
1. Add `page_export` flag; gate HTML + sub-pages + server-async branch behind it.
2. Service methods call WIKI-T14 routes; poll status with backoff; reveal signed-URL download link on completion.
3. Keep the existing client-side PDF/Markdown path intact and ungated.

**Acceptance criteria:** as TDD list.

**Verify:** `pnpm --filter web vitest run <export modal test>`; `check:types`.

**Done when:** tests red→green; web suite green; type check clean; flag gating + polling verified.

---

## WIKI-T16 — External-URL embed extension (Figma/Loom allowlist) + server-side sanitize

**Implements:** WIKI-E8 / WIKI-EMBED-1 (M8)
**Depends on:** none
**Risk tier:** R2 (editor-package + frontend; allowlist + sanitize test required to merge)
**Worktree isolation:** n

**Context:** The editor (`@plane/editor`, registered in `apps/web/core/components/pages/editor/editor-body.tsx` via `CollaborativeDocumentEditorWithRef`) already supports image/code/work-item embeds. The CE embed surface (`apps/web/ce/components/pages/editor/embed/`) currently only shows an upgrade card. This task adds a generic external-URL embed extension with a host allowlist (Figma/Loom + known hosts), persisted in the page document JSON/HTML, rendered in a sandboxed iframe. The URL allowlist must be validated client-side AND on the server page-save sanitize path (`apps/api/plane/db/models/page.py`).

**Files:**
- `@plane/editor` package: new embed extension (find where image/code/work-item embeds are registered — `packages/editor/`)
- Register in `apps/web/ce/components/pages/editor/embed/` and/or `editor-body.tsx`
- Server sanitize: `/Users/kunanonjarat/Developer/plane-preview/apps/api/plane/db/models/page.py` (`save()` path — strip disallowed embed nodes)
- Tests (new): extension unit test (vitest) + server sanitize test (pytest)

**TDD — failing test first:**
- vitest (extension): `external embed > given an allowlisted Figma URL > then renders a sandboxed iframe and persists an embed node`. `external embed > given a non-allowlisted host > then rejected and rendered as a plain link`. `external embed > given render > then uses sandbox attributes, never dangerouslySetInnerHTML of raw remote HTML`. `external embed > given extension unregistered (rollback) > then existing embeds degrade to plain link, no crash`.
- pytest (server): `page save > given document JSON with a non-allowlisted embed node > when saved > then the disallowed node is stripped/rejected` (defense in depth; R0 gate for the sanitize path).
- Run both red.

**Implementation outline:**
1. Build the extension with an exported allowlist constant; validate URL host on insert. Render via sandboxed `<iframe sandbox=...>`; no raw remote HTML injection.
2. Persist nodes through the existing `description_json`/`_html` save path.
3. Server: in the page `save()` sanitize, parse embed nodes and strip any whose host is not allowlisted.

**Acceptance criteria:** as TDD list.

**Verify:** `pnpm --filter editor vitest run <ext test>` (confirm package filter) + Docker pytest server sanitize test; `check:types`.

**Done when:** both test sets red→green; web + backend suites green; allowlist enforced on client AND server (R0 gate satisfied).

---

## WIKI-T17 — AI assist endpoint (summarize/outline/continue) + provider wrapper

**Implements:** WIKI-E9 / WIKI-AI-1 (M9)
**Depends on:** none
**Risk tier:** R1 (secrets-sensitive; fail-closed + no-prompt-logging tests required; new session contract)
**Worktree isolation:** n

**Context:** A session-only AI assist endpoint that routes strictly through the instance's configured self-host provider (no Plane Cloud). The fork already has CE `editor/ai/menu.tsx` and an `AIService` client; this task adds the SERVER route. Build a wrapper seam over the provider SDK so tests mock the wrapper (not the SDK). Never persist prompts; usage logs store action + page id + token counts only — never prompt bodies or API keys. Fail closed when the provider is unconfigured/outage. Session-only (no API-key parity).

**Files:**
- New AI view in `/Users/kunanonjarat/Developer/plane-preview/apps/api/plane/app/views/page/` (session route)
- `/Users/kunanonjarat/Developer/plane-preview/apps/api/plane/app/urls/page.py` (route)
- New owned wrapper module around the provider SDK (place near existing provider/config code; grep for current AI/provider config)
- Rate limiting via the rate-limit util
- Tests (new): AI endpoint module (mock the wrapper)

**TDD — failing test first:**
- pytest, `@pytest.mark.django_db`, mocking the owned wrapper.
- `ai assist > given configured provider and ai_copilot on > when POST ai/assist {action: summarize} on a readable page > then returns a suggestion AND the prompt body is not persisted or logged` (assert log capture contains action+page id+token counts, NOT prompt body or key) (R0 gate).
- `ai assist > given unconfigured provider > when POST > then fails closed with a user-facing error (editor remains usable)`.
- `ai assist > given provider outage/quota error > when POST > then user-facing error returned`.
- `ai assist > given a non-member/GUEST-on-private page > when POST > then 403` (authz; R0 gate).
- Run red (route 404).

**Implementation outline:**
1. Create the wrapper module exposing `summarize/outline/continue`; read provider creds from server config/Secret Manager (reference by name; never log). Tests mock this wrapper.
2. `POST .../pages/<page_id>/ai/assist/` body `{action, selection?}` → wrapper call → suggestion (stream or JSON). `ProjectPagePermission` for page read; rate-limited.
3. Fail-closed: unconfigured/outage → user-facing error, no crash. Log only action + page id + token counts.

**Acceptance criteria:** as TDD list; no API-key parity (session-only).

**Verify:** Docker pytest AI module; confirm fail-closed, no-prompt-logging, and 403 tests pass.

**Done when:** tests red→green; backend suite green; RBAC + fail-closed + no-prompt-logging covered (R0 gate satisfied).

---

## WIKI-T18 — AI editor action: enable `ai` extension gated on `ai_copilot` + provider config

**Implements:** WIKI-E9 / WIKI-AI-2 (M9)
**Depends on:** WIKI-T17
**Risk tier:** R2 (frontend flagging + UI; independent of the collaboration_cursor logic)
**Worktree isolation:** n

**Context:** `use-editor-flagging.ts` hard-disables `"ai"` for all profiles (WIKI-T1 intentionally left this alone). With the server AI endpoint live (WIKI-T17), this task conditionally drops `"ai"` from `disabled` based on `isSelfHostedFeatureEnabled("ai_copilot")` (existing, `true`) AND a provider-configured state, and wires the floating AI action / `/ai` slash command (reuse CE `editor/ai/menu.tsx`). When the provider is unconfigured, the action is disabled with a tooltip and the editor stays fully usable.

**Files:**
- Edit: `/Users/kunanonjarat/Developer/plane-preview/apps/web/ce/hooks/use-editor-flagging.ts` (conditional `ai` disable)
- Provider-configured state source (grep for how the web app learns the AI provider is configured — likely an instance/config store or the `AIService`)
- CE `editor/ai/menu.tsx` + editor toolbar (floating action / `/ai`)
- Tests (new): hook test (extend the WIKI-T1 test file or add a new one)

**TDD — failing test first:**
- vitest.
- `useEditorFlagging > given ai_copilot true and provider configured > then "ai" is NOT in disabled`.
- `useEditorFlagging > given ai_copilot true but provider unconfigured > then "ai" stays disabled (and the action shows disabled-with-tooltip)`.
- `useEditorFlagging > given ai_copilot false > then "ai" stays disabled regardless of provider`.
- (Do not regress WIKI-T1: `collaboration-cursor` logic unchanged.)
- Run red.

**Implementation outline:**
1. In `use-editor-flagging.ts`, compute the `ai` disable independently from `collaboration-cursor`: include `"ai"` in `disabled` unless `ai_copilot` is on AND provider is configured.
2. Wire the `/ai` slash command / floating action; disabled-with-tooltip when unconfigured.
3. Keep the WIKI-T1 collaboration logic intact.

**Acceptance criteria:** as TDD list.

**Verify:** `pnpm --filter web vitest run <flagging test>`; `check:types`.

**Done when:** tests red→green; web suite green; type check clean; WIKI-T1 cursor behavior not regressed.

---

## WIKI-T19 — Teamspace models + `TeamspacePermission` + migrations

**Implements:** WIKI-E10 / WIKI-TEAM-1, WIKI-TEAM-2 (models + permission) (M10)
**Depends on:** none (pattern reuse from WIKI-T6/T9)
**Risk tier:** R1 (three new models + new permission class + additive migrations)
**Worktree isolation:** y (migrations)

**Context:** plane.so groups pages into named spaces crossing project boundaries; the fork has no such concept. This task adds `Teamspace`, `TeamspaceMember`, `TeamspacePage` (junction) and a `TeamspacePermission` class. The junction must use the `deleted_at`-aware unique constraint pattern already used by `ProjectPage` in `apps/api/plane/db/models/page.py`. Pages may belong to a teamspace AND/OR projects; no migration of existing project bindings.

**Files:**
- `/Users/kunanonjarat/Developer/plane-preview/apps/api/plane/db/models/` (new module(s) for the three models)
- `/Users/kunanonjarat/Developer/plane-preview/apps/api/plane/db/models/__init__.py` (register)
- New `TeamspacePermission` in `/Users/kunanonjarat/Developer/plane-preview/apps/api/plane/app/permissions/` (parallel to `ProjectPagePermission`)
- New migrations (three `CreateModel`s) under `db/migrations/`
- Tests (new): model + permission test module

**TDD — failing test first:**
- pytest, `@pytest.mark.django_db`.
- `Teamspace > given name+visibility+lead+workspace > then persists`.
- `TeamspaceMember > given add same (teamspace, member) twice while deleted_at null > then unique constraint enforced (idempotent/reject)`.
- `TeamspacePage > given add same (teamspace, page) twice while deleted_at null > then unique constraint enforced; matches ProjectPage pattern`.
- `TeamspacePermission > given a private teamspace and a non-member > then read denied (403-equivalent)`.
- `TeamspacePermission > given a non-ADMIN member changing space settings > then denied`.
- Run red.

**Implementation outline:**
1. Inspect `ProjectPage` for the `deleted_at`-aware `UniqueConstraint`/`condition` pattern; replicate for `TeamspaceMember` (`(teamspace, member, deleted_at)`) and `TeamspacePage` (`(teamspace, page)` when `deleted_at IS NULL`).
2. `Teamspace(BaseModel)`: `workspace` FK, `name`, `description`, `logo_props` JSON, `visibility` (public/private), `lead` FK. `TeamspaceMember(BaseModel)`: `teamspace`/`member` FKs, `role`, `is_active`. `TeamspacePage(BaseModel)`: `teamspace`/`page` FKs.
3. `TeamspacePermission`: read gated by space membership (private spaces), space settings gated to workspace ADMIN. All queries filter by `workspace__slug`.
4. Three migrations; reverse drops them with no data loss to existing pages.

**Acceptance criteria:** as TDD list; junction matches `ProjectPage` constraint pattern.

**Verify:** Docker pytest model+permission module; migration round-trip.

**Done when:** tests red→green; backend suite green; migrations reversible; permission denials covered (R0 gate).

---

## WIKI-T20 — Teamspace API: CRUD + members + page assignment

**Implements:** WIKI-E10 / WIKI-TEAM-1, WIKI-TEAM-2 (M10)
**Depends on:** WIKI-T19
**Risk tier:** R1 (new public contract; RBAC required → else R0)
**Worktree isolation:** n

**Context:** With teamspace models + `TeamspacePermission` in place, add CRUD for spaces, member add/remove, and page add/remove. Critical RBAC rule: adding a page to a teamspace does NOT bypass the page's own `ProjectPagePermission` read gate — private/owner-gated pages stay denied to non-owners even inside the space. Cross-workspace references rejected.

**Files:**
- New views + serializers under `/Users/kunanonjarat/Developer/plane-preview/apps/api/plane/app/views/page/` (or a new `views/teamspace/`)
- New `urls/teamspace.py` (or routes in `urls/page.py`), wired into `plane.app.urls`
- Tests (new): teamspace API module

**TDD — failing test first:**
- pytest, `@pytest.mark.django_db`.
- `teamspaces > given workspace ADMIN > when POST teamspaces with name+visibility+lead > then created under correct workspace FK`.
- `teamspaces > given non-admin member > when POST/PATCH space settings > then 403` (authz; R0 gate).
- `teamspaces > given invalid visibility > when POST > then 400`.
- `teamspaces > given a teamspace in another workspace > when requested by id > then not returned` (isolation).
- `members > given POST members/<user_id> > then TeamspaceMember created (idempotent on unique constraint); DELETE deactivates`.
- `pages > given private teamspace > when non-member requests its pages > then 403`.
- `pages > given POST teamspaces/<id>/pages/<page_id> > then TeamspacePage link created; duplicate add rejected/idempotent`.
- `pages > given a page added to a space whose own access is private+owner-gated > when a space member who is not the page owner requests it > then the page's own RBAC still denies read` (critical cross-gate; R0 gate).
- `pages > given a page already bound to projects > when attached to a teamspace > then it belongs to both`.
- Run red.

**Implementation outline:**
1. Views/serializers mirroring existing patterns; enforce `TeamspacePermission` for space ops and `ProjectPagePermission` for the underlying page read on page-list.
2. Routes: `GET/POST workspaces/<slug>/teamspaces/`, `GET/PATCH/DELETE .../teamspaces/<id>/`, `POST/DELETE .../teamspaces/<id>/members/<user_id>/`, `POST/DELETE .../teamspaces/<id>/pages/<page_id>/`.
3. Page-list within a space filters each page through its own read RBAC (no bypass).

**Acceptance criteria:** as TDD list; the cross-gate test (space membership does not override private-page RBAC) MUST pass.

**Verify:** Docker pytest teamspace module; confirm all 403/400/isolation/cross-gate tests pass.

**Done when:** tests red→green; backend suite green; RBAC + cross-gate + isolation covered (R0 gate satisfied).

---

## WIKI-T21 — Teamspace store/service + left-sidebar grouping (gated on `teamspaces`)

**Implements:** WIKI-E10 / WIKI-TEAM-3 (M10)
**Depends on:** WIKI-T20
**Risk tier:** R2 (frontend; gated; largest UI surface)
**Worktree isolation:** y (new top-level navigation surface; isolate to avoid sidebar churn)

**Context:** Add collapsible teamspace folders to the left sidebar with page-count badges and a "manage space" menu, plus a MobX store and service mirroring the WIKI-T8 store/service pattern. Routes nest under `apps/web/app/(all)/[workspaceSlug]/(projects)/...`. Gated on `isSelfHostedFeatureEnabled("teamspaces")` (existing, `true`); sidebar group hidden until backend lands. Handle visibility-flip-while-open by re-evaluating access on next read.

**Files:**
- New: `apps/web/core/store/<teamspace store>.ts` (confirm store dir convention)
- Service: new teamspace service (alongside the page service pattern)
- Left-sidebar component + routes under `apps/web/app/(all)/[workspaceSlug]/(projects)/...` and `apps/web/app/routes/core.ts`
- Tests (new): store + sidebar component tests

**TDD — failing test first:**
- vitest + RTL.
- `teamspace sidebar > given teamspaces flag on and member of a space > then renders the space folder with a page-count badge and a manage menu`.
- `teamspace sidebar > given no teamspaces > then empty state "Create a teamspace to group related pages." renders`.
- `teamspace sidebar > given teamspaces flag off > then the group is hidden`.
- `teamspace sidebar > given a space visibility flips to private while a contained page is open > then access reflects new visibility on next read (no content leak)` (edge).
- Run red.

**Implementation outline:**
1. Store + service mirroring WIKI-T8; immutable state; page-count derived getters.
2. Sidebar group gated on the flag; collapsible folders, count badges, manage menu.
3. Add routes; re-evaluate access on navigation/read for visibility changes.

**Acceptance criteria:** as TDD list.

**Verify:** `pnpm --filter web vitest run <store+sidebar tests>`; `check:types`.

**Done when:** tests red→green; web suite green; type check clean; gating + visibility-flip handling verified.

---

## Execution order & parallelism

Dependency graph (→ = "must land before"):

```
WIKI-T1                                  (M1, R2)  — independent
WIKI-T2 → WIKI-T3                         (M2, R1→R2)
WIKI-T4 → WIKI-T5                         (M3, R2)
WIKI-T6 → WIKI-T7 → WIKI-T8               (M4, R1→R1→R2)
WIKI-T9 → WIKI-T10 → WIKI-T11             (M5, R1→R1→R2)
        ↘ WIKI-T10 ↘
WIKI-T9, WIKI-T10 → WIKI-T12 → WIKI-T13   (M6, R1→R2)   [T12 needs T9 model + T10 comment events]
WIKI-T14 → WIKI-T15                        (M7, R1→R2)
WIKI-T16                                   (M8, R2)  — independent
WIKI-T17 → WIKI-T18                        (M9, R1→R2)
WIKI-T19 → WIKI-T20 → WIKI-T21            (M10, R1→R1→R2)
```

Only cross-epic dependency: **WIKI-T12 depends on both WIKI-T9 (PageActivity model) and WIKI-T10 (comment events)**. Everything else is within-epic linear.

Parallel worktree batches (each batch's cards have no cross-dependencies and can run in separate worktrees concurrently; migration-bearing cards — T2, T6, T9, T19 — are flagged worktree-isolation `y` to avoid colliding migration numbers, so stagger their migration-number assignment or rebase before merge):

- **Batch A (kickoff, fully parallel, no deps):** WIKI-T1, WIKI-T2, WIKI-T4, WIKI-T6, WIKI-T9, WIKI-T14, WIKI-T16, WIKI-T17, WIKI-T19.
  - Migration-isolated within this batch: T2, T6, T9, T19 — assign sequential migration numbers up front (or rebase) to prevent clashes.
- **Batch B (after their Batch-A parent):** WIKI-T3 (after T2), WIKI-T5 (after T4), WIKI-T7 (after T6), WIKI-T10 (after T9), WIKI-T15 (after T14), WIKI-T18 (after T17), WIKI-T20 (after T19).
- **Batch C:** WIKI-T8 (after T7), WIKI-T11 (after T10), WIKI-T12 (after T9 + T10), WIKI-T21 (after T20).
- **Batch D:** WIKI-T13 (after T12).

Recommended merge ordering by ascending risk/structural footprint: land M1 (T1) first to prove the entitlement-wiring pattern, then the read-only M2/M3 chains (T2–T5), then the model-bearing M4/M5 chains (T6–T11), then M6 (T12–T13), M7 (T14–T15), M8 (T16), M9 (T17–T18), and finally the largest schema footprint M10 (T19–T21).

R0 reminder applied to every server card (T2, T4, T7, T10, T12, T14, T17, T20): the card does not merge unless its RBAC/403 tests pass, and rich-text writes (T6, T9, T10, T16) additionally require a passing sanitize-on-save test. Verification commands in each card are `assumed` for the exact Docker/pnpm invocation — the executing subagent must confirm against `/Users/kunanonjarat/Developer/plane-preview/TESTING.md` and `BUILD.md` before claiming green.
