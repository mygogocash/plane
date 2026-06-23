# Pending Continuation Lanes Plan

Date: 2026-06-23
Status: IN_PROGRESS
Complexity: COMPLEX

## Overview / Context

Continue and close the pending Plane/Manut continuation lanes using the real
checkout at `/Users/kunanonjarat/Developer/mygogocash-plane`.

This plan supersedes ad-hoc work in the non-git mirror at
`/Users/kunanonjarat/Developer/plane-preview`. That mirror remains useful for
historical comparison only; shippable work should happen in this checkout.

Current active feature program:

- `process/features/cloudflare-stack-migration/active/spec.md`
- `process/features/cloudflare-stack-migration/active/phase-00-baseline-guardrails_PLAN_21-06-26.md`
- `process/features/cloudflare-stack-migration/active/phase-01-cloudflare-foundation_PLAN_21-06-26.md`

The continuation lanes are:

1. Process and repo recovery.
2. Ops rollout validation.
3. Product parity reconciliation.
4. Product parity implementation in dependency order.

## Touchpoints

- `CLAUDE.md`
- `AGENTS.md`
- `process/context/all-context.md`
- `process/context/tests/all-tests.md`
- `process/context/planning/all-planning.md`
- `process/general-plans/active/pending-continuation-lanes_PLAN_23-06-26.md`
- `process/general-plans/reports/product-parity-reconciliation-2026-06-23.md`
- `process/features/cloudflare-stack-migration/reports/live-smoke-followup_23-06-26.md`
- `process/features/cloudflare-stack-migration/active/*`
- `process/features/cloudflare-stack-migration/reports/*`
- `apps/cloudflare/*`
- `docs/plan/*`
- `docs/prd-*.md`
- `apps/api/plane/db/models/*`
- `apps/api/plane/db/migrations/*`
- `apps/api/plane/app/views/*`
- `apps/api/plane/api/views/*`
- `apps/api/plane/tests/*`
- `apps/web/core/components/workflows/*`
- `apps/web/core/store/*`
- `apps/web/core/services/*`
- `apps/web/ce/components/workflow/*`

## Current Evidence

- Real checkout: `/Users/kunanonjarat/Developer/mygogocash-plane`.
- Branch: `preview`.
- Remote: `https://github.com/mygogocash/plane.git`.
- HEAD observed: `5cd3af338 fix(cloudflare): require explicit auth smoke evidence`.
- Node observed: `v22.22.3`.
- pnpm observed in mirror and declared in checkout: `11.3.0`.
- `pnpm --filter @manut/cloudflare check` completed successfully on
  2026-06-23.
- Targeted web tests for workflow/approval and related product parity stores
  pass after building workspace package entrypoints (`@plane/utils`,
  `@plane/constants`, `@plane/types`, `@plane/i18n`).
- Live public checks on 2026-06-23:
  - `GET https://app.manut.xyz/`: HTTP 200.
  - `GET https://app.manut.xyz/god-mode/`: HTTP 200.
  - `GET https://app.manut.xyz/api/instances/`: HTTP 200, about 35.8 seconds.
  - `GET https://app.manut.xyz/uploads/`: HTTP 403.
- Three follow-up `GET https://app.manut.xyz/api/instances/` checks returned
  HTTP 200 in about 0.97s, 0.13s, and 0.13s, so the slow sample did not
  reproduce during this pass.
- Existing Cloudflare migration evidence already treats anonymous `/uploads`
  listing denial as expected legacy behavior; authenticated upload/download
  still needs smoke evidence.

## Public Contracts

Do not regress:

- `https://app.manut.xyz/`.
- `https://app.manut.xyz/api/instances/`.
- Existing Cloudflare migration reports and readiness gates.
- Existing GKE/GCP rollback evidence.
- Existing Work Item, Workflow, Approval, Recurring, Template, and Copilot APIs.
- Existing product parity tests.

## Blast Radius

- `process/` planning and context files.
- Cloudflare migration tools and reports.
- GitHub Actions for GKE/Cloudflare deployment.
- Backend Django models, migrations, serializers, views, and tests.
- Frontend React Router workflow/approval UI.
- Live production-like endpoints.

## Acceptance Criteria

The overall objective is complete only when all lanes below are proven complete:

1. Process and repo recovery:
   - Shippable work is in the real git checkout.
   - `CLAUDE.md` exists and points to the shared workflow/context entrypoints.
   - Current continuation plan is discoverable.

2. Ops rollout validation:
   - Public smoke evidence is recorded in the Cloudflare migration feature
     report path.
   - Authenticated smoke evidence exists for login, work item lifecycle,
     attachment upload/download, and teammate invite delivery.
   - Slow `/api/instances/` behavior is investigated, fixed, or accepted with
     explicit evidence.

3. Product parity reconciliation:
   - Stale PRD claims are mapped against current code.
   - Current implementation status is recorded before selecting slices.

4. Product parity implementation:
   - Continue in dependency order: Work Items, Workflows and Approvals, Wiki,
     AI.
   - Since Work Item and Workflow backend pieces are already partially present,
     the next implementation candidate is Workflows and Approvals frontend
     integration unless current verification contradicts that.

## Phase Completion Rules

- Use current checkout evidence, not stale mirror state.
- Treat PRDs as requirements/history, not current implementation truth.
- Do not close a phase without direct evidence: tests, command output, live
  smoke, runtime/browser evidence, or file artifacts.
- Backend validation must use the project-supported Python version or Docker.
- Live checks are time-sensitive and must be re-run before final closure.

