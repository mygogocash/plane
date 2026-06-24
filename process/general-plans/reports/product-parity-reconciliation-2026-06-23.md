# Product Parity Reconciliation Report

Date: 2026-06-23
Checkout: `/Users/kunanonjarat/Developer/mygogocash-plane`
Branch: `preview`

## Summary

The product parity PRDs remain the requirement source, but several status
claims are stale relative to current code. The next implementation work should
start from code/test evidence, not only from the older "missing" statements.

## Implemented Or Partially Implemented Evidence

### Work Item Custom Properties

Evidence:

- `apps/api/plane/db/models/issue_property.py`
- `apps/api/plane/db/migrations/0127_custom_properties.py`
- `apps/api/plane/app/views/issue/property.py`
- `apps/api/plane/app/serializers/issue_property.py`
- `apps/web/core/store/issue-property.store.ts`
- `apps/web/core/services/issue-property.service.ts`
- `apps/web/core/store/issue-property.store.test.ts`

Status: implemented or partially implemented. UI completeness and runtime smoke
still need verification before closure.

### Work Item Templates

Evidence:

- `apps/api/plane/db/models/work_item_template.py`
- `apps/api/plane/db/migrations/0128_work_item_templates.py`
- `apps/api/plane/app/views/issue/template.py`
- `apps/api/plane/app/serializers/work_item_template.py`
- `apps/web/core/store/work-item-template.store.ts`
- `apps/web/core/services/work-item-template.service.ts`
- `apps/web/core/store/work-item-template.store.test.ts`

Status: implemented or partially implemented. Continue with create-from-template
UI hydration and smoke verification if not already proven.

### Recurring Work Items

Evidence:

- `apps/api/plane/db/models/recurring_work_item.py`
- `apps/api/plane/db/migrations/0129_recurring_work_items.py`
- `apps/api/plane/app/views/issue/recurring.py`
- `apps/api/plane/app/serializers/recurring_work_item.py`
- `apps/api/plane/tests/unit/bg_tasks/test_recurring_generation.py`
- `apps/web/core/store/recurring-work-item.store.ts`
- `apps/web/core/services/recurring-work-item.service.ts`
- `apps/web/core/store/recurring-work-item.store.test.ts`

Status: implemented or partially implemented. Scheduler/runtime verification and
UI smoke evidence remain required.

### Workflows And Approvals

Evidence:

- `apps/api/plane/db/models/workflow.py`
- `apps/api/plane/db/migrations/0125_workflowtransition_workitemapproval_and_more.py`
- `apps/api/plane/app/views/workflow/base.py`
- `apps/api/plane/api/views/workflow.py`
- `apps/api/plane/utils/workflow.py`
- `apps/api/plane/tests/contract/app/test_approvals.py`
- `apps/api/plane/tests/contract/api/test_workflow_v1.py`
- `apps/api/plane/tests/unit/models/test_workflow_models.py`
- `apps/api/plane/tests/unit/serializers/test_workflow_serializers.py`
- `apps/web/core/components/workflows/workflow-builder.test.tsx`
- `apps/web/core/components/workflows/approval-banner.utils.ts`

Status: backend and utility layers are significantly implemented. The next likely
gap is frontend integration: visual builder, approval banner surface,
board/status drag enforcement, and replacing or wiring CE stubs.

Targeted test note:

- Initial targeted Vitest runs failed because package entrypoints for workspace
  packages such as `@plane/utils` and `@plane/constants` expected built `dist`
  output.
- Building `@plane/utils`, `@plane/constants`, `@plane/types`, and
  `@plane/i18n` resolved package resolution.
- Targeted command passed after those builds:
  `pnpm --filter web exec vitest run core/components/workflows/approval-banner.test.tsx core/components/workflows/workflow-builder.test.tsx ce/components/workflow/workflow-enforcement.test.tsx core/store/workflow.store.test.ts core/store/recurring-work-item.store.test.ts core/store/work-item-template.store.test.ts core/store/issue-property.store.test.ts --no-color`
- Result: 7 test files passed, 28 tests passed.
- Backend workflow and approval command passed in Docker/Python 3.12 after
  installing test requirements inside the throwaway API container:
  `docker compose --env-file .env.example run --rm api sh -lc 'pip install -r requirements/test.txt >/dev/null && python -m pytest plane/tests/unit/models/test_workflow_models.py plane/tests/unit/serializers/test_workflow_serializers.py plane/tests/contract/api/test_workflow_v1.py plane/tests/contract/app/test_workflow_config.py plane/tests/contract/app/test_workflow_transitions_crud.py plane/tests/contract/app/test_approvals.py --no-header --tb=short -q >/dev/null 2>&1'`

