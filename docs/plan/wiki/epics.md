# Wiki & Pages — Epics

These epics decompose the **PARTIAL** and **MISSING** capabilities scoped in [docs/prd-wiki-2026-06-07.md](docs/prd-wiki-2026-06-07.md) into deliverable units of work. They deliberately **exclude** everything already PRESENT in the fork — hierarchy/nesting, `PageVersion` versioning, the public/private `access` toggle, markdown/code blocks, image/work-item embeds, and the auto-generated table of contents — none of which need rebuilding.

Each epic maps to one or more PRD milestones (M1–M10) and is grounded in the verified fork surfaces: the `Page`/`PageVersion`/`PageLog`/`FileAsset` data layer (`apps/api/plane/db/models/`), the DRF page API (`apps/api/plane/app/views/page/`, `urls/page.py`, `serializers/page.py`), the `ProjectPagePermission` RBAC class (`apps/api/plane/app/permissions/page.py`), the React Router 7 + MobX web app (`apps/web/{core,ce}`), and the self-host entitlement registry (`apps/web/ce/lib/self-host-entitlements.ts`). Verified: `SELF_HOSTED_FEATURE_FLAGS` currently exposes `ai_copilot`, `teamspaces`, `templates`, `public_views_pages`, `audit_logs` (all `true`) but **no** `collaboration_cursor` flag; `useEditorFlagging` hard-codes `disabled: ["ai", "collaboration-cursor"]` for all three editor profiles; `ProjectPagePermission` gates private pages owner-only with ADMIN/MEMBER create+edit, GUEST read, ADMIN delete.

Conventions for every epic below: acceptance criteria are written in Given/When/Then; all are delivered TDD-first (RED test named before implementation); migrations are additive with forward + rollback; new server surfaces enforce workspace/project RBAC via `ProjectPagePermission` (or a new `TeamspacePermission`); all rich text is sanitized on save mirroring `IssueComment`; every UI surface is gated behind a flag in `self-host-entitlements.ts` and stays hidden until the backend lands (no "coming soon" stubs).

---

## WIKI-E1 — Live Cursors & Presence Entitlement Unlock

**User value:** Editors collaborating on the same page see each other's live cursors, selections, and presence avatars in real time, turning page editing from solo document work into genuine co-authoring — the headline collaboration capability that is scaffolded but switched off today.

**Scope (in):**
- Add a new `collaboration_cursor` flag to `SELF_HOSTED_FEATURE_FLAGS`.
- Make `useEditorFlagging` conditionally drop `"collaboration-cursor"` from each profile's `disabled` array when the flag is on.
- Verify presence/cursor wiring against the existing `apps/live` collaboration server with the existing `@plane/editor` `CollaborativeDocumentEditorWithRef`.
- Fail-closed fallback: when `apps/live` is unreachable, the editor degrades to non-realtime save without crashing.

**Out of scope:**
- No new collaboration transport — reuse `apps/live` as-is (PRD non-goal).
- No new realtime event types beyond the existing mention/page events in `hooks/use-realtime-page-events.tsx`.
- AI extension stays disabled here (covered by WIKI-E9).

**Technical requirements (fork files):**
- `apps/web/ce/lib/self-host-entitlements.ts` — add `collaboration_cursor: true` to `SELF_HOSTED_FEATURE_FLAGS` (the `TSelfHostedFeatureFlag` type derives automatically from the object keys).
- `apps/web/ce/hooks/use-editor-flagging.ts` — replace the hard-coded `disabled: ["ai", "collaboration-cursor"]` with logic that reads `isSelfHostedFeatureEnabled("collaboration_cursor")` and only includes `"collaboration-cursor"` in `disabled` when the flag is `false`, for all three profiles (`document`, `liteText`, `richText`).
- `apps/web/core/components/pages/editor/editor-body.tsx` — confirm `CollaborativeDocumentEditorWithRef` honors the updated disabled list.
- Verify against `apps/live` and `apps/web/core/components/pages/editor/.../hooks/use-realtime-page-events.tsx`.

**Security:**
- Frontend-only flag flip; no new data surface, no RBAC change. Presence is constrained to users already authorized into the live document session by the existing `apps/live` auth.
- Fail-closed: live-server outage must not expose stale/cross-user state — fall back to local non-realtime save.

**Dependencies:** None. This is the foundation milestone (M1) and unblocks nothing else structurally, but proves the entitlement-wiring pattern reused by every later epic.