## Phased Delivery Plan

### Phase 0 - Process and Checkout Recovery

Status: COMPLETE

Tasks:

- Clone and verify the real checkout.
- Add `CLAUDE.md` compatibility entrypoint.
- Add this active continuation plan.
- Add product parity reconciliation report.
- Add live smoke follow-up report to the Cloudflare feature reports.
- Wire `process/context/all-context.md` to the continuation plan/report.

Verification:

- `git status --short --branch`
- `git log -1 --oneline --decorate`
- `test -f CLAUDE.md`
- `test -f process/general-plans/active/pending-continuation-lanes_PLAN_23-06-26.md`
- `node .claude/skills/vc-generate-plan/scripts/validate-plan-artifact.mjs process/general-plans/active/pending-continuation-lanes_PLAN_23-06-26.md`

### Phase 1 - Ops Rollout Follow-up

Status: IN_PROGRESS

Tasks:

- Preserve public smoke results from 2026-06-23.
- Re-run Cloudflare readiness and cutover evidence tools as needed.
- Treat slow `/api/instances/` as a cold-path signal unless later monitoring
  reproduces it.
- Run authenticated smoke using controlled credentials and cleanup-safe data.
- Required authenticated smoke check IDs are defined by
  `apps/cloudflare/tools/authenticated-smoke-report.mjs`: `login`,
  `session-refresh`, `workspace-sidebar`, `project-list`,
  `work-item-create`, `work-item-edit`, `work-item-delete`,
  `upload-attachment`, `live-update`, `admin-route`, `public-space-route`.
- Verify teammate invite delivery.

Verification:

- `pnpm --filter @manut/cloudflare check`
- Cloudflare migration report artifacts.
- Authenticated smoke report artifact.
- Live endpoint evidence.

### Cloudflare Authenticated Smoke Template Validation - 2026-06-23

Status: evidence-capture template validated; operator-filled authenticated
smoke report remains pending.

Verification:

- Confirmed the authenticated smoke input template contains the required 11
  check IDs: `login`, `session-refresh`, `workspace-sidebar`, `project-list`,
  `work-item-create`, `work-item-edit`, `work-item-delete`,
  `upload-attachment`, `live-update`, `admin-route`, and
  `public-space-route`.
- `pnpm --filter @manut/cloudflare auth:smoke-report -- --input process/features/cloudflare-stack-migration/references/phase-07-authenticated-smoke-input-template_22-06-26.json --json`
  - Result: expected non-zero validation result for blank template:
    `ok:false`, `total:11`, `passed:0`, `failed:11`.

### Phase 2 - Product Parity Reconciliation

Status: IN_PROGRESS

Tasks:

- Record code evidence for implemented/partial custom properties, templates,
  recurring work items, workflows, approvals, and Copilot persistence.
- Identify the next real gap by comparing current code to `docs/plan`.

Verification:

- `process/general-plans/reports/product-parity-reconciliation-2026-06-23.md`
- Targeted searches and tests for selected features.

### Phase 3 - Workflows and Approvals UI/Integration

Status: automated frontend/backend evidence refreshed; runtime/manual UI smoke remains pending.

Tasks:

- Verify existing backend approval and transition behavior.
- Keep workspace package entrypoints built before targeted Vitest runs, or add
  a durable test prebuild if this recurs in CI/local onboarding.
- Complete frontend visual builder integration.
- Complete board/status drag enforcement.
- Complete approval banner/request/decision UI.
- Replace or wire CE workflow stubs.

Verification:

- Backend approval/workflow tests.
- Frontend workflow builder and approval banner tests.
- Manual gated-transition smoke.

### Workflows and Approvals Automated Verification Update - 2026-06-23

Status: automated frontend and backend evidence refreshed; runtime/manual UI smoke
remains required before Phase 3 closure.

Verification:

- `pnpm --filter web exec vitest run core/components/workflows/approval-banner.test.tsx core/components/workflows/workflow-builder.test.tsx ce/components/workflow/workflow-enforcement.test.tsx core/store/workflow.store.test.ts core/store/recurring-work-item.store.test.ts core/store/work-item-template.store.test.ts core/store/issue-property.store.test.ts --no-color`
  - Result refreshed in this checkout: `7` files, `28` tests passed;
    `WORKFLOW_FRONTEND_TEST_EXIT:0`.
- `docker compose --env-file .env.example run --name plane-test-workflow-suite -e DJANGO_SETTINGS_MODULE=plane.settings.test api sh -lc 'pip install -r requirements/test.txt >/dev/null && python -m pytest plane/tests/unit/models/test_workflow_models.py plane/tests/unit/serializers/test_workflow_serializers.py plane/tests/contract/api/test_workflow_v1.py plane/tests/contract/app/test_workflow_config.py plane/tests/contract/app/test_workflow_transitions_crud.py plane/tests/contract/app/test_approvals.py --no-header --tb=short -q; code=$?; echo TEST_EXIT:$code; exit $code'`
  - Result with `plane-db`, `plane-redis`, and `plane-mq` running: `32 passed, 30 warnings in 57.53s`; `TEST_EXIT:0`.

### Phase 4 - Wiki Continuation

Status: IN_PROGRESS

Tasks:

- Reconcile current page/wiki code against `docs/plan/wiki`.
- Complete WIKI-T1 live-cursor entitlement unlock.
- Complete WIKI-T2/WIKI-T3 read-only page content search and snippet rendering.
- Complete WIKI-T4/WIKI-T5 read-only backlinks API and Info-tab UI.
- Continue next dependency-ordered Wiki slice.

