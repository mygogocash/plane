# Executive Summary

Add a Pages import flow that creates Plane project pages from Notion exports. V1 supports standalone `.html`, `.htm`, `.md`, `.markdown`, and Notion `.zip` exports, lets the user choose the target workspace/project, converts imported content into the existing document editor payload, uploads local ZIP image assets, and persists import metadata for traceability.

# Business Goals

- Let teams move existing Notion knowledge into Manut/Plane without manual copy/paste.
- Make the import flow usable from an empty or populated project Pages list.
- Keep imported pages as normal Plane pages so all existing editing, permissions, search, and navigation continue to work.
- Preserve `manut.xyz` landing and `app.manut.xyz` app deployment assumptions by keeping this as an app-only feature.

# Technical Goals

- Add an `Import` action to the project Pages list header and empty state.
- Parse HTML, Markdown, and Notion ZIP exports in the web app.
- Create pages through the existing project page API using `description_html`, `description_json`, and `description_binary`.
- Upload local ZIP assets as `PAGE_DESCRIPTION` assets after the page id exists, then patch the page description with rewritten asset references.
- Persist `external_source` and `external_id` on imported pages.
- Sanitize page descriptions on create with the same validation used for page description updates.

# Requirements

- The importer must accept `.html`, `.htm`, `.md`, `.markdown`, and `.zip`.
- The modal must default to the current route workspace/project but allow choosing another loaded workspace/project.
- Imported page titles must come from `<title>`, first `<h1>`, first Markdown heading, or filename fallback.
- Batch import must preserve deterministic file order.
- ZIP import must discover nested HTML/Markdown files and their local image assets.
- Remote image URLs must be preserved.
- Local ZIP image references must be uploaded and rewritten where possible.
- Unsupported files must show a clear validation error before import.
- Partial failures must be visible per page without discarding successful imports.
- Only users with page creation permission in the target project may import.

# Non-Goals

- No live Notion API/OAuth integration in V1.
- No perfect Notion database/table fidelity beyond the editor's supported HTML/Markdown features.
- No server-side long-running import jobs in V1.
- No workspace-wide page model change; imports still create project pages.
- No migration of existing production GKE data.

# Architecture

- The Pages list renders an import modal trigger beside `Add page`.
- The import modal reads files client-side, extracts importable page entries, and shows a preview.
- HTML entries are normalized and sanitized client-side for editor conversion.
- Markdown entries are converted to conservative HTML before the same normalization path.
- ZIP entries are unpacked in-browser with a small ZIP library and split into content entries plus asset entries.
- The modal creates each page through `ProjectPageService.create`.
- For pages with local ZIP assets, the modal uploads assets through `FileService.uploadProjectAsset` using the created page id and `PAGE_DESCRIPTION`.
- The modal rewrites local image references, regenerates the document payload, and patches page description with `ProjectPageService.updateDescription`.
- The API validates and sanitizes create-time descriptions before saving.

# Data Models

- No new database table.
- Existing `Page.external_source` stores `"notion"`, `"html"`, or `"markdown"`.
- Existing `Page.external_id` stores a stable hash derived from source path/name and normalized content.
- `TPageCreatePayload` extends create requests with document payload fields and import metadata without changing read-only `TPage` semantics.

# API Contracts

## `POST /api/workspaces/:slug/projects/:project_id/pages/`

Request additions:

```json
{
  "name": "Imported Roadmap",
  "access": 0,
  "description_html": "<h1>Imported Roadmap</h1><p>...</p>",
  "description_json": {},
  "description_binary": "base64-yjs-payload",
  "external_source": "notion",
  "external_id": "notion:roadmap-html:abc123"
}
```

Response additions:

```json
{
  "id": "uuid",
  "name": "Imported Roadmap",
  "description_html": "<h1>Imported Roadmap</h1><p>...</p>",
  "external_source": "notion",
  "external_id": "notion:roadmap-html:abc123"
}
```

# Security

- Backend permission checks remain authoritative.
- `description_html` is sanitized on create and update.
- `description_binary` is base64 decoded and validated before saving.
- Client parser strips scripts, event handlers, unsafe URLs, and unsupported archive entries before editor conversion.
- ZIP path traversal entries are ignored.
- File count and file size limits prevent accidental large imports.
- No imported file content is sent to third-party services.

# Edge Cases