**Epic acceptance criteria:**
- **Given** the `collaboration_cursor` flag is `true`, **When** `useEditorFlagging` runs for the `document` profile, **Then** `disabled` does **not** contain `"collaboration-cursor"` (but still contains `"ai"`).
- **Given** the flag is `false`, **When** `useEditorFlagging` runs for any profile, **Then** `disabled` contains `"collaboration-cursor"`.
- **Given** two authenticated members editing the same page with the flag on, **When** one moves their cursor, **Then** the other sees the live cursor and presence avatar.
- **Given** `apps/live` is unreachable, **When** a member opens the page, **Then** the editor loads in non-realtime mode and saves still succeed (fail-closed).

**Risk tier:** **R2** — frontend-only, green-tested entitlement flip with a revertable single commit; no schema, no new contract.

**Entitlement flag:** `collaboration_cursor` (new).

---

## WIKI-E2 — Full-Text Content Search with Snippets & Breadcrumb Path

**User value:** Cmd/Ctrl-K search finds pages by their **content**, not just their title, and shows a highlighted snippet plus the page's ancestor breadcrumb so users can identify and jump to the right page even when they don't remember its name.

**Scope (in):**
- Extend `GlobalSearchEndpoint.filter_pages()` to match `description_stripped` in addition to `name`.
- Return a `snippet` (highlighted/truncated excerpt around the match) and `parent_path` (breadcrumb of ancestor page names via the `parent` self-FK) on each result object.
- Add a Postgres functional full-text index migration (`GIN to_tsvector('english', ...)` over `name` + `description_stripped`, or `pg_trgm` GIN on `description_stripped`).
- Render snippet + breadcrumb in the Cmd/Ctrl-K result row.

**Out of scope:**
- No semantic/vector search — Postgres text full-text only (PRD non-goal).
- No new search route — extend the existing `filter_pages` result shape only.
- No cross-workspace search; existing tenancy filter preserved.

**Technical requirements (fork files):**
- `apps/api/plane/app/views/search/base.py` — extend `GlobalSearchEndpoint.filter_pages()`; current behavior is `name__icontains` only, returning `name`, `id`, `project_ids`, `project_identifiers`, `workspace__slug`. Add `description_stripped` matching, compute `snippet` and `parent_path`, preserve the existing membership filter (`projects__project_projectmember__member=self.request.user`).
- New migration in `apps/api/plane/db/migrations/` — functional `GIN` index on `pages`; `atomic = False` with `CREATE INDEX CONCURRENTLY` to avoid table locks; rollback drops the index and the query falls back to `icontains`.
- `apps/web/core/components/power-k/ui/pages/` — render `snippet` excerpt and `parent_path` breadcrumb in the result row.

**Security:**
- Content matching constrained to the requester's project membership (preserve the existing `projects__project_projectmember__member=self.request.user` filter) — no cross-tenant or private-page leakage.
- Cap snippet length to bound payload and avoid leaking large private content blobs into result previews.

**Dependencies:** None (read-only over existing `Page.description_stripped`). Independent of all other epics.

**Epic acceptance criteria:**
- **Given** a page whose body contains "quarterly roadmap" but whose title does not, **When** a member searches "quarterly roadmap", **Then** the page appears in results.
- **Given** a content match, **When** results render, **Then** each result includes a non-empty `snippet` excerpt and a `parent_path` breadcrumb of ancestor page names.
- **Given** a page in a project the requester is **not** a member of, **When** they search its content, **Then** that page is excluded from results.
- **Given** the functional index migration, **When** it is applied then reversed on the Docker test DB, **Then** both run clean and the query still returns correct results after rollback (via `icontains` fallback).

**Risk tier:** **R1** — adds a schema object (index) requiring reverse-migration review, but additive and non-destructive; query change is read-only.

**Entitlement flag:** None (search is core; no gate). Snippet/breadcrumb render unconditionally once the API returns them.

---

## WIKI-E3 — Bi-Directional Page Backlinks (Read API + Panel)

**User value:** On any page, users see which other pages link to or mention it — a backlink panel that surfaces the document's place in the knowledge graph, built entirely from data the fork already records but never exposes.

**Scope (in):**
- A read endpoint returning pages whose `PageLog` references the target page (`back_link` / `page_mention` entity types).
- A collapsible "Backlinks" section in the navigation pane (under Info) listing referencing pages.
- Resolve backlinks that point at a soft-deleted or moved page to the new page (`moved_to_page`) or exclude them.

**Out of scope:**
- No premium link-graph visualization — backlink list only (PRD non-goal).
- No write/edit of links (links are created via existing editor mention infra).
- No schema change — read over existing `PageLog`.

