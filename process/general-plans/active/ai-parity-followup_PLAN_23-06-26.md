# AI Parity Follow-up Plan

Status: READY_FOR_REVIEW
Date: 2026-06-23
Complexity: COMPLEX
Created: 2026-06-23
Source continuation plan:
`process/general-plans/active/pending-continuation-lanes_PLAN_23-06-26.md`

## Context

The pending continuation lane has closed the local AI-E2 keyword duplicate-check
path through backend, service/hook, and transparent UI evidence. Remaining AI
parity work is larger than a single implementation slice and needs a focused
plan before execution.

Current verified AI evidence:

- `POST /api/workspaces/<slug>/projects/<project_id>/issues/duplicate-check/`
  exists and preserves the existing `/issues/similar/` envelope.
- `SimilarIssuesService.checkDuplicates` / `listDuplicates` and
  `useDebouncedDuplicateIssues` route issue-create/inbox de-dupe through the
  duplicate-check contract.
- The de-dupe modal renders candidate confidence and `matched_on[]` evidence.
- Existing Copilot persistence and workspace/project summary work is recorded
  in `process/general-plans/reports/product-parity-reconciliation-2026-06-23.md`.

Open AI parity areas from `docs/plan/ai/` and the product parity report:

- AI-E2: high-confidence duplicate blocking, create-anyway override, and audit.
- AI-E1: embeddings foundation, lazy embedding generation, semantic retrieval,
  and keyword fallback preservation.
- AI-E3/E4/E5: summaries, editor/wiki AI assist, and build-mode draft/apply.
- AI-E6/E7/E8/E9: automation rules, intake triage, connectors, agent records,
  and MCP/service integration.

## Goals

1. Finish AI-E2 product behavior without changing the verified keyword fallback.
2. Add AI-E1 embedding infrastructure behind an explicit flag/provider gate.
3. Upgrade Copilot retrieval only after embeddings are proven and safe.
4. Sequence summaries, automation, intake triage, connectors, and MCP behind
   auditable records and provider fail-closed behavior.

## Acceptance Criteria

- Phase A is complete only when high-confidence duplicate candidates block issue
  creation by default, "Create anyway" requires explicit acknowledgement, and
  the override is recorded in an audit/activity trail.
- Phase B is complete only when issue embeddings are stored, regenerated
  lazily, skipped safely when no provider is configured, and preserved on
  provider failure.
- Phase C is complete only when embedding-ranked retrieval is used exclusively
  for fresh, scoped embeddings and keyword fallback remains unchanged otherwise.
- Phase D is complete only when summary/context-assist endpoints are
  permission-checked, fail closed without a provider, and return safe empty
  states for empty entities.
- Phase E is complete only when automation, intake triage, connector, and MCP
  actions are scoped, audited, secret-safe, and non-autonomous by default.

## Non-Goals

- Do not copy proprietary Plane Cloud or EE source.
- Do not require an LLM provider for ordinary issue creation, search, or
  duplicate-check keyword fallback.
- Do not add autonomous mutation in v1; agent-like features must create
  auditable records and require explicit user approval before writes.
- Do not log prompts, API keys, webhook secrets, embeddings, or raw provider
  responses containing user content beyond bounded, sanitized test fixtures.

## Touchpoints

Context and testing routers:

- `process/context/all-context.md`
- `process/context/tests/all-tests.md`

Likely backend touchpoints:

- `apps/api/plane/app/views/copilot.py`
- `apps/api/plane/app/views/issue/similar.py`
- `apps/api/plane/db/models/`
- `apps/api/plane/bgtasks/`
- `apps/api/plane/tests/contract/app/`

Likely frontend touchpoints:

- `apps/web/core/services/ai.service.ts`
- `apps/web/core/services/similar-issues.service.ts`
- `apps/web/ce/hooks/use-debounced-duplicate-issues.tsx`
- `apps/web/ce/components/de-dupe/`
- `apps/web/ce/lib/self-host-entitlements.ts`