Verification:

- Targeted backend/frontend tests.
- Manual page lifecycle smoke.

### Phase 5 - AI Continuation

Status: IN_PROGRESS

2026-06-23 continuation update: AI-E1 Phase B embedding foundation is now
implemented and focused-test verified. Added `IssueEmbedding` schema/migration,
provider-agnostic `upsert_issue_embedding` helper behind
`WORKSPACE_AI_EMBEDDINGS_ENABLED`, default no-op behavior, same-hash reuse, and
provider-failure preservation. Focused backend test result: `4` tests passed;
`TEST_EXIT:0`. Migration drift check: `No changes detected`;
`MAKEMIGRATIONS_CHECK_EXIT:0`. Semantic retrieval integration and async
backfill remain pending.

Tasks:

- Reconcile Copilot and AI code against `docs/plan/ai`.
- Continue next dependency-ordered AI slice after prerequisite lanes.

Verification:

- Provider-enabled and provider-disabled tests.
- Permission and audit trail tests.
- No secret leakage in logs or responses.

## Verification Evidence

Collected:

- Real checkout exists and is on `preview`.
- `pnpm --filter @manut/cloudflare check` passed on 2026-06-23.
- Plan validation returned zero failures on 2026-06-23.
- Live public endpoint checks produced HTTP 200 for root, god-mode, and
  `/api/instances/`.
- Repeated `/api/instances/` checks after the initial slow sample returned
  sub-second responses.
- Existing reports document `/uploads` anonymous listing denial as expected.
- Built `@plane/utils`, `@plane/constants`, `@plane/types`, and `@plane/i18n`
  workspace packages to satisfy package `dist` entrypoints used by Vitest.
- `pnpm --filter web exec vitest run core/components/workflows/approval-banner.test.tsx core/components/workflows/workflow-builder.test.tsx ce/components/workflow/workflow-enforcement.test.tsx core/store/workflow.store.test.ts core/store/recurring-work-item.store.test.ts core/store/work-item-template.store.test.ts core/store/issue-property.store.test.ts --no-color`
  passed: 7 files, 28 tests.
- Docker/Python 3.12 backend command passed with exit code 0:
  `docker compose --env-file .env.example run --rm api sh -lc 'pip install -r requirements/test.txt >/dev/null && python -m pytest plane/tests/unit/models/test_workflow_models.py plane/tests/unit/serializers/test_workflow_serializers.py plane/tests/contract/api/test_workflow_v1.py plane/tests/contract/app/test_workflow_config.py plane/tests/contract/app/test_workflow_transitions_crud.py plane/tests/contract/app/test_approvals.py --no-header --tb=short -q >/dev/null 2>&1'`
- WIKI-T1 implemented:
  - `collaboration_cursor` added to self-host entitlement flags.
  - `useEditorFlagging` now keeps `collaboration-cursor` enabled when the
    self-host flag is true.
  - `pnpm --filter web exec vitest run ce/lib/self-host-entitlements.test.ts ce/hooks/use-editor-flagging.test.ts core/components/pages/import/page-import.utils.test.ts --no-color`
    passed: 3 files, 13 tests.
  - `docker compose --env-file .env.example run --rm api sh -lc 'pip install -r requirements/test.txt >/dev/null && python -m pytest plane/tests/contract/app/test_pages_app.py --no-header --tb=short -q'`
    passed after starting backend dependencies.
- WIKI-T2/WIKI-T3 implemented:
  - Page entity search now matches `description_stripped` in addition to page
    names and returns a bounded plain-text `snippet`.
  - Command palette page results render snippets as escaped text when present
    and omit the snippet block when absent.
  - `docker compose --env-file .env.example run --name plane-test-search -e DJANGO_SETTINGS_MODULE=plane.settings.test api sh -lc 'pip install -r requirements/test.txt >/dev/null && python -m pytest plane/tests/contract/app/test_search_app.py --no-header --tb=short -q; code=$?; echo TEST_EXIT:$code; exit $code'`
    passed: 2 tests, exit code 0.
  - `docker compose --env-file .env.example run --name plane-test-pages -e DJANGO_SETTINGS_MODULE=plane.settings.test api sh -lc 'pip install -r requirements/test.txt >/dev/null && python -m pytest plane/tests/contract/app/test_pages_app.py --no-header --tb=short -q; code=$?; echo TEST_EXIT:$code; exit $code'`
    passed: exit code 0.
  - `pnpm --filter web exec vitest run ce/lib/self-host-entitlements.test.ts ce/hooks/use-editor-flagging.test.ts core/components/pages/import/page-import.utils.test.ts ce/components/command-palette/helpers.test.tsx --no-color`
    passed: 4 files, 15 tests.
- WIKI-T4/WIKI-T5 implemented:
  - Added `GET /api/workspaces/{slug}/projects/{project_id}/pages/{page_id}/backlinks/`
    with target-page access checks and source-page visibility filtering.
  - Added Info-tab backlinks UI with loading, empty, error, and source-page
    link states.
  - `docker compose --env-file .env.example run --name plane-test-wiki-backend -e DJANGO_SETTINGS_MODULE=plane.settings.test api sh -lc 'pip install -r requirements/test.txt >/dev/null && python -m pytest plane/tests/contract/app/test_page_backlinks_app.py plane/tests/contract/app/test_search_app.py plane/tests/contract/app/test_pages_app.py --no-header --tb=short -q; code=$?; echo TEST_EXIT:$code; exit $code'`
    passed: 8 tests, exit code 0.
  - `pnpm --filter web exec vitest run ce/lib/self-host-entitlements.test.ts ce/hooks/use-editor-flagging.test.ts core/components/pages/import/page-import.utils.test.ts ce/components/command-palette/helpers.test.tsx core/components/pages/navigation-pane/tab-panels/info/backlinks.test.tsx --no-color`
    passed: 5 files, 17 tests.

