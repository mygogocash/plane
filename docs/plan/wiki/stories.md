# Wiki & Pages — User Stories

> Conventions: AC uses Given/When/Then. Roles: **workspace admin**, **project member/lead**, **guest**, **viewer**. RBAC mirrors `ProjectPagePermission` (private pages owner-gated; ADMIN/MEMBER create+edit; GUEST read; ADMIN delete). All surfaces gate on `apps/web/ce/lib/self-host-entitlements.ts`. ID prefixes per epic below map to PRD milestones M1–M10.

---

## Epic WIKI-COLLAB — Live Collaboration Unlock (M1)

### WIKI-COLLAB-1 (epic WIKI-COLLAB) — Live cursors & presence behind entitlement
**Story** As a project member, I want to see collaborators' live cursors and presence while co-editing a page, so that I can avoid clobbering each other's edits in real time.
**Acceptance criteria**
- Given the `collaboration_cursor` entitlement is `true` and `apps/live` is reachable, When two project members open the same page, Then each sees the other's named cursor and selection highlight, and `use-editor-flagging` does not list `collaboration-cursor` in `disabled`.
- Given the `collaboration_cursor` entitlement is `false`, When a member opens a page, Then `collaboration-cursor` remains in the editor `disabled` array and no presence UI renders.
- Given `apps/live` is unreachable (down), When a member edits a page, Then the editor falls back to non-realtime save (fail closed) and surfaces no crash, and presence UI is suppressed.
- Given a viewer with read-only access opens a page being edited, When others are present, Then they see presence/cursors but cannot type (authz read-only preserved).
**Size** S
**Priority** P1
**Depends on** []

### WIKI-COLLAB-2 (epic WIKI-COLLAB) — Add `collaboration_cursor` self-host flag
**Story** As a workspace admin, I want a `collaboration_cursor` entitlement flag in `SELF_HOSTED_FEATURE_FLAGS`, so that live collaboration can be toggled per instance.
**Acceptance criteria**
- Given the entitlements module loads, When `isSelfHostedFeatureEnabled("collaboration_cursor")` is called, Then it returns the configured value (default `true` for this instance).
- Given the flag is unknown/unset, When `isSelfHostedFeatureEnabled` is called with an undefined key, Then it returns a safe falsy default rather than throwing (edge: missing key).
**Size** S
**Priority** P1
**Depends on** []

---

## Epic WIKI-SEARCH — Full-Text Search Upgrade (M2)

### WIKI-SEARCH-1 (epic WIKI-SEARCH) — Content full-text search with snippet
**Story** As a project member, I want global search to match page body content, not just titles, so that I can find pages by what's written inside them.
**Acceptance criteria**
- Given a page whose title does not contain "rollback" but whose `description_stripped` does, When I search "rollback" in Cmd/Ctrl-K, Then the page appears in results with a highlighted `snippet` excerpt of the matching text.
- Given a search match in a very large `description_stripped`, When the result is returned, Then the `snippet` is length-capped (no unbounded payload).
- Given a page in a project I am **not** a member of matches the query, When I search, Then that page is excluded from my results (multi-tenant isolation preserved via project-membership filter).
- Given no page matches by name or content, When I search, Then an empty result set is returned with no error.
**Size** M
**Priority** P1
**Depends on** []

### WIKI-SEARCH-2 (epic WIKI-SEARCH) — Breadcrumb parent path in results
**Story** As a viewer, I want each search result to show its ancestor page path, so that I can disambiguate pages with similar names.
**Acceptance criteria**
- Given a nested page (parent → child → grandchild), When it appears in search results, Then `parent_path` lists the ancestor page names in order as a breadcrumb.
- Given a top-level page with no parent, When it appears in results, Then `parent_path` is empty and the row renders without a breadcrumb.
- Given the functional search index is dropped (rollback state), When I search, Then the query falls back to `icontains` and still returns matches (no 500).
**Size** S
**Priority** P2
**Depends on** [WIKI-SEARCH-1]

---

## Epic WIKI-LINK — Bi-directional Backlinks (M3)

