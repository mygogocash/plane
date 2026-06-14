# Wiki & Pages — Design (plane.so alignment)

> Confidence labels: `verified` = read in the fork or PRD this session; `assumed` = inferred from fork conventions; `guessed` = plane.so behavior reconstructed from the brief's screenshot descriptions (no live plane.so access this session).

This document is an annotated-screenshot design spec. It walks each plane.so Wiki surface described in the brief, captures the user's screenshot as a blockquote, maps every UI element to plane.so behavior vs. the fork's current state (per `docs/prd-wiki-2026-06-07.md` and verified source reads), and ends each screen with an implementation mapping (routes, components, MobX stores, services, entitlement wiring, states, responsive, a11y).

**Scope note (verified):** The fork's pages live under projects (`workspaces/<slug>/projects/<project_id>/pages/...`), routed in `apps/web/app/routes/core.ts` lines 197–209. plane.so's Wiki is a **workspace-level** surface with a `Collections / Shared / Private / Archived` sidebar that is independent of projects. Closing this layout gap is the largest structural item; the PRD's Teamspace work (M10) is the nearest existing lever but does not by itself reproduce the workspace-root Wiki sidebar. Each screen below flags where the fork has no equivalent surface at all.

**Material discrepancy found (verified):** The PRD lists **Export** as `[MISSING]` requiring an async worker + `FileAsset` + signed URL (M7). The fork already ships a **client-side** `ExportPageModal` at `apps/web/core/components/pages/modals/export-page-modal.tsx` supporting **PDF** (`@react-pdf/renderer` + `@/components/editor/pdf` `PDFDocument`) and **Markdown** (in-browser blob download via `initiateDownload`). So Export is `PARTIAL` (client-side, single page, no HTML, no `include_sub_pages`, no signed-URL artifact), not MISSING. The "Required change" rows reconcile to: keep the client path for small single-page exports, add the server async path only for recursive/large trees and HTML. Flagging per NO-MAGIC; the PRD should be corrected.

---

## Reference: Wiki left sidebar — Collections / Shared / Private / Archived

> The user's screenshot shows the plane.so Wiki home with a persistent left sidebar. A "Collections" group header sits near the top with one collection named "General" nested under it. Below are three flat sections — "Shared" (showing the empty hint "No shared pages"), "Private" (showing "No private pages"), and "Archived". A "New page" affordance sits near the section headers. The sidebar is workspace-scoped: there is no project selector gating which pages appear.

| UI element | plane.so behavior | Fork status | Required change |
|---|---|---|---|
| Workspace-root "Wiki" sidebar | Persistent left nav at workspace level, independent of any project | **MISSING** (verified — pages sidebar only exists inside a project; no `wiki` route in `core.ts`) | Add a workspace-scoped Wiki shell route + sidebar group; reuse `Teamspace` grouping (PRD M10) as the "Collections" data source |
| "Collections" group (e.g. "General") | Named, collapsible groupings of pages with page-count badges; drag to reorder | **MISSING** as a named concept (verified — fork groups pages only by `parent` self-FK nesting + `projects` M2M) | Map "Collections" → `Teamspace` + `TeamspacePage` (PRD §Data Models). Sidebar collapsible folders with count badges (PRD §UX Teamspaces, line 118) |
| "Shared" section ("No shared pages") | Pages with `access = PUBLIC` (workspace-visible) the user can see; empty hint when none | **PARTIAL** (verified — `Page.access` 0/1 exists in `page.py`; no workspace-level "Shared" filtered view) | Add a `Shared` filter view = `access=PUBLIC` within workspace; render empty state copy "No shared pages" |
| "Private" section ("No private pages") | Owner-only pages (`access = PRIVATE`); empty hint when none | **PARTIAL** (verified — `ProjectPagePermission` already enforces owner-only private; no dedicated section) | Add a `Private` filter view = `access=PRIVATE AND owned_by=self`; empty state "No private pages" |
| "Archived" section | Soft-deleted / archived pages listing with restore | **PARTIAL** (verified — `BaseModel.deleted_at` soft-delete exists; PRD `verb=restored` in `PageActivity`); fork has archive in project pages list but not a workspace Archived section | Add `Archived` filtered view (`archived_at`/`deleted_at` not null) at workspace scope; reuse existing archive/restore actions from `dropdowns/` |
| "New page" affordance | Creates a page at workspace root or within the focused collection | **PARTIAL** (verified — `create-page-modal.tsx` exists but is project-scoped) | Allow page creation at workspace/teamspace scope; open template gallery first (PRD §UX Templates, line 111) |