Still required:

- Authenticated live smoke report.
- Runtime/manual Workflows and Approvals UI smoke evidence.
- WIKI-T6/WIKI-T7 page template backend/client slices are implemented and verified.

Next Step:
Continue with the remaining non-template lanes: authenticated Cloudflare smoke
evidence, runtime/manual Workflows and Approvals UI smoke, and AI/Copilot parity
reconciliation. WIKI-T6/WIKI-T7 are now verified with backend and frontend tests.

### WIKI-T6/WIKI-T7 Verification Update - 2026-06-23

Status: implemented and verified.

Code evidence:

- Backend model/API/migration/tests:
  `apps/api/plane/db/models/page.py`,
  `apps/api/plane/db/migrations/0133_page_templates.py`,
  `apps/api/plane/app/views/page/base.py`,
  `apps/api/plane/app/urls/page.py`,
  `apps/api/plane/tests/contract/app/test_page_templates_app.py`.
- Frontend client/store/gallery/tests:
  `packages/types/src/page/template.ts`,
  `apps/web/core/services/page/page-template.service.ts`,
  `apps/web/core/store/pages/page-template.store.ts`,
  `apps/web/core/components/pages/modals/template-gallery-modal.tsx`,
  `apps/web/core/components/pages/modals/create-page-modal.tsx`.

Verification:

- `python3 -m py_compile apps/api/plane/app/views/page/base.py apps/api/plane/app/urls/page.py apps/api/plane/app/views/__init__.py apps/api/plane/app/serializers/page.py apps/api/plane/db/models/page.py apps/api/plane/db/migrations/0133_page_templates.py apps/api/plane/tests/contract/app/test_page_templates_app.py`
- `docker compose --env-file .env.example run --name plane-check-migrations -e DJANGO_SETTINGS_MODULE=plane.settings.test api sh -lc 'python manage.py makemigrations db --check --dry-run; code=$?; echo MIGRATION_CHECK_EXIT:$code; exit $code'`
  - Result: `No changes detected in app 'db'`; `MIGRATION_CHECK_EXIT:0`.
- `docker compose --env-file .env.example run --name plane-test-wiki-backend -e DJANGO_SETTINGS_MODULE=plane.settings.test api sh -lc 'pip install -r requirements/test.txt >/dev/null && python -m pytest plane/tests/contract/app/test_page_templates_app.py plane/tests/contract/app/test_page_backlinks_app.py plane/tests/contract/app/test_search_app.py plane/tests/contract/app/test_pages_app.py --no-header --tb=short -q; code=$?; echo TEST_EXIT:$code; exit $code'`
  - Result: `13 passed, 17 warnings`; `TEST_EXIT:0`.
- `pnpm --dir apps/web exec vitest run core/components/pages/import/page-import.utils.test.ts ce/components/command-palette/helpers.test.tsx core/components/pages/navigation-pane/tab-panels/info/backlinks.test.tsx core/components/pages/modals/template-gallery-modal.test.tsx core/store/pages/page-template.store.test.ts --reporter=verbose`
  - Result: `5 passed` test files, `19 passed` tests.
- `pnpm --dir apps/web check:types`
  - Result: passes after rebuilding local workspace package `dist` outputs and
    fixing the backlinks info panel page id type; `TYPECHECK_EXIT:0`.

### AI/Copilot Workspace Summary Update - 2026-06-23

Status: partial AI/Copilot parity progress; larger AI parity lane remains open.

Code evidence:

- Extended the CE Ask AI action to support the backend's existing `workspace`
  Copilot query scope without requiring an `object_id`.
- Removed `@plane/ui` and `@plane/propel/button` dependencies from
  `apps/web/ce/components/copilot/ask-ai-action.tsx` by using native controls,
  which also reduces the existing unresolved package surface in web type checks.
- Added workspace-scope coverage in
  `apps/web/ce/components/copilot/ask-ai-action.test.tsx`.

Verification:

- `pnpm --dir apps/web exec vitest run ce/components/copilot/ask-ai-action.test.tsx --reporter=verbose`
  - Result: `1 passed` test file, `5 passed` tests.

### AI/Copilot Project Summary Update - 2026-06-23

Status: project-scoped Copilot summary evidence implemented and verified; larger AI
parity lane remains open.

Code evidence:

- Extended the Copilot query API to accept `project` scope and require
  `object_id` for project-scoped requests.
- Added project evidence collection that includes the readable project and
  status updates from epics in that project.
- Extended the CE Ask AI action and AI service types to submit project-scoped
  Copilot queries.
- Added backend and frontend coverage for project-scoped Copilot summary
  payloads and result copy.

Verification:

- `python3 -m py_compile apps/api/plane/app/views/copilot.py apps/api/plane/tests/contract/app/test_copilot_query.py`
  - Result: passed.