**Technical requirements (fork files):**
- `apps/api/plane/db/models/page.py` — `PageLog` already stores `back_link`/`forward_link`/`page_mention`/`user_mention` entity-link rows; this epic reads them, no model change.
- `apps/api/plane/app/views/page/base.py` — add a backlinks action/view returning referencing pages.
- `apps/api/plane/app/urls/page.py` — add `GET workspaces/<slug>/projects/<project_id>/pages/<page_id>/backlinks/` (scoped pattern matches existing routes like `.../pages/<page_id>/lock/`).
- `apps/api/plane/app/serializers/page.py` — backlink result serializer.
- `apps/web/core/components/pages/editor/.../navigation-pane/` — collapsible "Backlinks" section under Info.

**Security:**
- Route passes `ProjectPagePermission`; backlinks read requires the same read access as the underlying page (private pages stay owner-gated).
- Exclude soft-deleted referencing pages and pages the requester cannot read from the returned list.

**Dependencies:** None for the API. The navigation-pane panel shares pane scaffolding with WIKI-E5 (Comments tab) and WIKI-E6 (Activity tab) but does not block them.

**Epic acceptance criteria:**
- **Given** Page B contains a mention/link to Page A recorded in `PageLog`, **When** a member requests Page A's backlinks, **Then** Page B is in the response.
- **Given** a referencing page was soft-deleted, **When** backlinks are requested, **Then** it is excluded.
- **Given** a referencing page was moved (`moved_to_page` set), **When** backlinks are requested, **Then** the new page is returned (not the tombstone).
- **Given** a non-member or GUEST-on-private requester, **When** they request backlinks, **Then** the API returns 403.

**Risk tier:** **R2** — read-only endpoint over existing data, no schema risk; UI is revertable. (RBAC + a 403 test still required to merge, per PRD R0 rule.)

**Entitlement flag:** None (backlinks read uses page read access). Panel renders for any readable page.

---

## WIKI-E4 — Page Templates

**User value:** Teams capture repeatable document structures — meeting notes, runbooks, project charters — once, then spin up a pre-filled page from a gallery in two clicks, instead of copy-pasting from an old page every time.

**Scope (in):**
- A new `PageTemplate` model (workspace-scoped, optional project scope, public/private access).
- CRUD API: list (workspace-global + project), create, retrieve, update, delete.
- An "instantiate from template" endpoint that clones `description_*` + `logo_props` into a new `Page` and returns it.
- A template-gallery modal off "Create Page" with cards per `template_type` (`meeting_notes`/`runbook`/`charter`/`custom`), "Blank page" first; new MobX store slice + service.
- "Save as template" entry from a page's ⋯ menu.

**Out of scope:**
- Templates carry only document content + `logo_props` — no labels/states/members cloning (PRD edge case: inherently safe).
- No template marketplace or cross-workspace sharing.

**Technical requirements (fork files):**
- `apps/api/plane/db/models/page.py` (or new module) + register in `apps/api/plane/db/models/__init__.py` — `PageTemplate` extends `BaseModel`: `workspace` FK, `name`, `description_html`/`_json`/`_binary`/`_stripped`, `logo_props` JSON, `template_type`, `access` (PRIVATE/PUBLIC mirroring `Page`), `owned_by` FK, optional `project` FK (null = workspace-global), `sort_order`. Sanitize/strip on `save()` like `Page`.
- New view in `apps/api/plane/app/views/page/` + serializer in `apps/api/plane/app/serializers/page.py`.
- `apps/api/plane/app/urls/page.py` — `GET/POST workspaces/<slug>/page-templates/`, `GET/PATCH/DELETE .../page-templates/<template_id>/`, `POST workspaces/<slug>/projects/<project_id>/pages/from-template/<template_id>/`.
- API-key parity (`api/v1/` via `apps/api/plane/api/urls/`) for template-apply only, with a contract test proving scoping.
- Additive `CreateModel` migration; rollback = `migrate <app> <prev>` + drop table.
- `apps/web/core/components/pages/modals/` — gallery modal gated on `isSelfHostedFeatureEnabled("templates")`; empty state copy "No templates yet — create one from any page via the ⋯ menu."
- `apps/web/core/store/pages/page-template.store.ts` (new) + service in `packages/services`.

**Security:**
- All routes pass `ProjectPagePermission`; template apply requires read access to the template and create access on the target project (ADMIN/MEMBER, mirroring `_check_project_action_access` POST rule).
- Template HTML sanitized on save (same path as `Page`/`IssueComment`).
- Cross-workspace template ids rejected (contract test asserts).
- Private templates owner-gated like private pages.

**Dependencies:** Establishes the model/migration/store/service pattern reused by WIKI-E5 and WIKI-E10. Independent at the API level.