## Public Contracts

Existing contracts that must remain compatible:

- `GET /api/workspaces/<slug>/projects/<project_id>/issues/similar/`
  returns the legacy similar-issues response shape.
- `POST /api/workspaces/<slug>/projects/<project_id>/issues/duplicate-check/`
  returns `candidates[]`, `high_confidence`, `threshold`, and legacy
  `results[]` compatibility data.
- Copilot provider checks continue to fail closed with a clear provider
  configuration error when generation is required.
- Guests and non-members receive permission failures before retrieval,
  generation, or candidate IDs are exposed.

New contracts must be introduced one slice at a time and documented in this
plan before implementation starts.

## Blast Radius

- Backend: `apps/api/plane/db/models/*`, migrations, Copilot views, issue views,
  background tasks, API routes, and contract tests.
- Frontend: issue-create modal, inbox de-dupe surfaces, Copilot service/store,
  editor/wiki AI affordances, automation/intake settings, and entitlement flags.
- Data: optional embeddings, summary rows, automation/agent audit records,
  webhook secret storage, and provider configuration.
- Runtime: Docker API image must be rebuilt before backend Docker tests when
  source is baked into the image.

## Phase A - AI-E2 High-Confidence Override And Audit

Status: AUTOMATED_VERIFIED; browser/manual issue-create and inbox-create smoke remains pending.

Tasks:

- Define the duplicate block threshold contract in one shared backend constant
  or settings-backed value.
- Return enough duplicate-check metadata for the UI to distinguish advisory
  matches from high-confidence blocking matches.
- Add issue-create UI behavior for blocking warning, "Create anyway" override,
  and explicit user acknowledgement.
- Record an audit/activity entry when a high-confidence duplicate is overridden.
- Preserve empty-title, empty-project, guest, and keyword-fallback behavior.

Implementation update - 2026-06-23:

- Frontend duplicate-check metadata now preserves `high_confidence`,
  `threshold`, and per-card `is_high_confidence` data through the service and
  hook layer.
- Main issue creation and inbox issue creation now disable submit when a
  high-confidence duplicate is present until the user explicitly checks a
  create-anyway acknowledgement.
- Create payloads now include `duplicate_override` metadata only after explicit
  acknowledgement.
- Backend issue creation records
  `issue_duplicate_override.activity.created` with candidate ids and threshold
  when the override is acknowledged.
- Direct frontend warning evidence now covers the shared create-anyway
  acknowledgement control and override-required helper. Full browser/manual
  smoke of the package-heavy issue modal surfaces remains useful before release
  because runtime behavior still needs an authenticated browser session.

Verification:

- Backend duplicate-check contract tests for threshold, empty input, permission
  failure, and override audit creation.
- Frontend tests for blocking warning, override enablement, and non-blocking
  advisory matches.
- Targeted type diagnostic grep for duplicate/de-dupe files.
- Current frontend plumbing and warning evidence:
  `pnpm --dir apps/web exec vitest run ce/components/de-dupe/duplicate-override-warning.test.tsx core/services/similar-issues.service.test.ts ce/hooks/use-debounced-duplicate-issues.test.ts ce/components/de-dupe/de-dupe-button.test.tsx --reporter=verbose`
  passed `4` files and `14` tests; `FRONTEND_TEST_EXIT:0`.
- Backend audit evidence:
  `docker compose --env-file .env.example run --name plane-test-duplicate-override -e DJANGO_SETTINGS_MODULE=plane.settings.test api sh -lc 'pip install -r requirements/test.txt >/dev/null && python -m pytest plane/tests/contract/app/test_duplicate_check_api.py plane/tests/contract/app/test_similar_issues_api.py --no-header --tb=short -q; code=$?; echo TEST_EXIT:$code; exit $code'`
  passed `10` tests with `12` warnings in `53.87s`; `TEST_EXIT:0`.