### WIKI-LINK-1 (epic WIKI-LINK) — Backlinks read API
**Story** As a project member, I want an API listing pages that reference the current page, so that I can see what links to it.
**Acceptance criteria**
- Given page B mentions/links page A (a `back_link`/`page_mention` row exists in `PageLog`), When I `GET .../pages/<A_id>/backlinks/`, Then page B is returned in the referencing set.
- Given a non-member (or GUEST on a private page) requests backlinks for a page they cannot read, When they call the endpoint, Then the API returns 403.
- Given a referencing page was soft-deleted or moved (`moved_to_page`), When backlinks are computed, Then the result resolves to the new page or excludes the deleted one (no dangling reference).
- Given page A has no inbound references, When I request backlinks, Then an empty list is returned (200).
**Size** M
**Priority** P1
**Depends on** []

### WIKI-LINK-2 (epic WIKI-LINK) — Backlinks navigation-pane panel
**Story** As a viewer, I want a collapsible "Backlinks" section in the page navigation pane, so that I can navigate to referencing pages without leaving the page.
**Acceptance criteria**
- Given backlinks exist for the open page, When I expand the "Backlinks" section under Info, Then I see the referencing pages and clicking one navigates to it.
- Given the page I cannot read is referenced, When the panel loads, Then it does not leak that page (only readable referencing pages appear).
- Given no backlinks exist, When I open the section, Then it shows an empty state rather than a spinner or error.
**Size** S
**Priority** P2
**Depends on** [WIKI-LINK-1]

---

## Epic WIKI-TMPL — Page Templates (M4)

### WIKI-TMPL-1 (epic WIKI-TMPL) — Create a page template
**Story** As a project member, I want to save a page as a reusable template, so that my team can start new pages from a consistent structure.
**Acceptance criteria**
- Given I am an ADMIN/MEMBER, When I create a `PageTemplate` with name, content, and scope (workspace-global or project-scoped), Then it is persisted with my `owned_by`, the correct `workspace` FK, and `access` (PRIVATE/PUBLIC).
- Given I am a GUEST, When I attempt to create a template, Then the API returns 403.
- Given I submit a template with an empty/invalid body, When I POST, Then the API returns 400 with a DRF validation detail.
- Given a private template, When another member who is not the owner lists templates, Then it is excluded from their gallery.
**Size** M
**Priority** P1
**Depends on** []

### WIKI-TMPL-2 (epic WIKI-TMPL) — Apply a template to create a page
**Story** As a project member, I want to instantiate a new page from a template, so that I don't recreate boilerplate each time.
**Acceptance criteria**
- Given a readable template, When I `POST .../pages/from-template/<template_id>/`, Then a new page is created cloning `description_*` and `logo_props`, and the response returns the new page.
- Given a template belonging to a different workspace, When I attempt to apply it, Then the API returns 403/400 (cross-workspace template id rejected).
- Given the target project is missing labels/states referenced nowhere, When I apply (templates carry only content + `logo_props`), Then the page is created without error (edge: no label/state dependency).
- Given the `templates` entitlement is off, When I open "Create Page", Then the template gallery is hidden and only "Blank page" is offered.
**Size** M
**Priority** P1
**Depends on** [WIKI-TMPL-1]

### WIKI-TMPL-3 (epic WIKI-TMPL) — Template gallery modal
**Story** As a project member, I want a template-gallery modal when creating a page, so that I can browse templates by type and pick one.
**Acceptance criteria**
- Given `isSelfHostedFeatureEnabled("templates")` is true and templates exist, When I click the sidebar `+`, Then the gallery shows "Blank page" first plus cards grouped by `template_type`.
- Given no templates exist, When I open the gallery, Then I see the empty state: "No templates yet — create one from any page via the ⋯ menu."
- Given the templates backend has not landed, When the web app renders, Then the gallery surface stays hidden (no "coming soon" stub).
**Size** S
**Priority** P2
**Depends on** [WIKI-TMPL-2]

---

## Epic WIKI-CMT — Inline Comments & Discussions (M5)