**Epic acceptance criteria:**
- **Given** a `meeting_notes` template, **When** a MEMBER instantiates it in a project, **Then** a new `Page` is created with the template's `description_*` and `logo_props` cloned, and the response returns the new page.
- **Given** a template id belonging to another workspace, **When** a user applies it, **Then** the API returns an error (cross-workspace rejected).
- **Given** the `templates` flag is on and at least one template exists, **When** a user opens "Create Page", **Then** the gallery shows "Blank page" first then template cards by type.
- **Given** a GUEST in a project, **When** they POST to create a template, **Then** the API returns 403 (create restricted to ADMIN/MEMBER).
- **Given** the `CreateModel` migration, **When** applied then reversed on the test DB, **Then** both run clean with no destructive operation.

**Risk tier:** **R1** — new model + new public contract (incl. API-key surface); additive, flag-gated, reverse-migration reviewed. Any route landing without RBAC + sanitize tests is **R0** and must not merge.

**Entitlement flag:** `templates` (existing, already `true`). Gallery hidden until backend lands.

---

## WIKI-E5 — Inline Comments & Threaded Discussions

**User value:** Reviewers leave comments anchored to a specific text selection on a page, reply in threads, @mention teammates, and resolve discussions — turning pages into a review surface instead of forcing feedback into a separate channel.

**Scope (in):**
- A new `PageComment` model: whole-page or text-anchored (`anchor` JSON `{from,to,quoted_text}`), threaded via `parent` self-FK, resolve/unresolve, soft-delete, @mention.
- A lightweight `PageActivity` model introduced here (its feed surface lands in WIKI-E6) to log comment events.
- CRUD + resolve API.
- A "Comments" tab in the right navigation pane; text selection shows an "Add comment" bubble that opens the thread; resolve toggle; @mention reuses existing mention infra.
- Orphaned-anchor handling: if anchored text was deleted/edited, show the quoted snippet and flag "context changed" rather than mis-highlighting.

**Out of scope:**
- `PageCommentReaction` is v2/optional (PRD).
- Comment edit history/versioning.

**Technical requirements (fork files):**
- `apps/api/plane/db/models/` + `__init__.py` — `PageComment` (`page_comments`) extends `BaseModel`: `workspace` FK, `page` FK, `actor` FK, `parent` self-FK, `comment_html`/`_json`/`_stripped`, `anchor` JSON null, `is_resolved` bool, `resolved_by` FK null, `resolved_at` null, `external_id`/`external_source`. Reuse `IssueComment` sanitize-on-`save()`. Also create `PageActivity` (`page_activities`): `workspace`/`page`/`actor` FKs, `verb`, `field`, `old_value`/`new_value`, `comment`, `epoch` (reuse `IssueActivity` shape).
- New view + serializer (mirror `IssueComment` serializer conventions).
- `apps/api/plane/app/urls/page.py` — `GET/POST .../pages/<page_id>/comments/`, `PATCH/DELETE .../comments/<comment_id>/`, `POST .../comments/<comment_id>/resolve/` + `DELETE` to unresolve.
- Additive `CreateModel` migrations (two models); rollback reverses them.
- `apps/web/core/components/pages/editor/.../navigation-pane/tab-panels/` — "Comments" tab; selection bubble.
- `apps/web/core/store/pages/page-comment.store.ts` (new).

**Security:**
- Routes pass `ProjectPagePermission`. **Create:** any active project member (ADMIN/MEMBER/GUEST) on a page they can read. **Edit/delete:** comment author or ADMIN only. **Resolve:** author, page owner, ADMIN, or MEMBER. Private pages stay owner-gated for read.
- Comment HTML sanitized on save (same path as `IssueComment`); `_stripped` via `strip_tags`.
- @mention notifications respect page read access (no leaking page existence to non-members).

**Dependencies:** Reuses the model/migration pattern from WIKI-E4. **Introduces `PageActivity`**, which WIKI-E6 depends on. Shares navigation-pane tab scaffolding with WIKI-E3/E6.

**Epic acceptance criteria:**
- **Given** a readable page, **When** a GUEST posts a comment anchored to a text selection, **Then** the comment is created with its `anchor` JSON and appears in the thread list.
- **Given** an existing comment, **When** a non-author non-ADMIN user attempts to edit/delete it, **Then** the API returns 403.
- **Given** a thread, **When** the page owner resolves it, **Then** `is_resolved=true`, `resolved_by`/`resolved_at` are set, and a `PageActivity` `commented`/resolution row is logged.
- **Given** anchored text that was subsequently deleted, **When** the comments tab renders, **Then** the comment shows its `quoted_text` flagged "context changed" and is not mis-anchored.
- **Given** a comment with malicious HTML, **When** it is saved, **Then** the stored `comment_stripped` is sanitized.

**Risk tier:** **R1** — two new models + new public contracts; additive, flag-gated, reverse-migration reviewed. Missing RBAC/sanitize coverage = **R0**, do not merge.