- `docker compose --env-file .env.example run --name plane-test-copilot-query -e DJANGO_SETTINGS_MODULE=plane.settings.test api sh -lc 'pip install -r requirements/test.txt >/dev/null && python -m pytest plane/tests/contract/app/test_copilot_query.py --no-header --tb=short -q; code=$?; echo TEST_EXIT:$code; exit $code'`
  - Result: `6 passed, 7 warnings in 56.24s`; `TEST_EXIT:0`.
- `pnpm --dir apps/web exec vitest run ce/components/copilot/ask-ai-action.test.tsx core/components/pages/import/page-import.utils.test.ts ce/components/command-palette/helpers.test.tsx core/components/pages/navigation-pane/tab-panels/info/backlinks.test.tsx core/components/pages/modals/template-gallery-modal.test.tsx core/store/pages/page-template.store.test.ts --reporter=verbose`
  - Result: `6` test files passed, `26` tests passed.

### AI-E2 Duplicate-Check Backend Update - 2026-06-23

Status: server-side duplicate-check endpoint implemented and verified with
keyword retrieval fallback. UI debounce/override behavior and embedding-ranked
retrieval remain open AI parity follow-up work.

Code evidence:

- Added `POST /api/workspaces/<slug>/projects/<project_id>/issues/duplicate-check/`
  beside the existing `issues/similar/` route.
- Reused the existing `rank_similar_items` keyword scorer and project-scoped
  open-issue candidate filter.
- Returned PRD-shaped duplicate-check data:
  `candidates[] {issue_id, score, matched_on[]}`, `high_confidence`,
  `threshold`, and `retrieval`.
- Preserved the existing `issues/similar/` response envelope and regression
  coverage.

Verification:

- `python3 -m py_compile apps/api/plane/app/views/issue/similar.py apps/api/plane/tests/contract/app/test_duplicate_check_api.py`
  - Result: passed.
- `docker compose --env-file .env.example run --name plane-test-duplicate-check -e DJANGO_SETTINGS_MODULE=plane.settings.test api sh -lc 'pip install -r requirements/test.txt >/dev/null && python -m pytest plane/tests/contract/app/test_duplicate_check_api.py plane/tests/contract/app/test_similar_issues_api.py --no-header --tb=short -q; code=$?; echo TEST_EXIT:$code; exit $code'`
  - Result: `9 passed, 11 warnings in 63.32s`; `TEST_EXIT:0`.

### AI-E2 Duplicate-Check Frontend Bridge Update - 2026-06-23

Status: existing issue-create de-dupe UI path now consumes the new
duplicate-check contract through the frontend service/hook layer. Full
high-confidence override UX polish and embedding-ranked retrieval remain open.

Code evidence:

- Added duplicate-check response/payload types in
  `apps/web/core/types/similar-issue.ts` while preserving the existing
  `TSimilarIssue` shape used by de-dupe components.
- Extended `SimilarIssuesService` with `checkDuplicates` and `listDuplicates`
  while preserving legacy `list` behavior for `/issues/similar/`.
- Updated `useDebouncedDuplicateIssues` to call the new duplicate-check endpoint
  and gate duplicate detection on `ai_copilot`, returning the existing
  `duplicateIssues` shape consumed by issue modal/inbox de-dupe UI.

Verification:

- `pnpm --dir apps/web exec vitest run core/services/similar-issues.service.test.ts ce/hooks/use-debounced-duplicate-issues.test.ts --reporter=verbose`
  - Result: `2` test files passed, `4` tests passed.
- `pnpm --dir apps/web exec tsc --noEmit --pretty false 2>&1 | grep -E "(similar-issues|use-debounced-duplicate)" || true`
  - Result: no diagnostics for the edited similar-issues service or
    duplicate-issues hook files.

### AI-E2 Transparent Duplicate-Match UI Update - 2026-06-23

Status: issue duplicate suggestions now expose why a candidate matched in the
de-dupe modal while preserving the existing similar-items card contract.

Evidence:

- Added `formatMatchedFields` and a `Matched on ...` line for duplicate
  candidates that include `matched_on[]`.
- Added focused component coverage for match-field formatting and rendering.
- Fixed the local source-checkout type path for `@plane/propel/toast` by adding
  a `types` condition to the `./toast` package export.

Verification:

- `pnpm --dir apps/web exec vitest run ce/components/de-dupe/de-dupe-button.test.tsx core/services/similar-issues.service.test.ts ce/hooks/use-debounced-duplicate-issues.test.ts --reporter=verbose; code=$?; echo TEST_EXIT:$code; exit $code`
  - Result: `3` files, `9` tests passed; `TEST_EXIT:0`.
- `pnpm --dir apps/web exec tsc --noEmit --pretty false 2>&1 | grep -E "(de-dupe|similar-issues|use-debounced-duplicate|propel/toast)" || true`
  - Result: no diagnostics for the edited de-dupe, similar-issues,
    duplicate-issues hook, or `@plane/propel/toast` paths.
- `git diff --check`
  - Result: `DIFF_CHECK_EXIT:0`.

### AI-E2 High-Confidence Override Frontend Gate - 2026-06-23

Status: frontend high-confidence blocking is in progress. Main issue creation
and inbox issue creation now require explicit acknowledgement before submitting
when duplicate-check marks remaining candidates as high confidence. Acknowledged
create payloads now include `duplicate_override`, and backend issue creation
records `issue_duplicate_override.activity.created`.

Verification:

- `pnpm --dir apps/web exec vitest run ce/components/de-dupe/duplicate-override-warning.test.tsx core/services/similar-issues.service.test.ts ce/hooks/use-debounced-duplicate-issues.test.ts ce/components/de-dupe/de-dupe-button.test.tsx --reporter=verbose`
  - Result: `4` files, `14` tests passed; `FRONTEND_TEST_EXIT:0`.
  - Latest rerun covers the shared `buildDuplicateOverridePayload` contract used
    by both issue-create and inbox-create.
- `docker compose --env-file .env.example run --name plane-test-duplicate-override -e DJANGO_SETTINGS_MODULE=plane.settings.test api sh -lc 'pip install -r requirements/test.txt >/dev/null && python -m pytest plane/tests/contract/app/test_duplicate_check_api.py plane/tests/contract/app/test_similar_issues_api.py --no-header --tb=short -q; code=$?; echo TEST_EXIT:$code; exit $code'`
  - Result: `10` tests passed, `12` warnings in `53.87s`; `TEST_EXIT:0`.
- `pnpm --dir apps/web exec tsc --noEmit --pretty false 2>&1 | grep -E "(similar-issues|use-debounced-duplicate|de-dupe|issue-modal/form|create-modal/create-root)" || true`
  - Result: no new syntax or local contract diagnostics for edited paths;
    broad web typecheck now passes after rebuilding local workspace package
    `dist` outputs and fixing the backlinks info panel page id type.
- `git diff --check`
  - Result: `DIFF_CHECK_EXIT:0`.
- `pnpm --dir apps/web exec vitest run ce/components/copilot/ask-ai-action.test.tsx core/components/pages/import/page-import.utils.test.ts ce/components/command-palette/helpers.test.tsx core/components/pages/navigation-pane/tab-panels/info/backlinks.test.tsx core/components/pages/modals/template-gallery-modal.test.tsx core/store/pages/page-template.store.test.ts --reporter=verbose`
  - Result: `6 passed` test files, `24 passed` tests.
- `pnpm --dir apps/web run check:types`
  - Result: filtered changed-file output has no new Ask AI/page-template type
    errors. Broad check still fails on existing
    `core/components/copilot/panel.tsx` unresolved `@plane/ui` /
    `@plane/propel/*` declarations.

## Resume and Execution Handoff

Selected plan:
`process/general-plans/active/pending-continuation-lanes_PLAN_23-06-26.md`

Current best next action:

1. Proceed to authenticated smoke preparation if controlled credentials are
   available.
2. Otherwise continue Phase 3 Workflows and Approvals UI integration and
   manual smoke preparation.
3. For deeper AI parity, use
   `process/general-plans/active/ai-parity-followup_PLAN_23-06-26.md`; Phase A
   is the next local AI implementation slice after smoke gates.

Validated in this checkout:

- `node .claude/skills/vc-generate-plan/scripts/validate-plan-artifact.mjs process/general-plans/active/pending-continuation-lanes_PLAN_23-06-26.md`
  - Result: `PLAN_VALIDATOR_EXIT:0`.
- `pnpm --filter @manut/cloudflare check`
  - Result: `CLOUDFLARE_CHECK_EXIT:0`.
- `git diff --check`
  - Result: `DIFF_CHECK_EXIT:0`.

NEXT EXECUTION: continue Phase 1 authenticated smoke or Phase 3 Workflows and
Approvals UI integration based on available credentials. If neither gate is
available, resume AI parity from
`process/general-plans/active/ai-parity-followup_PLAN_23-06-26.md` Phase A.

## 2026-06-23 Semantic Retrieval Continuation Update

Status: AI Phase C semantic retrieval is implemented and locally verified for
the similar-issues and duplicate-check endpoint bridge. The duplicate-check
response now preserves semantic `matched_on` evidence, keeps numeric candidate
scores for threshold comparison, and reports `retrieval: "embedding"` when the
embedding ranker supplies the candidates.

Evidence:

- `docker compose --env-file .env.example build api` completed before backend
  verification.
- `python -m pytest plane/tests/unit/utils/test_issue_embeddings.py
plane/tests/contract/app/test_duplicate_check_api.py
plane/tests/contract/app/test_similar_issues_api.py --no-header --tb=short
-q` reported `19 passed, 14 warnings` and `TEST_EXIT:0`.
- `python manage.py makemigrations --check --dry-run` reported
  `No changes detected` and `MAKEMIGRATIONS_CHECK_EXIT:0`.
- `python manage.py check` reported `DJANGO_CHECK_EXIT:0`.
- `node .claude/skills/vc-generate-plan/scripts/validate-plan-artifact.mjs
process/general-plans/active/pending-continuation-lanes_PLAN_23-06-26.md
process/general-plans/active/ai-parity-followup_PLAN_23-06-26.md` reported
  zero failures and zero warnings.
- `pnpm --filter @manut/cloudflare check` and `git diff --check` passed.

Remaining gates:

- AI embedding async backfill/workers/provider integration remains open; the
  current endpoint path is provider-disabled by default and falls back to
  keyword ranking when semantic ranking is unavailable.
- AI Phase A still needs browser/manual issue-create and inbox-create smoke
  evidence.
- Phase 3 Workflows/Approvals still needs runtime/manual UI smoke evidence.
- Cloudflare authenticated upload/download smoke remains operator-gated and
  cannot be claimed from local checks alone.

## 2026-06-23 Embedding Worker/Backfill Continuation Update

Status: AI Phase C now has a verified worker/backfill foundation. Added a
Celery task module for single-issue embedding refresh and bounded issue
embedding backfill, registered it in `CELERY_IMPORTS`, and added
`manage.py backfill_issue_embeddings` for operator-controlled inline or queued
backfill runs.