Automated verification update - 2026-06-23:

- Frontend workflow/approvals suite passed: `7` test files, `28` tests.
- Backend workflow/approvals suite passed with `plane-db`, `plane-redis`, and
  `plane-mq` running: `32 passed, 30 warnings in 57.53s`; `TEST_EXIT:0`.
- Manual runtime/UI smoke remains required before closing the lane.

### Workflows And Approvals Verification Refresh - 2026-06-23

Status: automated frontend workflow/approval coverage still passes in the
current checkout. Runtime/manual gated-transition UI smoke remains open.

Evidence:

- `pnpm --filter web exec vitest run core/components/workflows/approval-banner.test.tsx core/components/workflows/workflow-builder.test.tsx ce/components/workflow/workflow-enforcement.test.tsx core/store/workflow.store.test.ts core/store/recurring-work-item.store.test.ts core/store/work-item-template.store.test.ts core/store/issue-property.store.test.ts --no-color; code=$?; echo WORKFLOW_FRONTEND_TEST_EXIT:$code; exit $code`
  - Result: `7` files, `28` tests passed; `WORKFLOW_FRONTEND_TEST_EXIT:0`.

### Copilot Persistence And Existing AI Surface

Evidence:

- `apps/api/plane/db/models/copilot.py`
- `apps/api/plane/db/migrations/0122_copilotconversation_copilotmessage.py`
- `apps/api/plane/app/views/copilot.py`
- `apps/api/plane/tests/contract/app/test_copilot_app.py`
- `apps/api/plane/tests/contract/app/test_copilot_query.py`
- `apps/web/core/services/ai.service.ts`

Status: Copilot persistence and app/API surface exist. Later AI parity items
such as embeddings, duplicate detection, summaries, intake triage, connectors,
and MCP still require requirement-by-requirement verification.

2026-06-23 Ask AI workspace-scope update:

- CE Ask AI now supports the backend's existing `workspace` Copilot query scope,
  omitting `object_id` for workspace summaries and rendering workspace-scoped
  result copy.
- `apps/web/ce/components/copilot/ask-ai-action.tsx` no longer depends on
  unresolved `@plane/ui` / `@plane/propel/button` exports.
- Verification:
  - `pnpm --dir apps/web exec vitest run ce/components/copilot/ask-ai-action.test.tsx --reporter=verbose`
    passed with `1` file and `5` tests.
  - Combined affected web suite passed with `6` files and `24` tests.
  - Broad `pnpm --dir apps/web check:types` now passes after rebuilding local
    workspace package `dist` outputs and fixing the backlinks info panel page id
    type.

### Wiki And Pages

Evidence:

- `apps/api/plane/db/models/page.py`
- `apps/api/plane/app/views/page/`
- `apps/api/plane/app/permissions/page.py`
- `apps/api/plane/tests/contract/app/test_pages_app.py`
- `apps/web/core/components/pages/import/page-import.utils.test.ts`
- `apps/web/core/components/pages/modals/export-page-modal.tsx`
- `apps/web/ce/lib/self-host-entitlements.ts`
- `apps/web/ce/hooks/use-editor-flagging.ts`
- `apps/web/ce/hooks/use-editor-flagging.test.ts`

Status:

- Core project pages exist with backend API coverage.
- Page import sanitization tests exist and pass.
- Export is partial, not missing: the web app has client-side PDF and Markdown
  export; server-side recursive/large-tree/HTML export remains a future slice.
- WIKI-T1 is implemented in this checkout: `collaboration_cursor` is now a
  self-host entitlement flag, and editor flagging no longer hard-disables
  `collaboration-cursor` when that flag is enabled.
- WIKI-T2/WIKI-T3 are implemented in this checkout: page entity search matches
  `description_stripped`, returns bounded plain-text snippets, and command
  palette page rows render snippets safely when present.
- WIKI-T4/WIKI-T5 are implemented in this checkout: project pages expose a
  read-only backlinks endpoint over `PageLog`, source pages are filtered by
  read access, and the Info tab renders backlinks with empty/loading/error
  states.

Validation:

- `pnpm --filter web exec vitest run ce/lib/self-host-entitlements.test.ts ce/hooks/use-editor-flagging.test.ts core/components/pages/import/page-import.utils.test.ts --no-color`
  passed: 3 files, 13 tests.