**Entitlement flag:** Comments tab gated behind a flag (reuse `templates`-style gating; recommend a dedicated `page_comments` flag added to `SELF_HOSTED_FEATURE_FLAGS`, default `true`). Tab hidden until backend lands.

---

## WIKI-E6 — Page Activity Feed

**User value:** A right-sidebar "Activity" tab shows a single chronological timeline of everything that happened to a page — edits, version saves, comments, access changes, shares, moves — with contributor avatars and timestamps and a "jump to version" link, so anyone can see the document's history at a glance.

**Scope (in):**
- A read endpoint returning a merged, paginated, chronological feed from `PageLog` (edits/version events) + `PageComment` + the `PageActivity` log (from WIKI-E5).
- Signal/service writes of `PageActivity` rows on page mutations and access/share/move changes (`verb` ∈ `edited`/`commented`/`shared`/`access_changed`/`moved`/`restored`).
- An "Activity" tab in the navigation pane: timeline with avatars/timestamps and a "jump to version" link reusing `version/` components.
- Legacy pages (predating `PageActivity`) show version history only.

**Out of scope:**
- No analytics/reporting dashboards.
- No editing of activity records (append-only log).

**Technical requirements (fork files):**
- `apps/api/plane/db/models/` — `PageActivity` model is created in WIKI-E5; this epic adds the signal handler/service that **writes** rows on page/access/share/move mutations (reuse `IssueActivity` signal conventions).
- `apps/api/plane/app/views/page/base.py` — merge-feed view combining `PageLog`, `PageComment`, `PageActivity` ordered by `epoch`/timestamp.
- `apps/api/plane/app/urls/page.py` — `GET .../pages/<page_id>/activities/` (paginated).
- `apps/web/core/components/pages/editor/.../navigation-pane/tab-panels/` — "Activity" tab reusing `version/` components for "jump to version".

**Security:**
- Route passes `ProjectPagePermission`; activity read requires the same read access as the page (private pages owner-gated).
- Activity rows never expose comment bodies the requester cannot read; access-change entries record verb + actor, not sensitive values.

**Dependencies:** **Depends on WIKI-E5** (`PageActivity` model + comment data). Can build the signal-write layer and feed incrementally once the model exists.

**Epic acceptance criteria:**
- **Given** a page that was edited, commented on, and had its access changed, **When** a member requests activities, **Then** the feed returns all three event types in reverse-chronological order.
- **Given** a page mutation (access change), **When** it occurs, **Then** a `PageActivity` row with `verb="access_changed"` and the actor is written.
- **Given** a legacy page created before `PageActivity` existed, **When** activities are requested, **Then** the feed shows version history without erroring.
- **Given** a non-member requester, **When** they request activities, **Then** the API returns 403.
- **Given** the activity signal handler is disabled (rollback path), **When** a page mutates, **Then** no `PageActivity` row is written and the page operation still succeeds.

**Risk tier:** **R1** — worker/signal-backed feature writing to a new table; rollback is disabling the signal handler (no table drop needed). Read endpoint is additive.

**Entitlement flag:** `audit_logs` (existing, already `true`) for the Activity tab — aligns with the audit/activity surface. Tab hidden until backend lands.

---

## WIKI-E7 — Page Export & Download (Markdown / HTML / PDF)

**User value:** Users export any page — optionally with its full descendant tree — to Markdown, HTML, or PDF and get a download link, so page content can leave the tool for sharing, archiving, or offline use.

**Scope (in):**
- An async export endpoint: `POST` returns `{ export_id }`; a worker job renders the page (and optionally descendants) and produces a private `FileAsset`; a `GET .../export/<export_id>/` returns `{ status, url }` with a signed URL.
- Three formats: Markdown, HTML, PDF.
- `include_sub_pages` recursive option.
- An "Export" item in the page ⋯ menu with format selector + checkbox, progress, and download link.
- Worker-down handling: job stays `queued`, UI polls; rollback disables the worker task by flag.

**Out of scope:**
- No custom branding/export theming in v1 (PRD non-goal).
- No scheduled/recurring exports.

**Technical requirements (fork files):**
- `apps/api/plane/db/models/asset.py` — `FileAsset` already has a `page` FK and `PAGE_DESCRIPTION` entity type with signed-URL access; export artifacts stored as private `FileAsset` and served via the existing signed-URL flow.
- New export view in `apps/api/plane/app/views/page/` + worker task in the existing worker (Celery/bgtasks) for recursive/large exports.
- `apps/api/plane/app/urls/page.py` — `POST .../pages/<page_id>/export/` body `{ format, include_sub_pages }` → `{ export_id }`; `GET .../export/<export_id>/` → `{ status, url }`.
- API-key parity (`api/v1/`) for the export trigger with a scoping contract test.
- Rate limiting via the existing `apps/api/plane/.../rate_limit.py`.
- `apps/web/core/components/pages/editor/toolbar/options-dropdown.tsx` — "Export" item with format selector, `include_sub_pages` checkbox, progress, download link.