Evidence:

- `docker compose --env-file .env.example build api` completed before backend
  verification.
- Focused worker suite:
  `python -m pytest plane/tests/unit/utils/test_issue_embeddings.py
plane/tests/unit/bg_tasks/test_issue_embedding_task.py --no-header --tb=short
-q` reported `11 passed` and `TEST_EXIT:0`.
- Combined semantic endpoint plus worker suite:
  `python -m pytest plane/tests/unit/utils/test_issue_embeddings.py
plane/tests/unit/bg_tasks/test_issue_embedding_task.py
plane/tests/contract/app/test_duplicate_check_api.py
plane/tests/contract/app/test_similar_issues_api.py --no-header --tb=short
-q` reported `23 passed, 14 warnings` and `TEST_EXIT:0`.
- Management command disabled-mode smoke:
  `python manage.py backfill_issue_embeddings --limit 1` reported
  `{"processed":0,"ready":0,"skipped":0,"status":"disabled"}` and
  `COMMAND_EXIT:0`.
- `python manage.py makemigrations --check --dry-run` reported
  `No changes detected` and `MAKEMIGRATIONS_CHECK_EXIT:0`.
- `python manage.py check` reported `DJANGO_CHECK_EXIT:0`.
- `git diff --check` passed.

Remaining gates:

- Production embedding provider configuration remains open; the default provider
  remains unavailable by design.
- Automatic per-write enqueue on issue create/update is not claimed in this
  slice; backfill can be run manually or queued by command.
- AI Phase A browser/manual issue-create and inbox-create smoke, Phase 3
  runtime/manual UI smoke, and Cloudflare authenticated smoke remain open.

## 2026-06-23 Cloudflare AI Provider Decision Update

Decision: use Cloudflare Workers AI for the issue semantic retrieval embedding
provider. The backend now defaults `WORKSPACE_AI_EMBEDDING_PROVIDER` to
`cloudflare` and `WORKSPACE_AI_EMBEDDING_MODEL` to
`@cf/baai/bge-base-en-v1.5`, matching Cloudflare's native Workers AI embedding
REST API.

Implementation notes:

- `get_issue_embedding_provider()` now returns a Cloudflare Workers AI REST
  provider when `WORKSPACE_AI_EMBEDDINGS_ENABLED` is enabled and
  `CLOUDFLARE_ACCOUNT_ID` plus `CLOUDFLARE_API_TOKEN` are present.
- Missing Cloudflare account/token values still return `None`, preserving the
  existing providerless keyword fallback and worker no-op behavior.
- `.env.example` now documents the Cloudflare embedding env contract.

Evidence:

- Cloudflare primary docs verified the native endpoint shape:
  `/client/v4/accounts/{account_id}/ai/run/@cf/baai/bge-base-en-v1.5`, request
  payload `{ "text": [...] }`, and output `result.data[]`.
- Combined provider/worker/endpoint suite:
  `python -m pytest plane/tests/unit/utils/test_issue_embeddings.py
plane/tests/unit/bg_tasks/test_issue_embedding_task.py
plane/tests/contract/app/test_duplicate_check_api.py
plane/tests/contract/app/test_similar_issues_api.py --no-header --tb=short
-q` reported `26 passed, 14 warnings` and `TEST_EXIT:0`.
- `python manage.py makemigrations --check --dry-run` reported
  `No changes detected` and `MAKEMIGRATIONS_CHECK_EXIT:0`.
- `python manage.py check` reported `DJANGO_CHECK_EXIT:0`.
- Plan artifact validation, `pnpm --filter @manut/cloudflare check`, and
  `git diff --check` passed.

Remaining AI provider gates:

- General Copilot/workflow LLM adapter still defaults to Vertex AI; adding a
  Cloudflare Workers AI chat/completions provider remains a separate follow-up.
- Real Cloudflare GLM live provider smoke is verified; authenticated
  upload/download smoke remains operator-gated.

## 2026-06-23 Cloudflare GLM-5.2 Text Model Update

Decision: general AI/Copilot/workflow text generation now uses Cloudflare
Workers AI model `@cf/zai-org/glm-5.2` by default. This is distinct from the
semantic embedding model, which remains `@cf/baai/bge-base-en-v1.5`.

Implementation notes:

- Added `cloudflare` / `workers-ai` provider support to the LLM adapter.
- Runtime text-generation calls use Cloudflare's native Workers AI REST
  endpoint `/client/v4/accounts/{account_id}/ai/run/@cf/zai-org/glm-5.2` with
  structured `messages`.
- `.env.example`, instance config defaults, and license instance defaults now
  point `LLM_PROVIDER=cloudflare` and `LLM_MODEL=@cf/zai-org/glm-5.2`.
- `CLOUDFLARE_API_TOKEN` can satisfy the Cloudflare API token path; runtime
  calls still require `CLOUDFLARE_ACCOUNT_ID`.

Evidence:

- Cloudflare primary docs verified `@cf/zai-org/glm-5.2` as a Workers AI text
  generation model with `messages` input and chat-completion-style output.
- Focused backend suite:
  `python -m pytest plane/tests/unit/utils/test_cloudflare_llm_provider.py
plane/tests/contract/app/test_copilot_app.py
plane/tests/contract/app/test_suggested_transition.py
plane/tests/unit/utils/test_issue_embeddings.py --no-header --tb=short -q`
  reported `27 passed, 15 warnings` and `TEST_EXIT:0`.