**Implementation mapping**
- **Routes** (`apps/web/app/routes/core.ts`): add a workspace-scoped Wiki block alongside the existing project pages routes (lines 197–209). New routes nest under `(all)/[workspaceSlug]/(projects)/` per PRD line 118, e.g. `:workspaceSlug/wiki` (shell + sidebar layout), `:workspaceSlug/wiki/:pageId` (detail). `assumed`: follow the existing `layout(...)` + `route(...)` pairing used for project pages list/detail.
- **Components** (`apps/web/core/...`): new `components/workspace/sidebar/wiki-sidebar/` (no fork equivalent — verified: `find ... sidebar -iname "*page*"` returned nothing) with `CollectionsGroup`, `SharedSection`, `PrivateSection`, `ArchivedSection`. Reuse `components/pages/list/` for the listing rows and `components/pages/dropdowns/` for per-page actions.
- **CE wiring**: gate the Collections grouping on `isSelfHostedFeatureEnabled("teamspaces")` (`apps/web/ce/lib/self-host-entitlements.ts` — verified flag present, `true`). Shared/Private/Archived are core access-filter views, not entitlement-gated.
- **MobX stores**: extend `apps/web/core/store/pages/project-page.store.ts` → add a workspace-page store slice (or a new `wiki-page.store.ts`) keyed by `access` + `teamspace`; new `core/store/pages/page-template.store.ts` (PRD line 111). Sidebar reads derived `sharedPages`/`privatePages`/`archivedPages` getters (computed, immutable per coding-style rule).
- **Services** (`packages/services/src/`): there is **no page service in `packages/services`** (verified — page services live at `apps/web/core/services/page/project-page.service.ts`). Either add `packages/services/src/page/` for the new workspace/teamspace surfaces (PRD line 111 says "service in `packages/services`") or extend the existing `apps/web/core/services/page/`. `assumed`: new methods `listWorkspacePages({access})`, `listArchived()`.
- **Empty/loading/error**: reuse `components/pages/loaders/` for skeletons; empty copy exactly "No shared pages" / "No private pages" per screenshot; error → inline retry banner.
- **Responsive**: sidebar collapses to an icon rail < `md`; sections become a sheet/drawer on mobile (follow existing workspace sidebar breakpoint behavior).
- **a11y**: sidebar is `<nav aria-label="Wiki navigation">`; each section header is a real `<button aria-expanded>` toggling a `region`; page-count badges get `aria-label` ("General, 3 pages"); keyboard: arrow-key roving tabindex through page rows, Enter to open.

---

## Reference: New page

> The user's screenshot shows a "New page" entry point near the Wiki sidebar headers. Activating it begins page creation — in plane.so this surfaces a blank document immediately (or a template choice), titled "Untitled", ready for the TipTap editor.

| UI element | plane.so behavior | Fork status | Required change |
|---|---|---|---|
| "New page" trigger | Sidebar `+` / button creates a page in current scope (root or collection) | **PARTIAL** (verified — `create-page-modal.tsx` + `page-form.tsx` exist, project-scoped) | Allow scope = workspace or teamspace; pass `teamspace_id`/`access` into create |
| Template choice on create | Optionally pick a template before the blank doc; "Blank page" is first | **MISSING** (verified — PRD §Gap line 28 "no model, no API, no gallery modal") | Add template-gallery modal (PRD M4) triggered from the `+`; "Blank page" card first; cards per `template_type` |
| New blank doc | Opens the collaborative TipTap editor titled "Untitled" | **PRESENT** (verified — `CollaborativeDocumentEditorWithRef` wired in `editor/editor-body.tsx`, PRD line 15) | None for blank path; ensure new workspace/teamspace pages reuse the same editor body |
| Default access on create | New page inherits scope's default visibility (Shared vs Private) | **PARTIAL** (verified — `access` field exists) | Set `access` default from the section the user created from (Private section → PRIVATE) |