**Security:**
- Route passes `ProjectPagePermission`; export requires read access to the page (and to descendants when recursive — exclude unreadable/private descendants).
- Artifacts are **private** `FileAsset`s served only via signed URLs that expire; never return raw object-store paths.
- Export endpoint rate-limited.

**Dependencies:** None hard; reuses existing `FileAsset` + worker + signed-URL infra. Independent of other epics.

**Epic acceptance criteria:**
- **Given** a readable page, **When** a member POSTs an export request for `markdown`, **Then** the API returns `{ export_id }` and a worker job is enqueued.
- **Given** a completed export, **When** the member GETs the export status, **Then** the response is `{ status: "completed", url }` where `url` is a signed, expiring URL backed by a private `FileAsset`.
- **Given** `include_sub_pages=true` and a descendant the requester cannot read, **When** the export runs, **Then** that descendant is excluded from the artifact.
- **Given** the worker is down, **When** a member requests export, **Then** the job stays `queued` and the GET status reflects `queued` (no crash).
- **Given** a non-member requester, **When** they request export, **Then** the API returns 403.

**Risk tier:** **R1** — new public contract + worker-backed feature touching signed-URL handling; rollback flags off the worker task and hides the menu. Signed-URL + RBAC coverage required (else **R0**).

**Entitlement flag:** New `page_export` flag added to `SELF_HOSTED_FEATURE_FLAGS`, default `true`. ⋯-menu item hidden until backend lands.

---

## WIKI-E8 — External-URL Embeds (Figma / Loom)

**User value:** Users paste a Figma or Loom (or other allowlisted host) URL into a page and see a live embedded preview instead of a bare link, enriching pages with design and video context — extending the existing image/code/work-item embeds.

**Scope (in):**
- A generic external-URL embed editor extension in `@plane/editor` with host allowlist (Figma/Loom + known hosts).
- Persistence of embed nodes in the page document JSON/HTML.
- Sandboxed iframe rendering; URL validated against the allowlist; never `dangerouslySetInnerHTML` of raw remote HTML.

**Out of scope:**
- No arbitrary/unlisted host embedding (allowlist only).
- No oEmbed metadata fetching/proxying in v1 beyond what the allowlisted hosts' iframe embeds provide.

**Technical requirements (fork files):**
- `@plane/editor` package — new embed extension registered alongside the existing image/code/work-item embed extensions used by `CollaborativeDocumentEditorWithRef` (`apps/web/core/components/pages/editor/editor-body.tsx`).
- Embed nodes persist through the existing `description_json`/`_html` save path on `Page`; the URL allowlist validated both client-side (extension) and on save (server sanitize path in `apps/api/plane/db/models/page.py`).
- Rendered in a sandboxed `<iframe>` with restricted `sandbox` attributes.

**Security:**
- External embed URLs validated against an allowlist (Figma/Loom/known hosts) on both client and server; rejected URLs fall back to plain links.
- Rendered in sandboxed iframes only — never inject raw remote HTML; no `dangerouslySetInnerHTML`.
- Server-side sanitize on page save strips disallowed embed nodes (defense in depth against crafted document JSON).

**Dependencies:** None. Frontend + editor-package change; rollback removes the extension registration.

**Epic acceptance criteria:**
- **Given** a Figma file URL pasted into the editor, **When** the embed extension processes it, **Then** it renders a sandboxed iframe preview and persists an embed node in the page document.
- **Given** a non-allowlisted host URL, **When** a user attempts to embed it, **Then** it is rejected and rendered as a plain link.
- **Given** a page document JSON containing a crafted non-allowlisted embed node, **When** the page is saved, **Then** the server sanitize path strips/rejects the disallowed node.
- **Given** a Loom URL, **When** rendered, **Then** the iframe carries restricted `sandbox` attributes and no raw remote HTML is injected.

**Risk tier:** **R2** — frontend/editor-package change, revertable by removing the extension registration; no schema. (Allowlist + sanitize test required to merge.)

**Entitlement flag:** None required (extends existing embed capability); optionally gate behind a `rich_media_embeds` flag if staged rollout is desired. Extension unregistered until validated.

---

## WIKI-E9 — AI Content Assistance (Summarize / Outline / Continue)