### WIKI-CMT-1 (epic WIKI-CMT) — Create page & text-anchored comments
**Story** As a project member, I want to comment on a page or on a specific text selection, so that I can discuss content in context.
**Acceptance criteria**
- Given I can read a page, When I create a comment with no anchor, Then a whole-page comment is stored with sanitized `comment_html`/`_json`/`_stripped` and my `actor`.
- Given I select text and add a comment, When I submit, Then the `anchor` JSON `{from,to,quoted_text}` is persisted and the thread is attached to that range.
- Given a GUEST who can read the page, When they create a comment, Then it succeeds (any active member ADMIN/MEMBER/GUEST may comment on a page they can read).
- Given a non-member or a user who cannot read a private page, When they attempt to comment, Then the API returns 403.
- Given a comment with invalid/empty body, When I POST, Then the API returns 400.
**Size** L
**Priority** P0
**Depends on** []

### WIKI-CMT-2 (epic WIKI-CMT) — Reply, edit, and soft-delete comments
**Story** As a comment author, I want to reply within a thread and edit or delete my own comments, so that discussions stay organized and correctable.
**Acceptance criteria**
- Given an existing thread root, When I post a reply with `parent` set, Then it threads under the root in chronological order.
- Given I am the comment author or a workspace ADMIN, When I `PATCH`/`DELETE` the comment, Then the edit/soft-delete succeeds.
- Given I am a member who is **not** the author and not ADMIN, When I attempt to edit/delete another's comment, Then the API returns 403.
- Given a comment is soft-deleted, When the thread is re-listed, Then the comment is excluded from active results.
**Size** M
**Priority** P0
**Depends on** [WIKI-CMT-1]

### WIKI-CMT-3 (epic WIKI-CMT) — Resolve/unresolve threads & orphaned anchors
**Story** As a project member, I want to resolve discussions and handle comments whose anchored text changed, so that resolved feedback is cleared and stale anchors don't mislead.
**Acceptance criteria**
- Given a thread, When the comment author, page owner, ADMIN, or MEMBER calls resolve, Then `is_resolved`, `resolved_by`, and `resolved_at` are set; unresolve clears them.
- Given a GUEST (not author/owner/admin), When they attempt to resolve, Then the API returns 403.
- Given an anchored comment whose quoted text was later deleted/edited, When the page renders, Then the comment shows its `quoted_text` flagged as "context changed" rather than highlighting the wrong range.
- Given a thread whose author was removed from the workspace, When a permitted user resolves it, Then resolution still succeeds without error.
**Size** M
**Priority** P1
**Depends on** [WIKI-CMT-2]

### WIKI-CMT-4 (epic WIKI-CMT) — Comments tab & inline comment bubble
**Story** As a project member, I want a Comments tab and an inline "Add comment" bubble on text selection, so that I can read and add threads from the page UI.
**Acceptance criteria**
- Given the page is open, When I select text, Then an "Add comment" bubble appears and opens a thread anchored to that selection.
- Given threads exist, When I open the "Comments" tab in the navigation pane, Then I see threads with resolve/unresolve toggles and @mention support (reusing existing mention infra).
- Given a private page I cannot read, When the UI loads, Then the Comments tab makes no comment requests for that page (no data leakage).
**Size** M
**Priority** P1
**Depends on** [WIKI-CMT-3]

---

## Epic WIKI-ACT — Page Activity Feed (M6)

### WIKI-ACT-1 (epic WIKI-ACT) — Merged activity feed endpoint
**Story** As a project member, I want a chronological activity feed for a page, so that I can see edits, comments, access changes, shares, and moves over time.
**Acceptance criteria**
- Given a page with version saves, comments, and an access change, When I `GET .../pages/<page_id>/activities/`, Then I receive a merged, paginated, chronological feed (from `PageLog` + comments + `PageActivity`) with actor and timestamp per entry.
- Given a non-member/GUEST-on-private requests the feed, When they call the endpoint, Then the API returns 403.
- Given a legacy page created before `PageActivity` existed, When I open the feed, Then it shows version history only (no crash on missing activity rows).
- Given the `PageActivity` signal handler is disabled (rollback state), When new mutations occur, Then no new activity rows are written and the feed degrades to existing logs.
**Size** M
**Priority** P1
**Depends on** [WIKI-CMT-1]