- Empty files are rejected in preview.
- ZIPs with no HTML/Markdown entries show a validation error.
- Duplicate titles are allowed because Plane pages already support non-unique names.
- Missing local ZIP assets produce warnings and the page still imports.
- Failed asset upload leaves the imported page created with a warning and without that rewritten asset.
- Failed page create marks that page failed and continues the remaining batch.
- Private/Public access follows the selected Pages tab by default but can be changed in the modal.
- Imports into another project refresh the current list only if the target is the current project.

# Testing Strategy

- Frontend parser tests cover HTML, Markdown, ZIP ordering, unsafe HTML stripping, unsupported files, and missing assets.
- Backend contract tests cover create-time sanitization, invalid binary rejection, import metadata persistence, and unauthorized access.
- Type and lint checks cover the UI/service/type changes.
- Manual smoke verifies single HTML, single Markdown, multi-page ZIP with images, target selector, reload persistence, and page navigation.

# Rollback Plan

- Remove the import button/modal and parser helper.
- Revert `TPageCreatePayload` and page service/store typing changes.
- Revert serializer create hardening only if it blocks existing page creation; otherwise keep the security fix.
- Revert `fflate` and test script dependencies if ZIP support is removed.
- Existing imported pages remain normal pages and can be archived or deleted through current UI.

# Milestones

## Milestone 1 - Spec And RED Tests

- Objective: lock the import contract before implementation.
- Business impact: prevents a partial importer that silently drops content.
- Technical scope: `spec.md`, frontend parser tests, backend page create contract tests.
- Dependencies: existing Pages API and editor helpers.
- Risks: tests may expose existing create-time sanitizer gaps.
- Success Metrics: targeted tests fail for missing implementation.
- Rollback: remove the new tests and restore prior spec if the feature is cancelled.

## Milestone 2 - Parser And Payload Conversion

- Objective: parse supported files into page import entries.
- Business impact: users can preview what will be imported.
- Technical scope: HTML/Markdown/ZIP parsing, title extraction, warnings, stable source ids.
- Dependencies: `fflate`, browser `File` APIs.
- Risks: unsupported Notion export edge cases.
- Success Metrics: parser tests pass.
- Rollback: remove parser helper and dependency.

## Milestone 3 - API Hardening

- Objective: make create-time descriptions as safe as updates.
- Business impact: imported HTML cannot bypass server validation.
- Technical scope: `PageSerializer`, `PageViewSet.create`, backend tests.
- Dependencies: existing `PageBinaryUpdateSerializer`.
- Risks: stricter validation may reject malformed existing create payloads.
- Success Metrics: backend contract tests pass and normal blank page creation remains valid.
- Rollback: keep metadata fields but revert create serializer validation if necessary.

## Milestone 4 - Import UI

- Objective: expose the import workflow in project Pages.
- Business impact: users can import without admin tooling.
- Technical scope: modal, target selector, file picker, preview, per-page status, toasts.
- Dependencies: project/workspace stores, page service, file service.
- Risks: batch imports can take time for large ZIPs.
- Success Metrics: manual smoke imports sample files and reloads imported pages.
- Rollback: hide the modal trigger.

## Milestone 5 - Validation And Handoff

- Objective: prove the feature is safe to deploy.
- Business impact: reduces risk before pushing to `mygogocash/plane`.
- Technical scope: checks, targeted tests, browser smoke notes.
- Dependencies: Docker test stack and pnpm toolchain.
- Risks: this local workspace is not a git repo, so commit/push must happen from a real clone.
- Success Metrics: required checks pass or blockers are documented.
- Rollback: apply the rollback steps above.

# Epics

## Epic 1 - Import Parsing

- User Value: users can bring Notion exports into Plane from files they already have.
- Technical Requirements: deterministic parser, safe HTML normalization, file limits.
- Security Considerations: strip unsafe HTML and ignore unsafe ZIP paths.
- Edge Cases: empty archives, unsupported files, missing assets.
- Data Flow: browser file input to parsed import entries.
- API Contracts: none.
- Testing Strategy: Vitest parser coverage.

## Epic 2 - Page Creation And Asset Rewrite

- User Value: imported pages open and behave like normal Plane pages.
- Technical Requirements: create page, upload assets, patch description.
- Security Considerations: backend validation remains authoritative.
- Edge Cases: partial asset failures, page create failure, reload after import.
- Data Flow: parsed entry to document payload to page API to optional asset patch.
- API Contracts: page create accepts document fields and import metadata.
- Testing Strategy: backend contract tests plus manual smoke.