**User value:** Writers invoke AI from the editor to summarize a page, generate an outline, or continue writing — accelerating drafting — routed strictly through the instance's configured self-host provider, with no dependency on external Plane Cloud.

**Scope (in):**
- A session-only AI assist endpoint: `POST .../pages/<page_id>/ai/assist/` body `{ action: "summarize"|"outline"|"continue", selection? }` → suggestion (streamed/JSON); never persists the prompt.
- A wrapper seam over the provider SDK (the wrapper is owned and mockable).
- A floating AI action / `/ai` slash command in the editor, gated on `ai_copilot`; disabled with a tooltip when the server provider is unconfigured.
- Fail-closed: provider outage/quota/unconfigured → user-facing error, editor stays fully usable.

**Out of scope:**
- No external billing/Plane Cloud calls (PRD non-goal).
- No prompt/response persistence; AI stays session-only (no API-key surface).
- AI extension stays out of the WIKI-E1 unlock (`"ai"` remains in `disabled` until this epic ships it intentionally).

**Technical requirements (fork files):**
- `apps/web/ce/hooks/use-editor-flagging.ts` — when shipping, conditionally drop `"ai"` from `disabled` based on `isSelfHostedFeatureEnabled("ai_copilot")` **and** provider-configured state (independent of the `collaboration_cursor` logic from WIKI-E1).
- New AI view in `apps/api/plane/app/views/page/` (session route only, under `plane.app.urls`); provider creds read from server config/Secret Manager.
- `apps/api/plane/app/urls/page.py` — `POST .../pages/<page_id>/ai/assist/` (session-only).
- New owned wrapper module around the provider SDK (mock the wrapper, not the SDK, in tests).
- Rate limiting via existing `rate_limit.py`.
- `@plane/editor` / editor toolbar — floating AI action + `/ai` slash command, gated on `ai_copilot`.

**Security:**
- AI route passes `ProjectPagePermission` (read access to the page).
- Provider creds from server config/Secret Manager only; raw prompts and API keys **never logged** — usage logs store action + page id + token counts only, not prompt bodies.
- Fail-closed when unconfigured/outage; rate-limited.
- Session-only (no API-key parity) to keep AI off the programmatic surface.

**Dependencies:** None hard. Conceptually parallels WIKI-E1's flagging change but is independent (different extension, secrets-sensitive). Ships last among editor unlocks.

**Epic acceptance criteria:**
- **Given** a configured provider and `ai_copilot` on, **When** a member invokes `summarize` on a readable page, **Then** the endpoint returns a suggestion and the prompt body is **not** persisted or logged.
- **Given** an **unconfigured** provider, **When** a member opens the AI action, **Then** it is disabled with a tooltip and the editor remains fully usable (fail-closed).
- **Given** a provider outage/quota error, **When** AI is invoked, **Then** the endpoint returns a user-facing error and the editor stays usable.
- **Given** any AI call, **When** usage is logged, **Then** the log contains action + page id + token counts and **no** prompt body or API key (asserted in tests).
- **Given** a non-member requester, **When** they call the AI endpoint, **Then** the API returns 403.

**Risk tier:** **R1** — touches secrets handling; explicit fail-closed + no-prompt-logging tests required. New session contract, additive.

**Entitlement flag:** `ai_copilot` (existing, already `true`), gated **and** further conditioned on server provider being configured.

---

## WIKI-E10 — Teamspaces (Space/Folder Organization)

**User value:** Teams group related pages under a named space with its own membership and visibility — folder-like organization that crosses project boundaries — so a working group can collect its pages in one place without being limited to a single project's page list.

**Scope (in):**
- New models: `Teamspace` (name, description, `logo_props`, `visibility` public/private, `lead` FK), `TeamspaceMember` (role, `is_active`, unique-together `(teamspace, member, deleted_at)`), `TeamspacePage` (junction, `(teamspace, page)` unique when not deleted, mirroring `ProjectPage`).
- CRUD API for spaces, member add/remove, page add/remove.
- A `TeamspacePermission` class gating space reads by membership and space settings by workspace ADMIN.
- Left-sidebar collapsible space folders with page-count badges and a "manage space" menu; routes under `apps/web/app/(all)/[workspaceSlug]/(projects)/...`.
- Visibility-change-while-open handling (edge case).

**Out of scope:**
- No teamspace-level analytics or roles beyond membership/visibility.
- Pages may belong to a teamspace **and/or** projects — no migration of existing project bindings.