- `docker compose --env-file .env.example run --rm api sh -lc 'pip install -r requirements/test.txt >/dev/null && python -m pytest plane/tests/contract/app/test_pages_app.py --no-header --tb=short -q'`
  passed after starting `plane-db`, `plane-redis`, and `plane-mq`.
- `docker compose --env-file .env.example run --name plane-test-search -e DJANGO_SETTINGS_MODULE=plane.settings.test api sh -lc 'pip install -r requirements/test.txt >/dev/null && python -m pytest plane/tests/contract/app/test_search_app.py --no-header --tb=short -q; code=$?; echo TEST_EXIT:$code; exit $code'`
  passed: 2 tests, exit code 0.
- `pnpm --filter web exec vitest run ce/lib/self-host-entitlements.test.ts ce/hooks/use-editor-flagging.test.ts core/components/pages/import/page-import.utils.test.ts ce/components/command-palette/helpers.test.tsx --no-color`
  passed: 4 files, 15 tests.
- `docker compose --env-file .env.example run --name plane-test-wiki-backend -e DJANGO_SETTINGS_MODULE=plane.settings.test api sh -lc 'pip install -r requirements/test.txt >/dev/null && python -m pytest plane/tests/contract/app/test_page_backlinks_app.py plane/tests/contract/app/test_search_app.py plane/tests/contract/app/test_pages_app.py --no-header --tb=short -q; code=$?; echo TEST_EXIT:$code; exit $code'`
  passed: 8 tests, exit code 0.
- `pnpm --filter web exec vitest run ce/lib/self-host-entitlements.test.ts ce/hooks/use-editor-flagging.test.ts core/components/pages/import/page-import.utils.test.ts ce/components/command-palette/helpers.test.tsx core/components/pages/navigation-pane/tab-panels/info/backlinks.test.tsx --no-color`
  passed: 5 files, 17 tests.
- `pnpm --filter web check:types` still fails broadly on unresolved workspace
  package imports outside the Wiki search/snippet slice, so it is not yet usable
  as slice-specific proof.

### 2026-06-23 WIKI-T6/WIKI-T7 Update

Status: page-template backend/client slice implemented and verified.

Evidence:

- Added `PageTemplate` model, migration, serializer, workspace-scoped CRUD/apply API,
  and backend contract coverage in `test_page_templates_app.py`.
- Added page-template type/service/store/gallery modal integration and frontend tests.
- Verification passed:
  - Backend Wiki suite: `13 passed, 17 warnings`.
  - Frontend Wiki suite: `5 passed` test files, `19 passed` tests.
  - Migration drift check: `No changes detected in app 'db'`; exit `0`.
- Broad web `check:types` still fails on existing unresolved `@plane/ui` and
  `@plane/propel/*` declarations, but filtered output shows no new page-template
  type errors.

### AI/Copilot Project Summary Update - 2026-06-23

Status: project-scoped Copilot summaries are implemented and verified for the
bounded summary/evidence slice. Broader AI parity still needs separate
requirement-by-requirement planning for embeddings, duplicate detection, intake
triage, connectors, automation, and MCP.

Evidence:

- Backend project-scope query support now returns project evidence plus status
  update evidence from epics in the readable project.
- CE Ask AI supports project-scoped payloads and project result copy.
- Backend verification: `6 passed, 7 warnings in 56.24s`; `TEST_EXIT:0` for
  `plane/tests/contract/app/test_copilot_query.py`.
- Web verification: `6` Vitest files and `26` tests passed for the affected
  Copilot/Wiki suite.

### AI-E2 Duplicate-Check Backend Update - 2026-06-23

Status: duplicate-check server endpoint is implemented and verified for the
keyword fallback path. Remaining AI-E2 work is the issue-create UI debounce,
score display, high-confidence override UX, and later embedding-ranked retrieval
when AI-E1 embeddings exist.

Evidence:

- Added `POST /api/workspaces/<slug>/projects/<project_id>/issues/duplicate-check/`
  using existing same-project issue similarity scoring.
- Contract coverage verifies ranked candidates, high-confidence threshold,
  empty input, cross-project isolation, non-member rejection, and regression for
  the existing `/issues/similar/` endpoint.
- Backend verification: `9 passed, 11 warnings in 63.32s`; `TEST_EXIT:0`.

### AI-E2 Duplicate-Check Frontend Bridge Update - 2026-06-23