**Implementation mapping**
- **Routes**: creation navigates to the new `:workspaceSlug/wiki/:pageId` detail route (or existing project detail when project-scoped). No new route for the modal (modals are overlay state).
- **Components**: `components/pages/modals/create-page-modal.tsx` (verified exists) extended; new `components/pages/modals/template-gallery-modal.tsx` (PRD line 111). "Create Page" entry from the left-sidebar `+`.
- **CE wiring**: template gallery gated on `isSelfHostedFeatureEnabled("templates")` (verified flag `true`); empty gallery state copy: "No templates yet — create one from any page via the ⋯ menu." (PRD line 111).
- **MobX stores**: `page-template.store.ts` (list/apply); create flow uses the page store's `createPage(scope)` action; applying a template clones `description_*` + `logo_props` into the new page (PRD line 72, §Requirements line 51).
- **Services**: page service `createPage`; new `pageTemplateService.list()/apply(templateId, {projectId|teamspaceId})` → `POST .../pages/from-template/<template_id>/` (PRD line 92).
- **Empty/loading/error**: gallery skeleton cards while loading; apply shows optimistic navigation with rollback on failure (patterns.md optimistic-update rule); error toast via `@plane/propel/toast` (verified import pattern in `options-dropdown.tsx`).
- **Responsive**: gallery is a centered modal on desktop, full-screen sheet on mobile; cards reflow 3→2→1 columns.
- **a11y**: modal is a focus-trapped `role="dialog" aria-modal`, labelled "Create a page"; "Blank page" is the first focusable card and the default; each template card is a `<button>` with `aria-describedby` preview text; Esc closes.

---

## Reference: Greeting + Recents + Your stickies (empty states)

> The user's screenshot shows the Wiki/workspace home: a personalized greeting at top (e.g. "Good morning, …"), a "Recents" region listing recently opened items, and a "Your stickies" region — both shown in their empty states (no recents, no stickies) with light placeholder prompts.

| UI element | plane.so behavior | Fork status | Required change |
|---|---|---|---|
| Greeting header | Time-of-day personalized greeting with user name | **PRESENT** (verified — `apps/web/core/components/home/user-greetings.tsx`) | Reuse as-is on the Wiki home; no change |
| "Recents" region | Recently viewed pages/items; empty hint when none | **PRESENT** (verified — `home/widgets/recents/` incl. `page.tsx`, and `empty-states/recents.tsx`) | Ensure Wiki pages (workspace/teamspace-scoped) appear in recents source, not only project pages |
| Recents empty state | Friendly "nothing recent yet" placeholder | **PRESENT** (verified — `home/widgets/empty-states/recents.tsx`) | Reuse; confirm copy matches |
| "Your stickies" region | Personal sticky notes grid; empty hint when none | **PRESENT** (verified — `components/stickies/` + `home/widgets/empty-states/stickies.tsx`, `sticky.service.ts`) | Reuse as-is; no change |
| Stickies empty state | "Create a sticky" placeholder | **PRESENT** (verified — `home/widgets/empty-states/stickies.tsx`) | Reuse |

**Implementation mapping**
- **Routes**: the home surface is the existing workspace landing (`(all)/[workspaceSlug]/(projects)/page.tsx` — verified `core.ts` line 63). If Wiki gets its own home, reuse `components/home/root.tsx` composition; otherwise no new route — this screen is **largely already built** in the fork.
- **Components**: `components/home/root.tsx`, `user-greetings.tsx`, `home-dashboard-widgets.tsx`, `widgets/recents/*`, `widgets/empty-states/recents.tsx`, `widgets/empty-states/stickies.tsx`, `components/stickies/*` (all verified present).
- **CE wiring**: none required — greeting/recents/stickies are core, ungated.
- **MobX stores**: existing recents and stickies stores (sticky via `core/services/sticky.service.ts`, verified). The only delta: include workspace/teamspace pages in the recents feed (`widgets/recents/page.tsx`).
- **Services**: `sticky.service.ts` (verified); recents service (existing). No new service for this screen.
- **Empty/loading/error**: all three empty states already exist (verified); loaders in `home/widgets/loaders/recent-activity.tsx`; error → widget-level fallback.
- **Responsive**: home widgets already responsive (existing `home-dashboard-widgets.tsx`); Recents + stickies stack vertically on mobile.
- **a11y**: greeting as `<h1>`/`<h2>`; Recents and Your stickies each a `<section aria-labelledby>`; empty states convey state via text, not color alone.