- Broad web typecheck now passes after building the local workspace packages
  that provide `dist` exports and fixing the backlinks info panel page id type:
  `pnpm --dir apps/web check:types`; `TYPECHECK_EXIT:0`.
- Phase B embedding foundation is implemented behind
  `WORKSPACE_AI_EMBEDDINGS_ENABLED`: `IssueEmbedding` model/migration,
  content-hash/model/provider metadata, provider-agnostic upsert helper, default
  no-op behavior, same-hash reuse, and provider-failure preservation.
- Phase B focused backend verification:
  `python -m pytest plane/tests/unit/utils/test_issue_embeddings.py --no-header --tb=short -q`
  passed with `4` tests; `TEST_EXIT:0`.
- Migration drift check:
  `python manage.py makemigrations --check --dry-run`; `No changes detected`;
  `MAKEMIGRATIONS_CHECK_EXIT:0`.

## Phase B - AI-E1 Embedding Foundation

Status: FOUNDATION_VERIFIED; semantic retrieval integration and async worker backfill remain pending.

Tasks:

- Add `IssueEmbedding` model/migration with workspace/project scoping,
  `content_hash`, `model_name`, and vector payload storage appropriate for the
  current database strategy.
- Add lazy embedding generation on issue write behind
  `WORKSPACE_AI_EMBEDDINGS_ENABLED`.
- Preserve save success when no provider is configured.
- Leave prior embedding rows intact when provider calls fail.
- Add deterministic test seams so provider behavior is mocked, not live-called.

Verification:

- Migration check.
- Model tests for uniqueness/scope/content hash.
- Background task tests for no-provider skip, unchanged-content no-op, provider
  failure preservation, and successful upsert.
- Secret/log scan for provider key and prompt leakage.

## Phase C - Semantic Retrieval Upgrade

Status: NOT_STARTED

Tasks:

- Rank Copilot evidence and duplicate candidates by embeddings only when
  embeddings are enabled and fresh.
- Preserve the existing keyword path when embeddings are absent, stale, or
  disabled.
- Tag retrieval mode in responses for observability, for example
  `retrieval=relevance` or `retrieval=keyword`.
- Enforce workspace/project scoping before ranking.

Verification:

- Copilot semantic retrieval tests for cosine ranking, stale fallback,
  workspace isolation, empty project, and guest rejection.
- Duplicate-check tests showing embedding-ranked candidates and keyword
  fallback compatibility.
- Existing duplicate/similar contract tests continue to pass.

## Phase D - Summaries And Context Assist

Status: NOT_STARTED

Tasks:

- Add bounded summary endpoints for project/cycle/initiative scope only after
  retrieval semantics are stable.
- Add persisted summary records only after response privacy and sharing rules
  are explicit.
- Add context-aware assist for current entity with fail-closed provider behavior
  and empty-state responses.

Verification:

- Provider-disabled tests return clear 400 responses without provider calls.
- Permission tests reject guests/non-members before generation.
- Empty entity tests return safe "no activity" output.
- Summary persistence tests prove workspace isolation and revoked/expired share
  token behavior before any public read endpoint is exposed.

## Phase E - Automation, Intake, Connectors, And MCP

Status: NOT_STARTED

Entry criteria:

- Phase B and Phase C are green.
- Audit model shape is agreed.
- No autonomous mutation is introduced without explicit user approval gates.

Tasks:

- Add automation rule/run models and admin-only CRUD behind
  `workflows_approvals`.
- Add intake triage suggestions as non-mutating drafts first.
- Add connector records with encrypted secret fields and scoped sync jobs.
- Add MCP/service integration only as a bounded adapter over audited actions.

Verification:

- Admin/member/guest permission tests.
- Secret-field tests for connector credentials and webhook secrets.
- Worker tests for partial failure, retry safety, and no duplicate
  non-idempotent actions.
- Audit trail tests for every generated suggestion, approval, run, and
  user-applied action.

## Phased Delivery Plan