Status: issue-create/inbox de-dupe consumers now route through the new
duplicate-check service/hook contract while keeping the existing `TSimilarIssue`
card shape. Remaining frontend polish is explicit high-confidence override copy
and richer score/matched-field display.

Evidence:

- `SimilarIssuesService` now preserves legacy `/issues/similar/` list behavior
  and adds `checkDuplicates`/`listDuplicates` for
  `/issues/duplicate-check/`.
- `useDebouncedDuplicateIssues` now calls `listDuplicates`, maps candidates to
  existing de-dupe issue cards, and uses the `ai_copilot` entitlement.
- Frontend verification: `2` Vitest files and `4` tests passed for the service
  and hook; targeted type diagnostic grep returned no edited-file errors.

### AI-E2 Transparent Duplicate-Match UI Update - 2026-06-23

Status: the de-dupe modal now renders transparent match evidence for duplicate
candidates that include `matched_on[]`. Remaining AI-E2 work is deeper product
parity: high-confidence override/audit UX and later embedding-ranked retrieval
when AI-E1 embeddings exist.

Evidence:

- Added `formatMatchedFields` and a `Matched on ...` row to duplicate cards.
- Added focused component coverage for match-field formatting and rendering.
- Added a `types` condition for `@plane/propel/toast` so the source checkout
  resolves the package subpath during web type checks.
- `pnpm --dir apps/web exec vitest run ce/components/de-dupe/de-dupe-button.test.tsx core/services/similar-issues.service.test.ts ce/hooks/use-debounced-duplicate-issues.test.ts --reporter=verbose; code=$?; echo TEST_EXIT:$code; exit $code`
  - Result: `3` files, `9` tests passed; `TEST_EXIT:0`.
- `pnpm --dir apps/web exec tsc --noEmit --pretty false 2>&1 | grep -E "(de-dupe|similar-issues|use-debounced-duplicate|propel/toast)" || true`
  - Result: no diagnostics for the edited de-dupe, similar-issues,
    duplicate-issues hook, or `@plane/propel/toast` paths.
- `git diff --check`
  - Result: `DIFF_CHECK_EXIT:0`.

### AI-E2 High-Confidence Override Frontend Gate - 2026-06-23

Status: frontend create surfaces now block by default when duplicate-check
metadata marks a candidate as high confidence. Backend override audit/activity
recording is now implemented and verified. Direct frontend component evidence
for the blocking warning is implemented; full browser/manual smoke of the
package-heavy create modals remains useful before release.

Evidence:

- `SimilarIssuesService.checkDuplicateIssues` preserves `high_confidence`,
  `threshold`, and retrieval metadata while `listDuplicates` remains
  array-compatible.
- `useDebouncedDuplicateIssues` exposes `hasHighConfidenceDuplicate` and
  recomputes it after filtering the current issue out of edit/detail contexts.
- Main issue creation and inbox issue creation disable submit until the user
  explicitly acknowledges a high-confidence duplicate warning.
- Acknowledged create payloads include `duplicate_override` metadata, and
  backend issue creation emits `issue_duplicate_override.activity.created`.
- `docker compose --env-file .env.example run --name plane-test-duplicate-override -e DJANGO_SETTINGS_MODULE=plane.settings.test api sh -lc 'pip install -r requirements/test.txt >/dev/null && python -m pytest plane/tests/contract/app/test_duplicate_check_api.py plane/tests/contract/app/test_similar_issues_api.py --no-header --tb=short -q; code=$?; echo TEST_EXIT:$code; exit $code'`
  - Result: `10` tests passed, `12` warnings in `53.87s`; `TEST_EXIT:0`.
- `pnpm --dir apps/web exec vitest run ce/components/de-dupe/duplicate-override-warning.test.tsx core/services/similar-issues.service.test.ts ce/hooks/use-debounced-duplicate-issues.test.ts ce/components/de-dupe/de-dupe-button.test.tsx --reporter=verbose`
  - Result: `4` files, `12` tests passed; `FRONTEND_TEST_EXIT:0`.
- `pnpm --dir apps/web exec tsc --noEmit --pretty false 2>&1 | grep -E "(similar-issues|use-debounced-duplicate|de-dupe|issue-modal/form|create-modal/create-root)" || true`
  - Result: no new syntax or local contract diagnostics for edited paths;
    residual `@plane/editor`, `@plane/ui`, and `@plane/propel/button`
    broad web typecheck now passes after rebuilding local workspace package
    `dist` outputs and fixing the backlinks info panel page id type.