- `python manage.py makemigrations --check --dry-run` reported
  `No changes detected` and `MAKEMIGRATIONS_CHECK_EXIT:0`.
- `python manage.py check` reported `DJANGO_CHECK_EXIT:0`.
- Plan artifact validation, `pnpm --filter @manut/cloudflare check`, and
  `git diff --check` passed.

Remaining gates:

- Live Cloudflare GLM-5.2 credential smoke is verified with HTTP 200 evidence.
- Browser/manual AI duplicate override smoke and Phase 3 runtime/manual UI
  smoke remain open.

## 2026-06-23 Automatic Embedding Enqueue Update

Status: automatic issue create/update embedding enqueue is implemented and
locally verified. Live GLM-5.2 smoke is now also verified by
`process/general-plans/reports/cloudflare-workers-ai-smoke-2026-06-23.json`;
this update completes the next local implementation lane and the Cloudflare AI
live-smoke gate.

Implementation notes:

- `plane.db.signals.issue_embedding` registers a `post_save` receiver for
  `Issue`.
- The receiver exits when `WORKSPACE_AI_EMBEDDINGS_ENABLED` is disabled, during
  raw fixture saves, or when the issue is archived.
- Enabled create/update saves enqueue `issue_embedding_task.delay(str(issue.id))`
  through `transaction.on_commit(..., robust=True)`, so failed transactions do
  not schedule stale embedding work.
- `DbConfig.ready()` imports the signal module once during Django app startup.

Evidence:

- Focused embedding utility/task/signal suite:
  `python -m pytest plane/tests/unit/utils/test_issue_embeddings.py
plane/tests/unit/bg_tasks/test_issue_embedding_task.py --no-header --tb=short
-q` reported `18 passed` and `TEST_EXIT:0`.
- Combined AI backend suite:
  `python -m pytest plane/tests/unit/utils/test_issue_embeddings.py
plane/tests/unit/bg_tasks/test_issue_embedding_task.py
plane/tests/unit/utils/test_cloudflare_llm_provider.py
plane/tests/contract/app/test_duplicate_check_api.py
plane/tests/contract/app/test_similar_issues_api.py
plane/tests/contract/app/test_copilot_app.py
plane/tests/contract/app/test_suggested_transition.py --no-header --tb=short
-q` reported `47 passed, 29 warnings` and `TEST_EXIT:0`.
- `python manage.py makemigrations --check --dry-run` reported
  `No changes detected` and `MAKEMIGRATIONS_CHECK_EXIT:0`.
- `python manage.py check` reported `DJANGO_CHECK_EXIT:0`.
- Plan artifact validation, `pnpm --filter @manut/cloudflare check`, and
  `git diff --check` passed.

Remaining gates:

- Live Cloudflare GLM-5.2 credential smoke is verified with report
  `process/general-plans/reports/cloudflare-workers-ai-smoke-2026-06-23.json`.
- Browser/manual AI duplicate override smoke and Phase 3 runtime/manual UI smoke
  remain open.
- Cloudflare authenticated upload/download smoke remains operator-gated.

## 2026-06-23 Cloudflare GLM-5.2 Smoke Helper Update

Status: live GLM-5.2 smoke is still blocked by missing credentials, but the repo
now has a runnable Workers AI smoke helper to capture evidence once credentials
are available.

Added:

- `apps/cloudflare/tools/workers-ai-smoke.mjs`
- `pnpm --filter @manut/cloudflare smoke:workers-ai`
- `apps/cloudflare/src/workers-ai-smoke.test.ts`

Usage when credentials are available:

```bash
CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... \
  node apps/cloudflare/tools/workers-ai-smoke.mjs --json \
  --out process/general-plans/reports/cloudflare-workers-ai-smoke-2026-06-23.json
```

Evidence:

- No-credential run produced a non-secret JSON report with `ok:false`,
  `checks[0].id:"credentials"`, and `WORKERS_AI_SMOKE_EXIT:1`.
- Cloudflare package tests passed: `26` files / `220` tests,
  `WORKERS_AI_TEST_EXIT:0`.
- `pnpm --filter @manut/cloudflare check` reported
  `CLOUDFLARE_CHECK_EXIT:0`.
- `git diff --check` passed.

Remaining gates:

- Run the smoke helper with real Cloudflare credentials and attach the generated
  report.
- Browser/manual AI duplicate override smoke, Phase 3 runtime/manual UI smoke,
  and Cloudflare authenticated upload/download smoke remain open.

## 2026-06-23 Cloudflare Workers AI Live Smoke Update

Status: verified. The Cloudflare Workers AI GLM smoke now has credentialed live
evidence for model `@cf/zai-org/glm-5.2`.

Evidence:

```bash
node apps/cloudflare/tools/workers-ai-smoke.mjs --json \
  --out process/general-plans/reports/cloudflare-workers-ai-smoke-2026-06-23.json
```

- `WORKERS_AI_SMOKE_EXIT:0`
- Report: `process/general-plans/reports/cloudflare-workers-ai-smoke-2026-06-23.json`
- Report summary: `ok:true`, `checks[1].id:"workers-ai-run"`,
  `checks[1].status:200`, response excerpt
  `Cloudflare Workers AI is reachable for Manut.`

Remaining continuation gates are still manual/operator-bound: browser duplicate
override smoke for issue-create/inbox-create, Phase 3 Workflows/Approvals runtime
UI smoke, and authenticated upload/download smoke.