1. Execute Phase A first; it completes the already-started AI-E2 lane.
2. Execute Phase B before any semantic retrieval or AI ranking work.
3. Execute Phase C only after embedding generation and fallback tests are green.
4. Execute Phase D only after retrieval semantics are stable.
5. Execute Phase E last, one sub-slice at a time, because it touches worker,
   connector, secret, and audit surfaces.

## Phase Completion Rules

- Do not mark a phase complete from code review alone; every phase needs the
  targeted backend/frontend tests listed in its Verification block.
- Do not advance from Phase A to Phase B until duplicate override/audit behavior
  is verified and the existing duplicate/similar contracts still pass.
- Do not advance from Phase B to Phase C until migration checks and provider
  failure-preservation tests pass.
- Do not advance from Phase C to Phase D until keyword fallback and workspace
  isolation tests pass for Copilot and duplicate-check retrieval.
- Do not advance to Phase E until the audit model and explicit user-approval
  gate for generated actions are documented and reviewed.

## Verification Evidence

Test Procedure:

- `node .claude/skills/vc-generate-plan/scripts/validate-plan-artifact.mjs process/general-plans/active/ai-parity-followup_PLAN_23-06-26.md`
- Targeted backend Docker tests for every touched API/model/task slice.
- Targeted frontend Vitest tests for every touched UI/store/service slice.
- `pnpm --dir apps/web exec tsc --noEmit --pretty false` filtered to touched
  files, with residual broad package errors documented separately if present.
- `git diff --check`.
- Updated evidence in
  `process/general-plans/reports/product-parity-reconciliation-2026-06-23.md`.

## Resume and Execution Handoff

Selected plan:
`process/general-plans/active/ai-parity-followup_PLAN_23-06-26.md`

Current best next action:

1. Review and approve Phase A scope.
2. Implement AI-E2 high-confidence duplicate override/audit.
3. Run Phase A verification before starting embeddings.

Next Step: when this plan is approved, say `ENTER EXECUTE MODE` for Phase A.

NEXT EXECUTION: Phase A only. Do not start embeddings, summaries, automation,
connectors, or MCP until Phase A is verified or this plan is explicitly revised.

## Continuation Evidence - 2026-06-23

- Phase A frontend verification rerun after extracting the shared
  `buildDuplicateOverridePayload` helper used by issue-create and inbox-create:
  `pnpm --dir apps/web exec vitest run ce/components/de-dupe/duplicate-override-warning.test.tsx core/services/similar-issues.service.test.ts ce/hooks/use-debounced-duplicate-issues.test.ts ce/components/de-dupe/de-dupe-button.test.tsx --reporter=verbose`
  passed with `4` files and `14` tests.
- Phase A backend verification rerun after rebuilding the API image:
  `python -m pytest plane/tests/contract/app/test_duplicate_check_api.py plane/tests/contract/app/test_similar_issues_api.py --no-header --tb=short -q`
  passed with `10 passed`, `12 warnings`, and `TEST_EXIT:0`.
- Phase A remains gated by browser/manual smoke for the issue-create and
  inbox-create high-confidence duplicate override surfaces.

## 2026-06-23 Phase C Semantic Retrieval Update

Status: Phase C endpoint-side semantic retrieval is implemented and verified for
the AI-E1/AI-E2 bridge. Similar-issues and duplicate-check now attempt embedding
ranking when `WORKSPACE_AI_EMBEDDINGS_ENABLED` and a provider are available,
then preserve the keyword fallback when embeddings are disabled, unavailable, or
provider execution fails.

Verified behavior:

- Similar-issues returns embedding-ranked results with `retrieval: "embedding"`
  and `matched_on: ["embedding"]`.
- Duplicate-check returns embedding-ranked candidates with numeric `score`
  values, semantic `matched_on` evidence, and high-confidence threshold
  evaluation using those numeric scores.
- Providerless/default local behavior remains safe because
  `get_issue_embedding_provider()` returns `None` and semantic ranking returns
  `None`, preserving the existing keyword path.