## Recommended Continuation Order

1. Finish live authenticated smoke follow-up when controlled credentials are
   available.
2. Complete runtime/manual Workflows and Approvals UI smoke.
3. Continue deeper AI parity from
   `process/general-plans/active/ai-parity-followup_PLAN_23-06-26.md`, starting
   with Phase A high-confidence duplicate override/audit before embeddings,
   intake triage, connectors, automation, or MCP.
4. Reassess remaining Wiki PRD lanes after the current evidence gates;
   WIKI-T6/WIKI-T7 are verified.

## Documentation Handling

Do not delete older PRDs. They preserve product intent and acceptance criteria.
Update active plans and reports with current code evidence, then edit PRD status
sections only when an implementation slice is verified.

## Continuation Evidence - 2026-06-23

- Workflows/Approvals frontend verification rerun:
  `pnpm --dir apps/web exec vitest run core/components/workflows/approval-banner.test.tsx core/components/workflows/workflow-builder.test.tsx ce/components/workflow/workflow-enforcement.test.tsx core/store/workflow.store.test.ts --reporter=verbose`
  passed with `4` files and `22` tests.
- Workflows/Approvals backend verification initially exposed a test-environment
  broker leak in `test_delete_as_admin__soft_deletes`; the contract test now
  mocks `plane.db.mixins.soft_delete_related_objects.delay` so workflow
  deletion assertions do not require RabbitMQ.
- Backend workflow/approval rerun passed with `32 passed`, `30 warnings`, and
  `TEST_EXIT:0`.
- This closes the automated Phase 3 regression evidence gap. Runtime/manual
  Workflows and Approvals UI smoke remains a separate open gate.
- AI-E2 frontend evidence was strengthened by extracting a shared
  `buildDuplicateOverridePayload` helper for the issue-create and inbox-create
  submit paths. The focused duplicate suite now covers the acknowledged
  high-confidence override payload contract and passes with `4` files / `14`
  tests.
- Broad web typecheck evidence was refreshed: after building local workspace
  packages (`@plane/propel`, `@plane/shared-state`, `@plane/services`,
  `@plane/hooks`, `@plane/ui`, `@plane/editor`) and allowing optional page ids
  in the backlinks info panel prop, `pnpm --dir apps/web check:types` passes
  with `TYPECHECK_EXIT:0`.
- AI-E1 embedding foundation is now implemented behind
  `WORKSPACE_AI_EMBEDDINGS_ENABLED`: `IssueEmbedding` schema/migration,
  provider-agnostic upsert helper, default no-op behavior, same-hash reuse, and
  provider-failure preservation. Focused verification passed with `4` backend
  tests and migration drift check reported `No changes detected`.

### 2026-06-23 AI Semantic Retrieval Reconciliation Update

Status: AI-E1 semantic retrieval foundation is now exercised by the
similar-issues and duplicate-check endpoints behind the existing provider-disabled
fallback. AI-E2 duplicate-check now preserves semantic match evidence and numeric
threshold scores when embedding-ranked candidates are available.

Evidence:

- Focused semantic retrieval backend suite passed: `19 passed, 14 warnings`,
  `TEST_EXIT:0`.
- Migration/system checks passed: `MAKEMIGRATIONS_CHECK_EXIT:0` with
  `No changes detected`, and `DJANGO_CHECK_EXIT:0`.
- Plan artifact validation passed for both active continuation plans with zero
  failures and zero warnings.

Remaining reconciliation gaps:

- Async embedding backfill/worker/provider productionization is not complete.
- Browser/manual issue-create and inbox-create smoke remains required before AI
  parity can be considered user-flow complete.
- Cloudflare authenticated smoke and Phase 3 runtime/manual UI smoke remain
  separate open gates.

### 2026-06-23 AI Embedding Worker/Backfill Update

Status: semantic retrieval now has a local worker/backfill path in addition to
the endpoint ranking bridge. This improves AI-E1 readiness by giving operators a
bounded command to populate stored issue embeddings once a provider is
configured.

Evidence:

- Worker/backfill unit coverage passed with `11 passed`, `TEST_EXIT:0`.
- Combined semantic endpoint and worker coverage passed with `23 passed,
14 warnings`, `TEST_EXIT:0`.
- Disabled-mode management command smoke passed with structured disabled output.
- Migration drift and Django system checks stayed clean.