---

## Reference: plane.so/wiki page surfaces — properties, version history, inline comments, TOC, activity feed, export, AI assist

> The user's screenshot shows an open Wiki page (`plane.so/wiki`) with the document in the center and a right-side panel exposing page-level surfaces: page **properties** (owner, dates, access), **version history**, **inline comments** (text-anchored threads), a **table of contents** (outline), an **activity feed**, an **export** action, and an **AI assist** entry point in/around the editor.

| UI element | plane.so behavior | Fork status | Required change |
|---|---|---|---|
| Page properties | Owner, created/updated, access toggle, labels shown in side panel | **PRESENT** (verified — `navigation-pane/tab-panels/info/` has `document-info.tsx`, `actors-info.tsx`; `Page` carries `access`, `labels`, `owned_by`) | Reuse Info tab; surface `access` toggle (Shared/Private) explicitly |
| Version history | List of saved versions; restore / jump-to-version | **PRESENT** (verified — `navigation-pane/tab-panels/info/version-history.tsx`, `components/pages/version/`, `PageVersion` model + `PageVersionEndpoint`) | Reuse; link Activity "jump to version" into these components (PRD line 113) |
| Inline comments / threads | Text-selection bubble → anchored threaded comments, resolve, @mention | **MISSING** (verified — PRD line 29: no `PageComment` model/API/UI) | Build `PageComment` model/API (PRD M5) + "Comments" tab + selection bubble (PRD line 112); anchor JSON `{from,to,quoted_text}`; orphaned-anchor handling (PRD edge case line 134) |
| Table of contents | Auto outline of headings, click to scroll | **PRESENT** (verified — `navigation-pane/tab-panels/outline.tsx`, `editor/summary/`, PRD line 16) | None |
| Activity feed | Chronological page events (edits, comments, access, share/move, restore) | **PARTIAL** (verified — `PageLog` exists; PRD line 27: no consolidated feed endpoint/tab) | Build merged `/activities/` endpoint over `PageLog` + `PageComment` + new `PageActivity` (PRD M6) + "Activity" tab (PRD line 113) |
| Export | Page → Markdown/HTML/PDF, optionally with sub-pages | **PARTIAL** (verified — client-side `ExportPageModal` does PDF + Markdown, single page; **no HTML, no sub-pages, no signed artifact**) | Keep client path for single-page small exports; add server async path (PRD M7: `POST .../export/` → `FileAsset` signed URL) for HTML + `include_sub_pages` + large trees. **Correct PRD's MISSING→PARTIAL.** |
| AI assist | Inline/`/ai` summarize, outline, continue; provider-backed | **PARTIAL / disabled** (verified — CE `editor/ai/menu.tsx` + `AIService` exist; `use-editor-flagging.ts` hard-disables `"ai"` for all 3 profiles) | Enable behind `ai_copilot` (verified flag `true`); add `POST .../ai/assist/` server route (PRD line 102); fail closed when provider unconfigured (PRD line 117, §Security line 127) |
| Live cursors / presence | Multiplayer cursors + avatars while co-editing | **PARTIAL / disabled** (verified — `collaboration-cursor` hard-disabled in `use-editor-flagging.ts`; `apps/live` exists; CE `header/collaborators-list.tsx` present) | Add `collaboration_cursor` flag to `SELF_HOSTED_FEATURE_FLAGS`; conditionally drop from `disabled` (PRD M1, line 116); fail closed if `apps/live` down (edge case line 138) |
| Backlinks | Pages that reference this page | **PARTIAL** (verified — `PageLog` stores `back_link`/`page_mention`; no read API/UI) | Add `/backlinks/` endpoint + collapsible "Backlinks" section under Info (PRD M3, lines 114, 99) |
| External embeds (Figma/Loom) | Paste URL → sandboxed embed | **PARTIAL** (verified — image/code/work-item embeds exist; CE `editor/embed/` only has an upgrade card) | Allowlisted sandboxed iframe embed extension (PRD M8, §Security line 126) |