Evidence:

- Focused backend suite:
  `python -m pytest plane/tests/unit/utils/test_issue_embeddings.py
plane/tests/contract/app/test_duplicate_check_api.py
plane/tests/contract/app/test_similar_issues_api.py --no-header --tb=short
-q` -> `19 passed, 14 warnings`, `TEST_EXIT:0`.
- Migration drift: `python manage.py makemigrations --check --dry-run` ->
  `No changes detected`, `MAKEMIGRATIONS_CHECK_EXIT:0`.
- Django system check: `python manage.py check` -> `DJANGO_CHECK_EXIT:0`.

Still open:

- Async embedding generation/backfill worker wiring and production provider
  configuration.
- Browser/manual smoke for issue-create and inbox-create duplicate override
  surfaces.

## 2026-06-23 Phase C Worker/Backfill Update

Status: Phase C now includes the worker/backfill foundation needed to populate
stored issue embeddings for semantic retrieval. The implementation is provider
safe: disabled installs and providerless installs return structured no-op
results instead of failing.

Added:

- `plane.bgtasks.issue_embedding_task.issue_embedding_task` for single-issue
  embedding refresh.
- `plane.bgtasks.issue_embedding_task.backfill_issue_embeddings` for bounded
  project/workspace/global backfill.
- `manage.py backfill_issue_embeddings` with inline default execution and
  `--queue` for Celery dispatch.
- Unit coverage for disabled, providerless, single-issue, and project-scoped
  backfill behavior.

Evidence:

- Focused worker suite: `11 passed`, `TEST_EXIT:0`.
- Combined semantic endpoint plus worker suite: `23 passed, 14 warnings`,
  `TEST_EXIT:0`.
- Disabled command smoke: `python manage.py backfill_issue_embeddings --limit 1`
  -> `{"processed":0,"ready":0,"skipped":0,"status":"disabled"}`,
  `COMMAND_EXIT:0`.
- Migration and system checks remained clean:
  `MAKEMIGRATIONS_CHECK_EXIT:0`, `DJANGO_CHECK_EXIT:0`.

Still open:

- Real provider configuration/secret wiring.
- Automatic issue create/update enqueue policy.
- Browser/manual duplicate override smoke for issue-create and inbox-create.

## 2026-06-23 Cloudflare Workers AI Embedding Provider Update

Decision: Cloudflare Workers AI is the selected provider for AI-E1 semantic
issue embeddings. The implementation uses the native Workers AI REST endpoint
for `@cf/baai/bge-base-en-v1.5`, not an OpenAI-compatible shim, so no new SDK
dependency is required.

Provider contract:

- Enable with `WORKSPACE_AI_EMBEDDINGS_ENABLED=1`.
- Keep `WORKSPACE_AI_EMBEDDING_PROVIDER=cloudflare`.
- Configure `WORKSPACE_AI_EMBEDDING_MODEL=@cf/baai/bge-base-en-v1.5`.
- Provide `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`.
- Optional `WORKSPACE_AI_EMBEDDING_POOLING` can pass Cloudflare's `mean` or
  `cls` pooling mode.

Evidence:

- Provider unit coverage now verifies missing Cloudflare config returns `None`,
  REST calls include the expected URL/header/payload/timeout, and empty
  Cloudflare responses raise a controlled error.
- Combined semantic endpoint, worker, and provider suite passed with
  `26 passed, 14 warnings`, `TEST_EXIT:0`.
- Migration/system checks remained clean:
  `MAKEMIGRATIONS_CHECK_EXIT:0`, `DJANGO_CHECK_EXIT:0`.

Still open:

- Add Cloudflare Workers AI support to the general Copilot/workflow LLM adapter
  if those flows should also leave Vertex AI.
- Live provider smoke with real Cloudflare credentials.
- Automatic issue create/update enqueue policy and browser/manual duplicate
  override smoke.

## 2026-06-23 Cloudflare GLM-5.2 LLM Provider Update