**Technical requirements (fork files):**
- `apps/api/plane/db/models/` + `__init__.py` — `Teamspace` (`teamspaces`), `TeamspaceMember` (`teamspace_members`), `TeamspacePage` (`teamspace_pages`), all extending `BaseModel` with `workspace` FK; junction uses the `deleted_at`-aware unique constraint pattern already used by `ProjectPage` in `apps/api/plane/db/models/page.py`.
- New `TeamspacePermission` in `apps/api/plane/app/permissions/` (parallel to `ProjectPagePermission`).
- New views + serializers; routes added to `plane.app.urls` (a new `urls/teamspace.py` or in `urls/page.py`): `GET/POST workspaces/<slug>/teamspaces/`, `GET/PATCH/DELETE .../teamspaces/<teamspace_id>/`, `POST/DELETE .../teamspaces/<teamspace_id>/members/<user_id>/`, `POST/DELETE .../teamspaces/<teamspace_id>/pages/<page_id>/`.
- Three additive `CreateModel` migrations; rollback reverses them (no data loss to existing pages).
- `apps/web/app/(all)/[workspaceSlug]/(projects)/...` + left-sidebar component — collapsible space folders, page-count badges, manage menu, gated on `isSelfHostedFeatureEnabled("teamspaces")`; empty state "Create a teamspace to group related pages."
- New MobX store + service in `packages/services` (mirroring the WIKI-E4 store/service pattern).

**Security:**
- Teamspace membership gates page visibility within the space; workspace ADMIN manages space settings via `TeamspacePermission`.
- Adding a page to a space does not bypass the page's own `ProjectPagePermission` read gate; private pages stay owner-gated.
- All reads/writes filter by `workspace__slug`; cross-workspace teamspace/page references rejected.
- Visibility change while another session has the page open re-evaluates access on next read.

**Dependencies:** Reuses the model/migration/store/service pattern proven by WIKI-E4. Largest schema footprint; sequenced last. No hard dependency on E5–E9.

**Epic acceptance criteria:**
- **Given** a workspace ADMIN, **When** they create a teamspace and add a page, **Then** `Teamspace` + `TeamspacePage` rows are created and the page appears under the space in the sidebar (with an updated page-count badge).
- **Given** a private teamspace, **When** a non-member requests its pages, **Then** the API returns 403.
- **Given** a non-ADMIN member, **When** they attempt to change space settings, **Then** the API returns 403.
- **Given** a page added to a teamspace whose own access is private and owner-gated, **When** a space member who is not the page owner requests it, **Then** the page's own RBAC still denies read.
- **Given** the three `CreateModel` migrations, **When** applied then reversed on the test DB, **Then** both run clean with no data loss to existing pages, and the junction's `deleted_at`-aware unique constraint matches the `ProjectPage` pattern.

**Risk tier:** **R1** — three new models + new public contracts and a new permission class; additive, flag-gated, reverse-migration reviewed. Missing RBAC tests = **R0**.

**Entitlement flag:** `teamspaces` (existing, already `true`). Sidebar group hidden until backend lands.

---

## Dependency-Ordered Epic List

Build order (each maps to PRD milestones M1–M10; later epics reuse patterns proven by earlier ones):

1. **WIKI-E1 — Live Cursors & Presence Entitlement Unlock** (M1) — no deps; proves the entitlement-wiring pattern. **R2.**
2. **WIKI-E2 — Full-Text Content Search with Snippets & Breadcrumb Path** (M2) — no deps; read + index. **R1.**
3. **WIKI-E3 — Bi-Directional Page Backlinks** (M3) — no deps; read over `PageLog`; introduces navigation-pane panel scaffolding. **R2.**
4. **WIKI-E4 — Page Templates** (M4) — no deps; establishes the model/migration/store/service pattern. **R1.**
5. **WIKI-E5 — Inline Comments & Threaded Discussions** (M5) — reuses E4's pattern; **introduces `PageActivity`** (required by E6). **R1.**
6. **WIKI-E6 — Page Activity Feed** (M6) — **depends on WIKI-E5** (`PageActivity` model + comment data). **R1.**
7. **WIKI-E7 — Page Export & Download** (M7) — no deps; reuses `FileAsset` + worker + signed-URL infra. **R1.**
8. **WIKI-E8 — External-URL Embeds (Figma/Loom)** (M8) — no deps; editor-package + sanitize. **R2.**
9. **WIKI-E9 — AI Content Assistance** (M9) — no hard deps; secrets-sensitive, fail-closed; ships after editor unlocks settle. **R1.**
10. **WIKI-E10 — Teamspaces** (M10) — reuses E4's pattern; largest schema footprint; sequenced last. **R1.**

**Only hard dependency:** WIKI-E6 → WIKI-E5 (`PageActivity`). All others are independent and parallelizable; the ordering otherwise reflects pattern reuse and ascending risk/schema footprint. Per the PRD R0 rule, **any epic's route landing without RBAC + sanitize test coverage is automatically R0 and must not merge.**