Remaining reconciliation gaps:

- Provider/secret production configuration is still required.
- Automatic per-write embedding enqueue is still a policy/implementation gap.
- Browser/manual AI duplicate flows and external Cloudflare smoke remain
  unverified.

### 2026-06-23 Cloudflare AI Provider Reconciliation Update

Status: the semantic embedding provider gap now has Cloudflare Workers AI
wiring. The default issue embedding model is `@cf/baai/bge-base-en-v1.5`, and
provider activation requires explicit Cloudflare account/token env values.

Evidence:

- Primary Cloudflare Workers AI docs were checked for the BGE base embedding
  REST endpoint and `result.data[]` response shape.
- Provider/worker/endpoint backend suite passed with `26 passed, 14 warnings`,
  `TEST_EXIT:0`.
- Migration drift, Django system check, plan validation, Cloudflare TypeScript
  check, and diff hygiene all passed.

Remaining reconciliation gaps:

- Copilot/workflow LLM provider remains Vertex-configured in this slice.
- Live Cloudflare AI credential smoke is verified.
- Manual/browser AI duplicate-flow smoke remains pending.

### 2026-06-23 Cloudflare GLM-5.2 LLM Reconciliation Update

Status: Copilot/workflow text-generation provider parity now points to
Cloudflare Workers AI `@cf/zai-org/glm-5.2` by default. Semantic retrieval still
uses the separate Cloudflare BGE embedding model.

Evidence:

- Cloudflare model docs were checked for GLM-5.2 usage via Workers AI native
  REST `messages` calls.
- Focused backend suite passed with `27 passed, 15 warnings`, `TEST_EXIT:0`.
- Migration drift, Django system check, plan validation, Cloudflare TypeScript
  check, and diff hygiene all passed.

Remaining reconciliation gaps:

- Live Cloudflare GLM-5.2 credential smoke is verified.
- Manual/browser AI duplicate flows remain unverified.

### 2026-06-23 Automatic Embedding Enqueue Reconciliation Update

Status: the automatic per-write embedding enqueue gap is now closed locally.
Issue create/update saves enqueue single-issue embedding refreshes after commit
when embeddings are enabled.

Evidence:

- Focused embedding signal/task coverage passed with `18 passed`,
  `TEST_EXIT:0`.
- Combined AI backend coverage passed with `47 passed, 29 warnings`,
  `TEST_EXIT:0`.
- Migration drift, Django system check, plan validation, Cloudflare TypeScript
  check, and diff hygiene all passed.

Remaining reconciliation gaps:

- Live Cloudflare GLM-5.2 credential smoke is verified.
- Manual/browser AI duplicate-flow smoke remains pending.

### 2026-06-23 Cloudflare GLM-5.2 Smoke Helper Update

Status: GLM-5.2 live smoke remains pending, but the repo now includes a
credential-gated smoke helper that produces non-secret JSON evidence.

Evidence:

- `node apps/cloudflare/tools/workers-ai-smoke.mjs --json` without credentials
  returned an expected `ok:false` credentials report and exit `1`.
- `pnpm --filter @manut/cloudflare test -- --run
src/workers-ai-smoke.test.ts` passed the package suite with `26` files /
  `220` tests and `WORKERS_AI_TEST_EXIT:0`.
- `pnpm --filter @manut/cloudflare check` reported
  `CLOUDFLARE_CHECK_EXIT:0`.

Remaining reconciliation gaps:

- Run the helper with real Cloudflare credentials and attach the generated
  report.
- Manual/browser AI duplicate-flow smoke remains pending.

## 2026-06-23 Cloudflare Workers AI Live Smoke Update

The Cloudflare AI credential smoke is now verified for
`@cf/zai-org/glm-5.2`.

Evidence:

```bash
node apps/cloudflare/tools/workers-ai-smoke.mjs --json \
  --out process/general-plans/reports/cloudflare-workers-ai-smoke-2026-06-23.json
```

- `WORKERS_AI_SMOKE_EXIT:0`
- Report: `process/general-plans/reports/cloudflare-workers-ai-smoke-2026-06-23.json`
- Report summary: `ok:true`, `checks[1].status:200`,
  `checks[1].response_excerpt:"Cloudflare Workers AI is reachable for Manut."`

Remaining reconciliation gates are unchanged: manual/browser AI duplicate-flow
smoke, Phase 3 Workflows/Approvals runtime UI smoke, and Cloudflare
authenticated upload/download smoke.