Decision: general AI text generation should use Cloudflare Workers AI
`@cf/zai-org/glm-5.2`. This closes the previous follow-up to move
Copilot/workflow LLM calls off the Vertex default at the code/config level.

Provider contract:

- `LLM_PROVIDER=cloudflare`
- `LLM_MODEL=@cf/zai-org/glm-5.2`
- `CLOUDFLARE_ACCOUNT_ID=<account id>`
- `CLOUDFLARE_API_TOKEN=<Workers AI token>`

Evidence:

- New Cloudflare LLM unit tests cover the native Workers AI REST call,
  chat-completion response extraction, empty-response errors, and Cloudflare
  env-token configuration checks.
- Focused Copilot/workflow/provider suite passed with `27 passed, 15 warnings`,
  `TEST_EXIT:0`.
- Migration and Django system checks remained clean:
  `MAKEMIGRATIONS_CHECK_EXIT:0`, `DJANGO_CHECK_EXIT:0`.

Still open:

- Live GLM-5.2 smoke with real Cloudflare credentials.
- Automatic issue create/update embedding enqueue policy.
- Browser/manual duplicate override smoke for issue-create and inbox-create.

## 2026-06-23 Automatic Embedding Enqueue Update

Status: automatic issue create/update embedding enqueue policy is now
implemented. When embeddings are enabled, issue saves schedule the single-issue
embedding task after transaction commit. Disabled installs remain no-op.

Verified behavior:

- Disabled `WORKSPACE_AI_EMBEDDINGS_ENABLED` does not enqueue.
- Enabled issue create enqueues the saved issue ID after commit.
- Enabled issue update enqueues a refresh for the updated issue ID.
- Archived issue saves do not enqueue.

Evidence:

- Focused signal/task suite passed with `18 passed`, `TEST_EXIT:0`.
- Combined AI backend suite passed with `47 passed, 29 warnings`,
  `TEST_EXIT:0`.
- Migration and Django system checks stayed clean:
  `MAKEMIGRATIONS_CHECK_EXIT:0`, `DJANGO_CHECK_EXIT:0`.

Still open:

- Live Cloudflare GLM-5.2 smoke with real credentials.
- Browser/manual duplicate override smoke for issue-create and inbox-create.

## 2026-06-23 Cloudflare GLM-5.2 Smoke Helper Update

Status: live credential smoke is verified, and the Cloudflare package has a
tested smoke helper for GLM-5.2 evidence capture.

Command:

```bash
CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... \
  node apps/cloudflare/tools/workers-ai-smoke.mjs --json --out <report.json>
```

Evidence:

- No-credential local run returned a safe failing report without exposing
  secrets: `WORKERS_AI_SMOKE_EXIT:1`.
- Cloudflare package tests passed with `26` files / `220` tests and
  `WORKERS_AI_TEST_EXIT:0`.
- Cloudflare TypeScript check passed with `CLOUDFLARE_CHECK_EXIT:0`.

Still open:

- Run the helper with real Cloudflare credentials.
- Browser/manual duplicate override smoke for issue-create and inbox-create.

## 2026-06-23 Cloudflare Workers AI Live Smoke Update

Status: verified. The selected text-generation model
`@cf/zai-org/glm-5.2` responded successfully through Cloudflare Workers AI.

Evidence:

```bash
node apps/cloudflare/tools/workers-ai-smoke.mjs --json \
  --out process/general-plans/reports/cloudflare-workers-ai-smoke-2026-06-23.json
```

- `WORKERS_AI_SMOKE_EXIT:0`
- Report: `process/general-plans/reports/cloudflare-workers-ai-smoke-2026-06-23.json`
- Report summary: `ok:true`, `checks[1].status:200`,
  `checks[1].response_excerpt:"Cloudflare Workers AI is reachable for Manut."`

This closes the credential-gated Cloudflare GLM live-smoke item. The AI plan
remains active for the manual browser duplicate-flow smoke gate.