## Epic 3 - Import Modal UX

- User Value: users can choose target and see what will happen before importing.
- Technical Requirements: target selector, preview, access selector, status rows.
- Security Considerations: avoid offering archived projects and rely on backend permission failures.
- Edge Cases: no available project, parse errors, mixed successes/failures.
- Data Flow: UI state to import runner to project page service.
- Testing Strategy: type/lint plus browser smoke.

# User Stories

- As a workspace member, I want to import a Notion HTML export so I can move team docs into Pages.
- As a workspace member, I want to import a Notion ZIP so multiple pages and images come over together.
- As a workspace member, I want to choose the target project so imports land in the right project Pages list.
- As an admin, I want unsafe imported HTML sanitized so imports do not create XSS risk.
- As a reviewer, I want per-page import status so partial failures are visible and recoverable.

# Tasks

## Task 1 - Frontend Parser Tests

- Objective: define parser behavior before implementation.
- Scope: web parser unit tests.
- Files: `apps/web/core/components/pages/import/page-import.utils.test.ts`.
- Dependencies: Vitest, `fflate`.
- Risk Tier: R2.
- Acceptance Criteria: tests fail before parser implementation and pass after.
- Tests: `pnpm --filter=web test -- page-import`.
- Rollback: delete parser tests if feature is removed.
- Assigned Model: GPT-5.5 xhigh.
- Assigned Agent: primary.

## Task 2 - Backend Contract Tests

- Objective: lock create-time sanitization and metadata persistence.
- Scope: Django app contract tests.
- Files: `apps/api/plane/tests/contract/app/test_pages_app.py`.
- Dependencies: Docker test stack.
- Risk Tier: R1.
- Acceptance Criteria: unsafe HTML is sanitized and invalid binary is rejected.
- Tests: targeted Docker pytest file.
- Rollback: delete tests if API change is removed.
- Assigned Model: GPT-5.5 xhigh.
- Assigned Agent: primary.

## Task 3 - Parser Implementation

- Objective: parse HTML, Markdown, and ZIP entries into import page drafts.
- Scope: web helper.
- Files: `apps/web/core/components/pages/import/page-import.utils.ts`.
- Dependencies: `fflate`.
- Risk Tier: R2.
- Acceptance Criteria: all parser tests pass.
- Tests: frontend parser tests.
- Rollback: remove helper and dependency.
- Assigned Model: GPT-5.3-Codex-Spark.
- Assigned Agent: primary.

## Task 4 - API Create Hardening

- Objective: validate imported document payloads during page creation.
- Scope: page serializers/views/types.
- Files: `apps/api/plane/app/serializers/page.py`, `apps/api/plane/app/views/page/base.py`, `packages/types/src/page/core.ts`.
- Dependencies: Task 2.
- Risk Tier: R1.
- Acceptance Criteria: backend contract tests pass and blank page creation still works.
- Tests: targeted Docker pytest file.
- Rollback: revert serializer/view changes.
- Assigned Model: GPT-5.3-Codex-Spark.
- Assigned Agent: primary.

## Task 5 - Import Modal And Service Flow

- Objective: make the importer usable from Pages.
- Scope: Pages header, empty state, modal, service/store typing.
- Files: `apps/web/core/components/pages/import/import-pages-modal.tsx`, Pages header/main content, project page service/store.
- Dependencies: Tasks 3 and 4.
- Risk Tier: R2.
- Acceptance Criteria: users can import into selected project and see per-page results.
- Tests: web type/lint checks and manual smoke.
- Rollback: remove modal trigger and component.
- Assigned Model: GPT-5.3-Codex-Spark.
- Assigned Agent: primary.

# Acceptance Criteria

- `Import` is visible beside `Add page` for users allowed to create pages.
- Empty Pages state offers both create and import actions.
- HTML, Markdown, and Notion ZIP files can be parsed and previewed.
- A target workspace/project can be selected before import.
- Single-page imports route to the created page.
- Batch imports stay on the list and show a success/failure summary.
- Local ZIP images are uploaded and rewritten when possible.
- Imported pages persist after reload.
- Unsafe HTML is sanitized by the backend on create.
- Import metadata persists in page API responses.
- Targeted frontend tests, backend tests, type checks, and lint checks pass or documented blockers remain.