**Implementation mapping**
- **Routes** (`core.ts`): page detail reuses the project pages detail layout (lines 197–201) and the new `:workspaceSlug/wiki/:pageId` for workspace-scoped pages. Backend session routes added in `apps/api/plane/app/urls/page.py` (verified path convention `workspaces/<slug>/projects/<project_id>/pages/...`): `/comments/`, `/comments/<id>/`, `/comments/<id>/resolve/`, `/backlinks/`, `/activities/`, `/export/` + `/export/<export_id>/`, `/ai/assist/` (PRD §API Contracts lines 89–106). API-key parity (`api/v1/`) only for export-trigger + template-apply (PRD line 66).
- **Components** (`apps/web/core/components/pages/`):
  - Comments → new `navigation-pane/tab-panels/comments.tsx` + editor selection bubble in `editor/`; new tab registered in `apps/web/ce/components/pages/navigation-pane/index.ts` (verified: `TPageNavigationPaneTab = "outline" | "info" | "assets"` — extend the union + `ORDERED_..._LIST`).
  - Activity → new `navigation-pane/tab-panels/activity.tsx`, reusing `components/pages/version/` for "jump to version".
  - Backlinks → collapsible block inside `navigation-pane/tab-panels/info/` (under existing `document-info.tsx`).
  - Export → extend `modals/export-page-modal.tsx` (verified existing) to add HTML format + `include_sub_pages` checkbox + server-async branch; entry already wired via `editor/toolbar/options-dropdown.tsx` (verified `ExportPageModal` import + `isExportModalOpen`).
  - AI assist → CE `editor/ai/menu.tsx` (verified existing) gets un-gated; floating action / `/ai` slash command.
  - Live cursors → no new component; flip `use-editor-flagging.ts`; presence avatars reuse `ce/components/pages/header/collaborators-list.tsx`.
  - Embeds → new extension registration in `ce/components/pages/editor/embed/`.
- **CE / entitlement wiring** (`apps/web/ce/lib/self-host-entitlements.ts`):
  - Add `collaboration_cursor: true` to `SELF_HOSTED_FEATURE_FLAGS` (verified object; flags are a `const` map → `TSelfHostedFeatureFlag` union auto-extends).
  - AI assist gated on existing `ai_copilot` (verified `true`); disabled-with-tooltip when server provider unconfigured.
  - Comments/activity/backlinks/export are core page surfaces — **not** entitlement-gated (they gate on page read RBAC only); follow PRD "hidden until backend lands, no coming-soon stubs" rule (line 120).
- **MobX stores** (`core/store/pages/`): new `page-comment.store.ts` (threads, resolve, optimistic add/rollback) and `page-activity` slice; backlinks as a computed read on the page store; export status polling state for the async path. Editor flags consumed via `useEditorFlagging` (verified hook signature returns `{document,liteText,richText}` each `{disabled,flagged}`).
- **Services**: extend `apps/web/core/services/page/project-page.service.ts` (verified) or new `packages/services/src/page/` with `listComments/createComment/resolveComment`, `getBacklinks`, `getActivities`, `requestExport/getExportStatus`. AI via existing `services/ai.service.ts` (verified `AIService`, `TTaskPayload`). Live via `packages/services/src/live.service.ts` (verified present).
- **Empty/loading/error states**:
  - Comments tab empty: "No comments yet — select text to start a thread." Orphaned-anchor: show quoted snippet + "context changed" flag (PRD edge case line 134), never mis-highlight.
  - Activity empty (legacy pages): show version history only (PRD edge case line 142).
  - Backlinks empty: "No pages link here yet."
  - Export: progress + download link; queued state while worker busy, UI polls (PRD edge case line 136); error toast.
  - AI: provider-outage → user-facing error, editor stays usable (PRD line 139). Disabled tooltip when unconfigured.
  - Live cursors: `apps/live` down → silently fall back to non-realtime save (PRD line 138, fail closed).