### WIKI-ACT-2 (epic WIKI-ACT) — Activity tab with jump-to-version
**Story** As a viewer, I want an Activity tab timeline with contributor avatars and a jump-to-version link, so that I can review and revisit historical states.
**Acceptance criteria**
- Given feed entries exist, When I open the "Activity" tab, Then I see a timeline with avatars, timestamps, and verbs.
- Given a version-save entry, When I click "jump to version", Then the existing `version/` view opens that version.
- Given an empty feed, When I open the tab, Then an empty state renders without error.
**Size** S
**Priority** P2
**Depends on** [WIKI-ACT-1]

---

## Epic WIKI-EXP — Export & Download (M7)

### WIKI-EXP-1 (epic WIKI-EXP) — Async page export to Markdown/HTML/PDF
**Story** As a project member, I want to export a page (optionally with descendants) to Markdown, HTML, or PDF, so that I can share or archive content outside the app.
**Acceptance criteria**
- Given a readable page, When I `POST .../pages/<page_id>/export/` with `{format, include_sub_pages}`, Then a worker job is enqueued and the response returns `{ export_id }`.
- Given a completed export, When I `GET .../export/<export_id>/`, Then I receive `{ status: "completed", url }` where `url` is a signed, expiring `FileAsset` link (never a raw object-store path).
- Given a non-member/GUEST-on-private requests export of a page they cannot read, When they POST, Then the API returns 403.
- Given an invalid `format`, When I POST, Then the API returns 400.
- Given the worker is down during a deep-tree export, When I poll, Then the job stays `queued`/`status: queued` and the UI keeps polling without error.
**Size** L
**Priority** P1
**Depends on** []

### WIKI-EXP-2 (epic WIKI-EXP) — Export menu item with progress
**Story** As a project member, I want an "Export" item in the page ⋯ menu with format and sub-pages options, so that I can trigger and download exports from the editor.
**Acceptance criteria**
- Given the export backend is live, When I open the ⋯ options dropdown, Then I see "Export" with a Markdown/HTML/PDF selector and an `include_sub_pages` checkbox.
- Given I start an export, When the job is processing, Then the UI shows progress and reveals a download link on completion.
- Given the export feature flag/worker is off (rollback), When I open the ⋯ menu, Then the Export item is hidden.
**Size** S
**Priority** P2
**Depends on** [WIKI-EXP-1]

---

## Epic WIKI-EMBED — External Media Embeds (M8)

### WIKI-EMBED-1 (epic WIKI-EMBED) — Allowlisted Figma/Loom external embeds
**Story** As a project member, I want to embed external content (Figma, Loom) by URL, so that I can enrich pages with design and video without leaving the wiki.
**Acceptance criteria**
- Given an external URL from an allowlisted host (Figma/Loom), When I embed it, Then it renders inside a sandboxed iframe and the embed persists with the page content.
- Given a URL from a non-allowlisted host, When I attempt to embed it, Then the embed is rejected (not rendered) and no raw remote HTML is injected.
- Given any embed, When it renders, Then it never uses `dangerouslySetInnerHTML` of raw remote HTML (sandboxed iframe only).
- Given the embed extension is unregistered (rollback), When the page loads, Then existing embeds degrade to a plain link without crashing the editor.
**Size** M
**Priority** P2
**Depends on** []

---

## Epic WIKI-AI — AI Content Assistance (M9)