- **Responsive**: right navigation pane becomes a bottom sheet / toggle drawer < `lg`; selection comment bubble repositions to avoid the mobile keyboard; export modal full-screen on mobile.
- **a11y**: navigation pane is a `role="tablist"` (verified `@plane/propel/tabs` `Tabs.List`/`Trigger`); each tab panel `role="tabpanel"` labelled by its trigger; comment threads are an `aria` feed with focusable replies; resolve toggle is a labelled `<button aria-pressed>`; AI action and Export are real `<button>`s with `aria-label`; selection bubble announced via `aria-live="polite"`; "jump to version" links keyboard-activatable and focus-managed back to the editor position.

---

## Cross-cutting notes (verified gaps & risks)

- **Biggest structural gap:** plane.so's Wiki is workspace-rooted with a `Collections/Shared/Private/Archived` sidebar; the fork's pages are project-rooted with `parent`-nesting + `projects` M2M and **no workspace Wiki sidebar route** (verified `core.ts` + empty sidebar grep). This is the screen-1 work and is the largest deviation from the PRD's project-scoped framing — the PRD's Teamspace model (M10) supplies the "Collections" data layer but a new workspace-level route/shell is still required. Blast radius: a new top-level navigation surface; reversibility R2 (frontend route, additive).
- **PRD correction (Export):** reconcile `[MISSING]`→`[PARTIAL]` — client-side PDF+Markdown already ships. Server async (M7) is additive for HTML/sub-pages/large trees only.
- **Already-done screens:** greeting, recents, stickies, TOC, version history, page properties are PRESENT — design should reuse, not rebuild (matches PRD "do not re-build PRESENT" line 5).
- **Entitlement deltas needed:** only `collaboration_cursor` is new; `templates`, `teamspaces`, `ai_copilot` already exist and are `true` (verified).
- **R-tier:** UI/route/entitlement screens (sidebar shell, live-cursor flip, backlinks/activity tabs) are R2; new server models (comments, templates, activity, teamspaces) + export server path + AI provider wiring are R1 per PRD §Risk Tier (line 180) and must land with RBAC + sanitize tests or they are R0.

**Key files (verified, absolute paths):**
- `/Users/kunanonjarat/Developer/plane-preview/apps/web/app/routes/core.ts` (routes; pages at L197–209)
- `/Users/kunanonjarat/Developer/plane-preview/apps/web/ce/lib/self-host-entitlements.ts` (flags; add `collaboration_cursor`)
- `/Users/kunanonjarat/Developer/plane-preview/apps/web/ce/hooks/use-editor-flagging.ts` (hard-disables `ai` + `collaboration-cursor`)
- `/Users/kunanonjarat/Developer/plane-preview/apps/web/ce/components/pages/navigation-pane/index.ts` (`TPageNavigationPaneTab` union — extend for Comments/Activity)
- `/Users/kunanonjarat/Developer/plane-preview/apps/web/core/components/pages/navigation-pane/` (tabs-list, tab-panels/info)
- `/Users/kunanonjarat/Developer/plane-preview/apps/web/core/components/pages/modals/export-page-modal.tsx` (existing client-side export — PRD says MISSING; it is PARTIAL)
- `/Users/kunanonjarat/Developer/plane-preview/apps/web/core/components/pages/editor/toolbar/options-dropdown.tsx` (⋯ menu, export entry)
- `/Users/kunanonjarat/Developer/plane-preview/apps/web/ce/components/pages/editor/ai/menu.tsx` + `/Users/kunanonjarat/Developer/plane-preview/apps/web/core/components/home/{user-greetings.tsx,widgets/recents,widgets/empty-states/stickies.tsx}`
- `/Users/kunanonjarat/Developer/plane-preview/apps/web/core/store/pages/project-page.store.ts` (store base; add template + comment slices)
- `/Users/kunanonjarat/Developer/plane-preview/apps/web/core/services/page/project-page.service.ts` (services live here, NOT in `packages/services` — PRD line 111 mismatch)