### WIKI-AI-1 (epic WIKI-AI) — Summarize / outline / continue assist endpoint
**Story** As a project member, I want AI actions to summarize, outline, or continue page content, so that I can draft faster using the configured self-host provider.
**Acceptance criteria**
- Given the server AI provider is configured, When I `POST .../pages/<page_id>/ai/assist/` with `{action, selection?}`, Then I receive a suggestion and the prompt body is never persisted or logged (only action + page id + token counts logged).
- Given the AI provider is unconfigured, When I call the endpoint, Then it fails closed with a user-facing error and the editor remains fully usable.
- Given a non-member/GUEST-on-private calls assist on a page they cannot read, When they POST, Then the API returns 403.
- Given the provider is in outage/quota-exhausted, When I trigger an action, Then a user-facing error returns and editing continues uninterrupted.
**Size** L
**Priority** P1
**Depends on** []

### WIKI-AI-2 (epic WIKI-AI) — AI editor action gated on entitlement & config
**Story** As a project member, I want a `/ai` slash command / floating action in the editor, so that I can invoke AI assist in context when it's available.
**Acceptance criteria**
- Given `isSelfHostedFeatureEnabled("ai_copilot")` is true and the provider is configured, When I type `/ai` or open the floating action, Then AI assist is available.
- Given the server provider is unconfigured, When I open the AI action, Then it is disabled with an explanatory tooltip.
- Given `ai_copilot` is off, When the editor loads, Then the `ai` extension stays disabled in `use-editor-flagging` and no AI affordance shows.
**Size** S
**Priority** P2
**Depends on** [WIKI-AI-1]

---

## Epic WIKI-TEAM — Teamspaces / Folder Organization (M10)

### WIKI-TEAM-1 (epic WIKI-TEAM) — Create and manage teamspaces
**Story** As a workspace admin, I want to create named teamspaces with visibility and a lead, so that related pages can be grouped beyond projects.
**Acceptance criteria**
- Given I am a workspace ADMIN, When I `POST .../teamspaces/` with name, visibility (`public`/`private`), and lead, Then the `Teamspace` is created under the correct `workspace` FK.
- Given I am a non-admin member, When I attempt to create or edit teamspace settings, Then the API returns 403 (workspace ADMIN-only for space settings).
- Given an invalid visibility value, When I POST, Then the API returns 400.
- Given a teamspace in another workspace, When I request it by id, Then it is not returned (cross-workspace isolation).
**Size** M
**Priority** P1
**Depends on** []

### WIKI-TEAM-2 (epic WIKI-TEAM) — Teamspace membership & page assignment
**Story** As a teamspace lead, I want to add members and attach pages to a teamspace, so that the right people can access grouped pages.
**Acceptance criteria**
- Given a teamspace, When I `POST .../teamspaces/<id>/members/<user_id>/`, Then a `TeamspaceMember` is created (idempotent on the `(teamspace, member, deleted_at)` unique constraint); `DELETE` deactivates it.
- Given a private teamspace, When a non-member requests its pages, Then they are excluded (teamspace membership gates page reads).
- Given a page, When I `POST .../teamspaces/<id>/pages/<page_id>/`, Then a `TeamspacePage` link is created with the unique `(teamspace, page)` (when `deleted_at IS NULL`) constraint enforced; duplicate add is rejected/idempotent.
- Given a page already bound to projects, When I attach it to a teamspace, Then it belongs to both (page may belong to a teamspace and/or projects).
**Size** M
**Priority** P1
**Depends on** [WIKI-TEAM-1]

### WIKI-TEAM-3 (epic WIKI-TEAM) — Teamspace sidebar grouping
**Story** As a project member, I want collapsible teamspace folders in the left sidebar with page-count badges, so that I can navigate grouped pages quickly.
**Acceptance criteria**
- Given `isSelfHostedFeatureEnabled("teamspaces")` is true and I am a member of a teamspace, When the sidebar renders, Then I see the space folder with a page-count badge and a right-click "manage space" menu.
- Given no teamspaces exist, When the sidebar renders, Then I see the empty state: "Create a teamspace to group related pages."
- Given a teamspace's visibility flips to private while I have a contained page open, When the change propagates, Then my access reflects the new visibility (lose access if no longer a member) without leaking content.
- Given the `teamspaces` entitlement is off, When the sidebar renders, Then the teamspace group is hidden.
**Size** M
**Priority** P2
**Depends on** [WIKI-TEAM-2]
