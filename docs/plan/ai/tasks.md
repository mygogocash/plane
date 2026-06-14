# Plane AI (Ask/Build modes, Connectors, semantic actions) — Tasks (Claude Code subagent cards)

> Source of truth: [PRD](../../prd-ai-2026-06-07.md), [epics.md](./epics.md), [stories.md](./stories.md), [design.md](./design.md). Stable ID prefix: **AI**. Tasks are `AI-T#` and cross-reference epics (`AI-E#`) and stories (`AI-S#`).

## How to assign

- **One task per subagent.** Hand each `AI-T#` card to a single Claude Code subagent via the Agent/Workflow tool. Each card is **self-contained** — the executing subagent has no memory of this planning conversation, so every path, pattern, and reference it needs is inline.
- **Worktree isolation.** A card marked `Worktree isolation: yes` edits a file another parallel task also edits (e.g. `apps/api/plane/app/urls/external.py`, `apps/web/core/services/ai.service.ts`, `@plane/types`, `@plane/constants`, `db/models/integration/__init__.py`). Run those in separate git worktrees and merge sequentially, or serialize them. Cards marked `no` touch only new files and can run fully parallel.
- **Dependency order.** Follow the graph in the final section. Backend models/migrations precede their APIs; APIs precede their frontend. Do not start a card until its `Depends on` cards are merged (a soft-dep is noted where a minimal stub lets it proceed early).
- **TDD is mandatory.** Every implementation card names the failing test to write FIRST (RED), then minimum code (GREEN), then refactor. Commit only at green. Show the red run and the green run.

## Shared context every backend subagent needs (read before starting any backend card)

- **Repo layout:** Backend = Django/DRF under `apps/api/plane/{db,app,api}`. Frontend = React Router 7 + MobX under `apps/web/{core,ce}`. Shared packages = `@plane/{types,services,ui,constants,propel}` under `packages/`.
- **Model base classes** (`apps/api/plane/db/models/base.py`, `apps/api/plane/db/models/project.py`):
  - `BaseModel`: `id` (UUID PK), `created_by`/`updated_by` (FK to User), `created_at`, `updated_at`, `deleted_at` (soft-delete). Audit fields via the AuditModel mixin.
  - `ProjectBaseModel(BaseModel)`: adds `workspace` FK and `project` FK, auto-set in `save()`. Soft-delete handled with `deleted_at__isnull` constraints. **All new project-scoped models extend `ProjectBaseModel`.** Workspace-wide models (rules, agents) extend the workspace-scoped base used by siblings (look at an existing workspace-level model, e.g. `WorkspaceMember`, for the exact mixin name — verify, do not assume).
- **Copilot core to extend, not fork** (`apps/api/plane/app/views/copilot.py`): `CopilotMessagesEndpoint` at route `workspaces/<slug>/copilot/messages/`. `COPILOT_MODES` is defined near line 37 (`answer`, `draft_subtasks`, `command`, `auto`). Guest write-gating around line 83 (`WRITE_MODES`). Project-context permission helper `_has_project_context_permission` near line 98. Evidence retrieval helper `retrieve_copilot_evidence` does `icontains` keyword search over issues/projects/pages/comments.
- **LLM seam** (`apps/api/plane/app/views/external/base.py`): `get_llm_config()` returns `(api_key, model, provider)`; `is_llm_configured(api_key, model, provider)` returns bool; `call_vertex_copilot_llm(...)` near line 489 dispatches by provider. **Always call `is_llm_configured` first; return HTTP 400 `{"error": "LLM provider API key and model are required"}` (mirrors copilot.py ~line 92) when false.** In tests, mock at this seam — never call a real provider.
- **Permission decorator:** `@allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")` (import from the same module copilot.py uses). Guest write-gating checks `workspace_role == ROLE.GUEST.value`. ADMIN-only endpoints pass `[ROLE.ADMIN]`.
- **URL registration:** Session routes in `apps/api/plane/app/urls/external.py` (style `workspaces/<str:slug>/…`). API-key routes (`/api/v1/`) under `apps/api/plane/api/`.
- **Async work:** Celery. App config `apps/api/plane/celery_app.py`; tasks live in `apps/api/plane/bgtasks/`. Spawn in the request handler with `.delay(...)` and return immediately.
- **Tests:** pytest under `apps/api/plane/tests/`. Run via the Docker test stack: `docker compose -f docker-compose-test.yml run --rm api-tests pytest <path>`. Mark contract tests with `@pytest.mark.contract` where the suite uses markers (verify the marker convention in an existing test file before relying on it).
- **Migration discipline:** Each new model in its own focused migration. Forward + reverse both reviewed; reverse migrations only drop new tables and never alter `IntakeIssue`, `SlackProjectSync`, `Page`, or Copilot tables. `CREATE EXTENSION vector` must be idempotent and rollback-guarded. Never edit an already-applied migration.
- **Secrets:** Webhook secrets use `SecretField` (encrypted) and Secret Manager / K8s secrets — never plaintext columns with committed values, never logged.

## Shared context every frontend subagent needs (read before starting any web card)

- **Existing assets to reuse (verified in design.md):**
  - `CopilotPanel` — `apps/web/core/components/copilot/panel.tsx` (modal portal, mode state, draft list, conversation history, `errorMessage` row, `setToast`/`TOAST_TYPE`, `isApplying` pattern).
  - `AIService` — `apps/web/core/services/ai.service.ts` (extends `APIService`; has `sendCopilotMessage`, `listCopilotConversations`, `performEditorTask`, `createGptTask`). `TCopilotMode` union at line ~27 (`answer`/`draft_subtasks`/`command`/`auto`).
  - Editor AI menu — `apps/web/ce/components/pages/editor/ai/menu.tsx` (Ask Pi, tone scoring).
  - AI editor task enum + thinking copy — `apps/web/core/constants/ai.ts` (`AI_EDITOR_TASKS`, `AI_THINKING_MESSAGES`, `getAIThinkingMessage`).
  - Integrations settings — `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/(workspace)/integrations/page.tsx` (GitHub/GitLab cards via `SingleIntegrationCard`; ADMIN guard → `NotAuthorizedView`).
  - Sidebar nav registry — `packages/constants/src/workspace.ts`; gating render — `apps/web/core/components/workspace/sidebar/sidebar-menu-items.tsx`.
  - Home widgets — `apps/web/core/components/home/home-dashboard-widgets.tsx`.
  - Issue create modal — `apps/web/core/components/issues/issue-modal/form.tsx` (+ `components/title-input.tsx`, `description-editor.tsx`).
  - Route registration — `apps/web/app/routes/core.ts` (settings block ~255–350) and `apps/web/app/routes/extended.ts`.
  - Root store — `apps/web/core/store/root.store.ts`; access via `useStore()`.
- **Gating order (every AI surface):** check `isSelfHostedFeatureEnabled(flag)` first (`apps/web/ce/lib/self-host-entitlements.ts`; hide if off), then `useInstance().config?.has_llm_configured` (disable + "Connect an AI provider in instance settings" hint if off). **Never a paywall, never a fake control.** Flags: AI generation → `ai_copilot`; connectors/MCP → `integrations`; rules/agents → `workflows_approvals`; intake queue surface → `intake`.
- **New components live under `apps/web/core/components/ai/` with subdirs** (`shared/`, `build-mode/`, `chat/`, `summaries/`, `ask-plane-widget/`) per PRD open-question Q20.
- **New MobX store:** `apps/web/core/store/ai/copilot.store.ts` (`AICopilotStore`), composed onto `root.store.ts`, surfaced via `useStore()`. PRD calls it `aiCopilotStore`.
- **Tests:** Vitest + React Testing Library. Run via `pnpm --filter web exec vitest run <path>`. Type check via `pnpm turbo run check:types --filter=web`.

---

## AI-T1 — `IssueEmbedding` model + pgvector extension migration

- **Implements**: AI-E1 / AI-S1, AI-S2 (schema foundation).
- **Depends on**: none.
- **Risk tier**: R1 (adds the pgvector extension to a shared multi-tenant DB; costly to reverse). Migration reverse-review required pre-deploy.
- **Worktree isolation**: no (new model file + new migration only).
- **Context**: Ask Mode currently retrieves evidence by keyword `icontains`. To rank by meaning, we need an optional embedding store. This card creates only the model and migration — it does NOT change retrieval (AI-T6 does). The keyword path must remain the silent fallback whenever embeddings are absent.
- **Files**:
  - Create `apps/api/plane/db/models/ai/__init__.py` (export `IssueEmbedding`).
  - Create `apps/api/plane/db/models/ai/embedding.py`.
  - Register the model export wherever `apps/api/plane/db/models/__init__.py` aggregates models (follow the existing pattern there).
  - Create a focused migration in `apps/api/plane/db/migrations/` (next sequential number).
- **TDD — write this failing test first**: `apps/api/plane/tests/db/test_issue_embedding_model.py`
  - `test_issue_embedding_extends_project_base_and_is_1to1_with_issue` — asserts an `IssueEmbedding` instance has `workspace`, `project`, `issue` (OneToOne), `content_hash`, `model_name`, `embedding`, and soft-delete `deleted_at`; creating a second embedding for the same issue raises `IntegrityError`.
  - `test_migration_creates_vector_extension_idempotently` — applying the migration twice (or with the extension pre-existing) does not error.
- **Implementation outline**:
  1. `IssueEmbedding(ProjectBaseModel)` with `issue = OneToOneField(Issue, ...)`, `content_hash = CharField`, `embedding = VectorField(dim=...)` (use `pgvector.django.VectorField`; pick the dim from a named constant, default 768 — document that 1536 is the alternative for newer embedding models), `model_name = CharField`, `updated_at` (inherited). Add `unique_together`/soft-delete constraints matching siblings.
  2. In the migration: first operation `CREATE EXTENSION IF NOT EXISTS vector` wrapped in a `migrations.RunSQL` with a reverse SQL that is guarded (only `DROP EXTENSION vector` if no other table depends on it — prefer a no-op reverse with a comment, since dropping a shared extension is unsafe). Then create the `issue_embeddings` table.
  3. Reverse migration drops `issue_embeddings`; extension drop is a guarded no-op.
- **Acceptance criteria**:
  - Given the migration runs, When applied a second time, Then `CREATE EXTENSION IF NOT EXISTS vector` is idempotent and does not fail.
  - Given an issue already has an embedding, When a second `IssueEmbedding` for the same issue is created, Then an `IntegrityError` is raised (1:1 enforced).
  - Given the reverse migration runs, When it executes, Then `issue_embeddings` is dropped and no other table loses the `vector` extension.
- **Verify**:
  - `docker compose -f docker-compose-test.yml run --rm api-tests pytest apps/api/plane/tests/db/test_issue_embedding_model.py`
  - `docker compose -f docker-compose-test.yml run --rm api-tests python manage.py makemigrations --check --dry-run` (no uncommitted model drift)
- **Done when**: model + migration land green; forward and reverse migrations both run clean on the Docker test stack; keyword retrieval is untouched.

---

## AI-T2 — Lazy embedding (re)generation Celery task on issue write

- **Implements**: AI-E1 / AI-S2.
- **Depends on**: AI-T1.
- **Risk tier**: R1 (background write; fail-closed when no provider).
- **Worktree isolation**: no (new bgtask file + a signal/hook registration; if the issue-save hook lives in a shared file, isolate that one edit).
- **Context**: Embeddings must stay fresh without a GPU or mandatory backfill. When an issue's `name`+`description_html` change (new `content_hash`), enqueue an upsert. When the provider is unconfigured or errors, the issue save must still succeed and the prior embedding must remain intact.
- **Files**:
  - Create `apps/api/plane/bgtasks/issue_embedding_task.py`.
  - Hook enqueue on issue save (post_save signal or the existing issue update view path — verify which the fork uses for derived-data updates; prefer the same mechanism existing notification/activity tasks use).
- **TDD — write this failing test first**: `apps/api/plane/tests/bgtasks/test_issue_embedding_task.py`
  - `test_content_change_enqueues_embedding_upsert` — saving an issue with changed name/description (new hash) enqueues the task; the stored row has the new `content_hash` + `model_name`.
  - `test_no_content_change_skips_regeneration` — saving with identical content (same hash) enqueues nothing.
  - `test_no_provider_skips_silently_and_save_succeeds` — with `is_llm_configured` mocked False, the save succeeds and no embedding is written.
  - `test_provider_5xx_leaves_prior_embedding_intact` — provider error mid-task leaves the prior row unchanged; failure logged without secrets.
- **Implementation outline**:
  1. Compute `content_hash` (e.g. SHA-256 of `issue.name + "\n" + issue.description_html`; pick one and document it — open question Q1 default).
  2. Task calls the configured provider's embedding endpoint via the `get_llm_config` seam; mock that seam in tests. Guard with `is_llm_configured` → silent skip.
  3. Upsert the `IssueEmbedding` only on success (atomic; never partial write).
  4. Enqueue from the save hook only when the hash differs from the stored row.
- **Acceptance criteria**:
  - Given embeddings enabled and content changed, When an issue is saved, Then an upsert is enqueued and stored with the new hash + model name.
  - Given no content change, When saved, Then no regeneration is enqueued.
  - Given no provider, When saved, Then the save succeeds and embedding generation is silently skipped.
  - Given a provider 5xx mid-task, When the task runs, Then the prior embedding row is intact and the failure is logged without secrets.
- **Verify**: `docker compose -f docker-compose-test.yml run --rm api-tests pytest apps/api/plane/tests/bgtasks/test_issue_embedding_task.py`
- **Done when**: all four scenarios green; issue save latency unaffected (enqueue is async); no secrets in logs.

---

## AI-T3 — `AISummary` model + migration

- **Implements**: AI-E3 / AI-S6, AI-S7 (schema foundation).
- **Depends on**: none.
- **Risk tier**: R1 (new schema backing a token-gated public read surface).
- **Worktree isolation**: no (new model + migration only).
- **Context**: One-Click Summaries persist an optional shareable digest. This card creates only the model + migration; the endpoints (AI-T10/AI-T11) and shared-read leakage tests come later.
- **Files**:
  - Create `apps/api/plane/db/models/ai/summary.py`.
  - Export from `apps/api/plane/db/models/ai/__init__.py` and the models aggregator.
  - Focused migration in `apps/api/plane/db/migrations/`.
- **TDD — write this failing test first**: `apps/api/plane/tests/db/test_ai_summary_model.py`
  - `test_ai_summary_fields_and_entity_type_choices` — asserts `entity_type` in {cycle, project, initiative}, `entity_id`, `markdown`, `rollup` (JSON), nullable+indexed `share_token`, `generated_by`, nullable `project` (for initiative scope), `workspace` required.
  - `test_share_token_index_exists` — the migration creates an index on `share_token`.
- **Implementation outline**:
  1. `AISummary(ProjectBaseModel)` with `project` made nullable (override) for initiative scope; `entity_type = CharField(choices=...)` from a named choices class; `entity_id = UUIDField`; `markdown = TextField`; `rollup = JSONField(default=dict)`; `share_token = CharField(null=True, db_index=True)`; `generated_by` FK to User.
  2. Migration creates `ai_summaries` + the `share_token` index. Reverse drops the table.
- **Acceptance criteria**:
  - Given the model, When an `AISummary` is created with `entity_type` outside the choice set, Then validation rejects it.
  - Given the migration, When applied, Then `ai_summaries` exists with a `share_token` index; reverse drops the table cleanly.
- **Verify**: `docker compose -f docker-compose-test.yml run --rm api-tests pytest apps/api/plane/tests/db/test_ai_summary_model.py`
- **Done when**: model + migration green forward and reverse.

---

## AI-T4 — `AutomationRule` + `AutomationRun` + `AuditLog` models & migrations

- **Implements**: AI-E6 / AI-S12, AI-S13 (schema + audit foundation reused by E5/E7/E8/E9).
- **Depends on**: none.
- **Risk tier**: R1 (foundational for the automation engine; audit is a critical path).
- **Worktree isolation**: no (new model files + migrations; models aggregator edit is small — coordinate if other model-adding cards run concurrently).
- **Context**: The rule engine and every downstream mutating AI feature (build apply, triage apply, agent runs, connector mutations) must write an immutable audit entry. This card establishes both the rule/run tables and the shared `AuditLog`. **First check whether an audit model already exists** in `apps/api/plane/db/models/` (the grounding references a possible `audit.py`); if present, reuse it and skip creating a new one — only add the automation tables.
- **Files**:
  - Create `apps/api/plane/db/models/automation/__init__.py` + `apps/api/plane/db/models/automation/rule.py`.
  - Create or reuse `apps/api/plane/db/models/audit.py` (`AuditLog`).
  - Export from the models aggregator.
  - Focused migrations (one per logical table group; rule + run can share one migration, audit its own).
- **TDD — write this failing test first**: `apps/api/plane/tests/db/test_automation_models.py`
  - `test_automation_rule_fields_and_workspace_scope` — `name`, `is_active`, `trigger` (choice), `conditions` JSON, `actions` JSON, `project` nullable (=workspace-wide), `created_by`; workspace required.
  - `test_automation_run_links_rule_and_records_status` — `rule` FK, `triggered_by_event`, `status` in {success, partial, failed}, `actions_applied` JSON, nullable `error`, entity ref fields.
  - `test_dispatch_index_present` — migration creates an index on `(workspace, is_active, trigger)`.
  - `test_audit_log_is_append_only_shape` — `AuditLog` has `workspace`, `user`, `action` (str), `entity_type`, `entity_id`, `changes` (JSON), `created_at`; assert it has no soft-delete update path that mutates `action`/`changes` (immutability by convention — document it).
- **Implementation outline**:
  1. `AutomationRule` extends the workspace-scoped base (verify mixin name from an existing workspace-level model); `project` nullable.
  2. `AutomationRun(rule FK, ...)`.
  3. `AuditLog` immutable append-only.
  4. Migrations: rule+run with the dispatch index; audit table. Reverse drops `AutomationRun` then `AutomationRule`; audit table drop guarded if reused.
- **Acceptance criteria**:
  - Given the models, When a workspace-wide rule (null project) is created, Then it persists scoped to the workspace.
  - Given the migration, When applied, Then the `(workspace, is_active, trigger)` index exists; reverse drops run then rule.
  - Given an `AuditLog` row, When inspected, Then it carries workspace/user/action/entity/changes/created_at and is treated as append-only.
- **Verify**: `docker compose -f docker-compose-test.yml run --rm api-tests pytest apps/api/plane/tests/db/test_automation_models.py`
- **Done when**: models + migrations green forward and reverse; audit reused if it already existed (note which in the PR).

---

## AI-T5 — `AutomationAgent` + `AgentMention`, `TriageSuggestion`, `SentryProjectSync`, `SlackChannelBinding` models & migrations

- **Implements**: AI-E8 / AI-S16, AI-S17; AI-E7 / AI-S14; AI-E9 / AI-S18, AI-S20 (schema foundations only).
- **Depends on**: AI-T4 (agents reference the audit + action layer conceptually; schema can land independently).
- **Risk tier**: R1 (new schema, including encrypted secret fields and a case-insensitive unique constraint).
- **Worktree isolation**: yes — edits `apps/api/plane/db/models/integration/__init__.py` (shared registration point) and `apps/api/plane/db/models/intake.py` (extend with a new table). Isolate or serialize against any other card touching those files.
- **Context**: This card batches the remaining additive model foundations so downstream API/worker cards have their tables. Each table is additive; reverse drops only the new table and never alters `IntakeIssue`, `SlackProjectSync`, or comment/issue models.
- **Files**:
  - Create `apps/api/plane/db/models/automation/agent.py` (`AutomationAgent`, `AgentMention`).
  - Extend `apps/api/plane/db/models/intake.py` with `TriageSuggestion` (new table; do NOT modify `IntakeIssue` fields/choices).
  - Create `apps/api/plane/db/models/integration/sentry.py` (`SentryProjectSync`).
  - Extend `apps/api/plane/db/models/integration/slack.py` with `SlackChannelBinding`.
  - Register all in `apps/api/plane/db/models/integration/__init__.py` and the models aggregator.
  - One focused migration per model group.
- **TDD — write this failing test first**: `apps/api/plane/tests/db/test_ai_foundation_models.py`
  - `test_automation_agent_unique_name_case_insensitive` — two agents with same name differing only in case in one workspace → `IntegrityError`/validation error (unique `(workspace, lower(name))`).
  - `test_agent_scope_choices` — `scope` in {read_only, write}; `allowed_actions` JSON; `is_active`.
  - `test_triage_suggestion_1to1_with_intake_issue` — 1:1 with `IntakeIssue`; fields `suggested_labels` JSON, nullable `suggested_assignee` FK, `suggested_priority`, nullable `suggested_project` FK, `confidence` float, `status` in {pending, applied, rejected}.
  - `test_sentry_sync_secret_is_secretfield` — `webhook_secret` is a `SecretField` (encrypted), `severity_map` JSON, nullable `default_assignee`; assert the secret column does not store/return plaintext on read.
  - `test_slack_channel_binding_fields` — `slack_project_sync` FK, `channel_id`, `direction` in {inbound, outbound}, nullable `schedule` (cron string), `kind` in {request, summary, alert}.
  - `test_reverse_migrations_leave_intake_and_slack_intact` — after reverse, `IntakeIssue` and `SlackProjectSync` tables/columns unchanged.
- **Implementation outline**:
  1. `AutomationAgent` (workspace-scoped base) with a functional unique index on `(workspace, Lower("name"))` (Django `UniqueConstraint(Lower("name"), "workspace", ...)`).
  2. `AgentMention(agent FK, source_type, source_id, status, response nullable)`.
  3. `TriageSuggestion` extends `ProjectBaseModel`, 1:1 `intake_issue`.
  4. `SentryProjectSync` mirrors `SlackProjectSync` shape; `webhook_secret = SecretField`.
  5. `SlackChannelBinding(slack_project_sync FK, ...)`.
  6. Migrations: one per group. Reverse drops `AgentMention`→`AutomationAgent`, drops `TriageSuggestion`, drops `SentryProjectSync`, drops `SlackChannelBinding` — leaving `IntakeIssue`/`SlackProjectSync` intact.
- **Acceptance criteria**:
  - Given an agent named "Triage", When another "triage" is created in the same workspace, Then it is rejected (case-insensitive uniqueness).
  - Given a `read_only` scope value, When stored, Then it is one of the allowed choices.
  - Given `TriageSuggestion`, When a second is created for the same `IntakeIssue`, Then `IntegrityError` (1:1).
  - Given `SentryProjectSync.webhook_secret`, When read back, Then plaintext is never exposed.
  - Given reverse migrations, When run, Then `IntakeIssue` and `SlackProjectSync` are untouched.
- **Verify**: `docker compose -f docker-compose-test.yml run --rm api-tests pytest apps/api/plane/tests/db/test_ai_foundation_models.py`
- **Done when**: all models + migrations green forward and reverse; secret field encrypted; existing intake/slack schema intact.

---

## AI-T6 — Semantic evidence ranking with silent keyword fallback (`retrieve_copilot_evidence`)

- **Implements**: AI-E1 / AI-S1.
- **Depends on**: AI-T1 (model), AI-T2 (embeddings populated — soft; ranking works on whatever rows exist).
- **Risk tier**: R1 (changes a core retrieval path; must be invisible when embeddings absent).
- **Worktree isolation**: yes — edits `apps/api/plane/app/views/copilot.py` (shared with AI-T9 build mode, AI-T7 context-assist). Serialize copilot.py edits.
- **Context**: When `WORKSPACE_AI_EMBEDDINGS_ENABLED` is set and embeddings exist, rank evidence by cosine similarity over `IssueEmbedding` (filtered by workspace — multi-tenant isolation). Otherwise the existing `icontains` keyword path runs unchanged. Tag the response `retrieval=relevance` vs `retrieval=keyword`.
- **Files**: modify `apps/api/plane/app/views/copilot.py` (`retrieve_copilot_evidence` and the response envelope to add a `retrieval` tag).
- **TDD — write this failing test first**: `apps/api/plane/tests/app/test_copilot_semantic_retrieval.py`
  - `test_ranks_by_cosine_when_embeddings_present` — with `WORKSPACE_AI_EMBEDDINGS_ENABLED` true and embeddings seeded, evidence ordering follows cosine similarity and response has `retrieval == "relevance"`.
  - `test_falls_back_to_keyword_when_no_embeddings` — no embeddings → `icontains` path runs, `retrieval == "keyword"`, output identical to pre-change behavior.
  - `test_stale_content_hash_falls_back` — embeddings exist but every candidate hash is stale → keyword fallback.
  - `test_query_filters_by_workspace` — embeddings from workspace B are never returned for a workspace-A query (multi-tenant isolation).
  - `test_guest_without_membership_rejected_before_retrieval` — 403 before any retrieval runs.
- **Implementation outline**:
  1. Gate on `WORKSPACE_AI_EMBEDDINGS_ENABLED` (env/settings) AND presence of fresh embeddings (matching `content_hash`).
  2. Cosine query via pgvector ordering, `filter(workspace=...)` always applied.
  3. On any miss (flag off, no rows, all stale), call the unchanged keyword helper.
  4. Add `retrieval` field to the response envelope.
- **Acceptance criteria**: per the four AI-S1 ACs in stories.md (relevance ranking + tag; silent keyword fallback + tag; guest 403 pre-retrieval; zero-issue workspace returns empty-evidence without crash).
- **Verify**: `docker compose -f docker-compose-test.yml run --rm api-tests pytest apps/api/plane/tests/app/test_copilot_semantic_retrieval.py`
- **Done when**: all five green; keyword output byte-identical when embeddings off; workspace isolation proven by test.

---

## AI-T7 — `context-assist` endpoint

- **Implements**: AI-E1 / AI-S3.
- **Depends on**: AI-T6 (shares copilot.py + LLM seam) — soft; can land independently if copilot.py edits are serialized.
- **Risk tier**: R1 (new route reading entity data; must be membership-scoped and fail-closed).
- **Worktree isolation**: yes — adds a route in `apps/api/plane/app/urls/external.py` and likely a handler in `copilot.py`. Serialize against AI-T6/AI-T9.
- **Context**: Zero-setup, one-keystroke assist returns blockers / at-risk / recent-changes / suggested-follow-ups for the entity the user is viewing, with no prior conversation. Q15 default: derive `entity_type`/`entity_id` from the request body; if absent (list/view), return a general assist with no context rather than guessing.
- **Files**: add handler `CopilotContextAssistEndpoint` (in `copilot.py` or a new `apps/api/plane/app/views/copilot_context.py`), register `POST workspaces/<slug>/copilot/context-assist/` in `external.py`.
- **TDD — write this failing test first**: `apps/api/plane/tests/app/test_context_assist.py`
  - `test_returns_blockers_at_risk_recent_for_entity` — member on issue/cycle/project gets `blockers[]`, `at_risk[]`, `recent_changes[]`, `suggested_follow_ups[]` scoped to that entity.
  - `test_guest_without_project_membership_403`.
  - `test_cross_workspace_entity_rejected` — entity in another workspace → 404/403, no leak.
  - `test_empty_entity_returns_empty_lists` — entity with nothing to flag → each list empty (panel shows "nothing to flag").
  - `test_no_provider_returns_400` — `is_llm_configured` False → 400 `LLM provider … required`.
- **Implementation outline**: validate body with `serializers.Serializer`; resolve membership via `_has_project_context_permission`; gather blockers/at-risk/recent from existing issue/cycle relations; pass to LLM seam for follow-ups; fail closed 400.
- **Acceptance criteria**: per AI-S3 ACs (entity-scoped lists; guest 403; cross-workspace reject; empty lists) + fail-closed 400.
- **Verify**: `docker compose -f docker-compose-test.yml run --rm api-tests pytest apps/api/plane/tests/app/test_context_assist.py`
- **Done when**: all five green; never leaks cross-workspace data; 400 when no provider.

---

## AI-T8 — Duplicate-check endpoint

- **Implements**: AI-E2 / AI-S4, AI-S5 (server side).
- **Depends on**: AI-T6 (reuses embedding similarity; degrades to keyword) — soft.
- **Risk tier**: R2 endpoint; the high-confidence boundary is R0 individually (must have boundary tests).
- **Worktree isolation**: yes — registers a route in `external.py`. Serialize external.py edits.
- **Context**: `POST workspaces/<slug>/projects/<project_id>/issues/duplicate-check/` accepts `{title, description, project_id}` and returns ranked `candidates[] {issue_id, score, matched_on[]}` plus `high_confidence`. `score >= DUPLICATE_BLOCK_THRESHOLD` → `high_confidence=true`. Empty backlog → empty candidates, never blocks. Rate-limit (fires on keystroke). Candidates restricted to issues the user may view in the target project. `DUPLICATE_BLOCK_THRESHOLD` is a named constant.
- **Files**: new handler `apps/api/plane/app/views/duplicate_check.py` (or in copilot.py family), route in `external.py`, constant in a settings/constants module.
- **TDD — write this failing test first**: `apps/api/plane/tests/app/test_duplicate_check.py`
  - `test_high_confidence_at_threshold_boundary` — a candidate at exactly `DUPLICATE_BLOCK_THRESHOLD` → `high_confidence=true`; just below → suggestions only, `high_confidence=false`.
  - `test_candidates_scoped_to_target_project_and_viewable` — never returns issues from other projects/workspaces or non-viewable issues.
  - `test_empty_backlog_returns_empty_never_blocks` — empty project → `candidates=[]`, `high_confidence=false`.
  - `test_empty_or_whitespace_title_and_description_short_circuits` — no query executed, empty candidates, no error.
  - `test_guest_without_project_membership_403`.
  - `test_no_provider_degrades_to_keyword_not_500` — provider off → keyword scoring still returns (or clean disabled response per PRD; assert no 500).
- **Implementation outline**: `serializers.Serializer` validation; reuse the AI-T6 similarity helper when present else keyword; throttle class on the view; named threshold constant.
- **Acceptance criteria**: per AI-S4/AI-S5 ACs including the threshold boundary and empty-backlog.
- **Verify**: `docker compose -f docker-compose-test.yml run --rm api-tests pytest apps/api/plane/tests/app/test_duplicate_check.py`
- **Done when**: boundary, scoping, empty, whitespace, authz, and no-500 cases all green; threshold is a named constant.

---

## AI-T9 — `build_project` Copilot mode + transactional apply endpoint

- **Implements**: AI-E5 / AI-S10, AI-S11.
- **Depends on**: AI-T4 (audit infra — soft; land with a minimal audit write and replace when AI-T4 merges).
- **Risk tier**: R1; the build-apply transaction is **R0 individually** — must land with full rollback/idempotency/graceful-skip coverage before deploy.
- **Worktree isolation**: yes — edits `apps/api/plane/app/views/copilot.py` (`COPILOT_MODES`, `WRITE_MODES`) and adds a route in `external.py`. Serialize against AI-T6/AI-T7.
- **Context**: `mode=build_project` returns a non-persisted editable `project_draft {name, description, work_items[]{name, description, estimate, priority, labels[], assignee_suggestion}, suggested_cycle}`. A separate apply endpoint persists an approved/edited draft transactionally (project → issues → cycle membership). Missing label/state/member → create-or-skip with per-item warning, never fail whole apply. Invalid/unset `default_state` → skip state assignment with warning (Q7). Concurrent apply of the same draft token → idempotent no-op. LLM quota mid-generation → 503 with retry hint; partial drafts never persisted. Apply requires ≥ MEMBER; guests blocked (extend `WRITE_MODES`).
- **Files**: modify `copilot.py` (add `build_project` to `COPILOT_MODES` + `WRITE_MODES`; synthesis handler); new apply handler `apps/api/plane/app/views/build_project_apply.py`; route `POST workspaces/<slug>/projects/<project_id>/build-project/apply/` in `external.py`.
- **TDD — write this failing test first**: `apps/api/plane/tests/app/test_build_project.py`
  - `test_build_project_returns_editable_draft_not_persisted` — synthesis returns `project_draft`; nothing in DB.
  - `test_apply_persists_project_issues_cycle_in_one_transaction` — returns new IDs; all three persisted.
  - `test_apply_missing_label_or_assignee_create_or_skip_with_warning` — missing reference → item create-or-skipped, per-item warning, apply still succeeds.
  - `test_apply_mid_failure_rolls_back_fully` — inject failure after some issues → zero partial rows.
  - `test_concurrent_apply_same_draft_token_idempotent` — second apply is a no-op (no duplicate project/issues).
  - `test_guest_build_project_rejected` and `test_apply_requires_member`.
  - `test_no_provider_400_on_build` and `test_quota_503_no_partial_persist`.
  - `test_apply_writes_audit_entry`.
- **Implementation outline**: synthesis through the LLM seam; apply wrapped in `transaction.atomic()`; idempotency keyed on a draft token stored/checked at apply; graceful create-or-skip with a `warnings[]` array in the response; audit write per apply.
- **Acceptance criteria**: per AI-S10/AI-S11 ACs (editable draft, transactional apply, create-or-skip, rollback, idempotency, authz, fail-closed).
- **Verify**: `docker compose -f docker-compose-test.yml run --rm api-tests pytest apps/api/plane/tests/app/test_build_project.py`
- **Done when**: every R0 path (rollback, idempotency, graceful skip, guest reject, fail-closed) is green; partial drafts never persist.

---

## AI-T10 — Summarize endpoints (cycle / project / initiative)

- **Implements**: AI-E3 / AI-S6.
- **Depends on**: AI-T3 (model).
- **Risk tier**: R1 (LLM-backed reads + optional persist).
- **Worktree isolation**: yes — registers three routes in `external.py`. Serialize external.py edits.
- **Context**: `POST .../cycles/<id>/summarize/`, `.../projects/<id>/summarize/`, `.../initiatives/<id>/summarize/` return markdown + `rollup {percent_complete, blockers[], at_risk[]}` scoped to the entity. Empty entity → "no activity" markdown + zeroed rollup. Generating requires ≥ MEMBER. Sanitize AI markdown before any persist.
- **Files**: new handler module `apps/api/plane/app/views/ai_summary.py`; routes in `external.py`.
- **TDD — write this failing test first**: `apps/api/plane/tests/app/test_ai_summarize.py`
  - `test_cycle_summary_returns_markdown_and_rollup` — populated cycle → markdown + rollup with the three keys.
  - `test_project_and_initiative_summaries_scoped` — each scoped to its entity.
  - `test_empty_entity_returns_no_activity_zeroed_rollup`.
  - `test_guest_or_non_member_403`.
  - `test_no_provider_400`.
  - `test_generated_markdown_is_sanitized` — injected HTML in the LLM output is sanitized before return/persist.
- **Implementation outline**: shared summarizer that takes (entity_type, entity_id); compute rollup from existing relations; pass through LLM seam; sanitize markdown; persist optional (AI-T11 adds share). Require MEMBER.
- **Acceptance criteria**: per AI-S6 ACs + sanitization.
- **Verify**: `docker compose -f docker-compose-test.yml run --rm api-tests pytest apps/api/plane/tests/app/test_ai_summarize.py`
- **Done when**: three entity types green; empty case returns zeroed rollup; sanitization proven; fail-closed.

---

## AI-T11 — Persist + share summary via signed token; shared read endpoint

- **Implements**: AI-E3 / AI-S7.
- **Depends on**: AI-T10.
- **Risk tier**: R1; the shared-link leakage path is R0 individually (must have leakage tests).
- **Worktree isolation**: yes — registers a route in `external.py`. Serialize.
- **Context**: A "Copy share link" action persists an `AISummary` with a random, expiring `share_token`. `GET workspaces/<slug>/summaries/shared/<share_token>/` is unauthenticated-but-tokened and returns rollup markdown ONLY — never private item IDs or unsanitized content. Invalid/revoked/expired token → 404, leaks nothing. Share creation requires ≥ MEMBER.
- **Files**: extend `apps/api/plane/app/views/ai_summary.py` with share creation + a public read view; route in `external.py`.
- **TDD — write this failing test first**: `apps/api/plane/tests/app/test_ai_summary_share.py`
  - `test_member_creates_share_token` — share creation persists `AISummary` with a random token; link returned.
  - `test_shared_read_returns_rollup_markdown_only_no_private_ids` — response contains no private item IDs/unsanitized HTML.
  - `test_guest_cannot_create_share` — ≥ MEMBER required.
  - `test_invalid_revoked_expired_token_404` — returns 404, leaks nothing.
- **Implementation outline**: cryptographically random token + expiry timestamp; public view bypasses session auth but resolves only by token + expiry; response projects rollup markdown only.
- **Acceptance criteria**: per AI-S7 ACs (token persist, leakage-safe read, member-only create, 404 on bad token).
- **Verify**: `docker compose -f docker-compose-test.yml run --rm api-tests pytest apps/api/plane/tests/app/test_ai_summary_share.py`
- **Done when**: leakage test proves no private IDs; expired/invalid tokens 404; create gated to MEMBER.

---

## AI-T12 — `generate-brief` endpoint (issue → structured Page) + translate branch on `rephrase-grammar`

- **Implements**: AI-E4 / AI-S8, AI-S9 (server side).
- **Depends on**: none (reuses existing `Page` model + `rephrase-grammar` handler + LLM seam).
- **Risk tier**: R2; content-sanitization path is R0 individually (must have injection tests).
- **Worktree isolation**: yes if the rephrase handler shares a file with other edits; the brief endpoint is a new route in `external.py` (serialize external.py).
- **Context**: `POST .../issues/<id>/generate-brief/` creates a sectioned `Page` (Problem / Solution / Acceptance Criteria / Notes), links it to the issue (via `ProjectPage` M2M), returns `page_id`; regenerate produces a fresh draft without destroying the prior page (Q8 default). Separately, extend `POST workspaces/<slug>/rephrase-grammar/` with `task=translate` + `target_language` as a **branch in the existing handler — no new model** — without breaking casual/formal scoring. Empty selection / unsupported language → validation error, no destructive replace. Both require ≥ MEMBER + project membership; guests blocked; sanitize generated rich text before persist/render.
- **Files**: new `apps/api/plane/app/views/generate_brief.py` + route in `external.py`; modify the existing `rephrase-grammar` view to add a translate branch.
- **TDD — write this failing test first**: `apps/api/plane/tests/app/test_generate_brief_and_translate.py`
  - `test_generate_brief_creates_linked_sectioned_page` — sectioned Page created, linked to issue, `page_id` returned.
  - `test_brief_content_sanitized_before_persist` — injected HTML in LLM output is sanitized.
  - `test_regenerate_does_not_destroy_prior_page`.
  - `test_guest_generate_brief_403`.
  - `test_translate_branch_routes_through_rephrase_returns_translation`.
  - `test_translate_does_not_break_casual_formal_scoring` — existing casual/formal payload still works.
  - `test_empty_selection_or_blank_language_validation_error_no_replace`.
  - `test_guest_translate_rejected_via_write_modes`.
- **Implementation outline**: brief handler builds the sectioned prompt, sanitizes output (vetted sanitizer), creates Page + M2M link; regenerate creates a new draft. Translate branch: detect `task == "translate"`, require `target_language`, route the same LLM call with a translate prompt; preserve the existing casual/formal code path untouched.
- **Acceptance criteria**: per AI-S8/AI-S9 ACs (linked page, sanitization, regenerate-safe, guest 403, translate routes, casual/formal intact, empty/blank validation).
- **Verify**: `docker compose -f docker-compose-test.yml run --rm api-tests pytest apps/api/plane/tests/app/test_generate_brief_and_translate.py`
- **Done when**: brief + translate green; casual/formal regression test passes; sanitization proven; no new model added for translate.

---

## AI-T13 — Automation rule CRUD endpoints (ADMIN)

- **Implements**: AI-E6 / AI-S12.
- **Depends on**: AI-T4 (models).
- **Risk tier**: R1.
- **Worktree isolation**: yes — registers routes in `external.py`. Serialize.
- **Context**: `GET/POST/PATCH/DELETE workspaces/<slug>/automation/rules/` (+ `/<rule_id>/`), ADMIN only, gated by `workflows_approvals`. Reject rules with empty `actions[]` or an action not in the allowlist (reuse the copilot.py action allowlist concepts, e.g. `ISSUE_ACTION_FIELDS`). Scope all reads/writes to the caller's workspace.
- **Files**: new `apps/api/plane/app/views/automation_rule.py` + serializer; routes in `external.py`.
- **TDD — write this failing test first**: `apps/api/plane/tests/app/test_automation_rule_crud.py`
  - `test_admin_creates_workspace_or_project_scoped_rule` — null project = workspace-wide.
  - `test_non_admin_rule_crud_rejected` — member/guest → 403.
  - `test_rule_with_empty_actions_rejected` and `test_rule_with_non_allowlisted_action_rejected`.
  - `test_crud_scoped_to_caller_workspace` — cannot list/edit another workspace's rules.
- **Implementation outline**: DRF viewset following cycle.py/label.py CRUD pattern; `@allow_permission([ROLE.ADMIN])`; serializer validates trigger choice + non-empty allowlisted actions.
- **Acceptance criteria**: per AI-S12 ACs.
- **Verify**: `docker compose -f docker-compose-test.yml run --rm api-tests pytest apps/api/plane/tests/app/test_automation_rule_crud.py`
- **Done when**: CRUD green; ADMIN gating + allowlist validation enforced; workspace-scoped.

---

## AI-T14 — Rule evaluation worker + audit (loop-cap, idempotency)

- **Implements**: AI-E6 / AI-S13.
- **Depends on**: AI-T13 (rules exist), AI-T4 (audit).
- **Risk tier**: R1; loop-safety + audit write are **R0 individually** — must land with loop-cap/idempotency/audit tests.
- **Worktree isolation**: no (new bgtask + a lifecycle-signal hook; isolate the hook file if shared).
- **Context**: A Celery worker evaluates active rules on issue created/updated/mentioned/labeled signals, executes the allowlisted actions, and writes an `AutomationRun {status, actions_applied, entity ref}` + audit entry. Rule-loop safety: per-event execution depth cap + idempotency guard deduped on (rule_id, entity_id, event_type) within a window (Q3). Action failure → `status=partial|failed` with `error`, partial actions recorded, no secret leak. No-match → no action, recorded per configured audit granularity. The request handler enqueues and returns immediately.
- **Files**: `apps/api/plane/bgtasks/automation_rule_task.py`; lifecycle hook registration (reuse the same signal/path issue activity uses).
- **TDD — write this failing test first**: `apps/api/plane/tests/bgtasks/test_automation_rule_engine.py`
  - `test_matching_rule_executes_action_and_writes_run_and_audit`.
  - `test_no_match_records_outcome_no_action`.
  - `test_action_failure_sets_partial_or_failed_with_error_no_secret_leak`.
  - `test_loop_cap_and_idempotency_stops_self_retrigger` — rule whose action re-triggers itself is bounded and deduped on rule+entity+event.
  - `test_workspace_wide_rule_triggers_on_project_event_scoped_correctly` (Q12).
- **Implementation outline**: dispatch query uses the `(workspace, is_active, trigger)` index; depth counter passed through the event context; idempotency key persisted on `AutomationRun`; actions reuse the copilot allowlist executor; wrap each action in try/except → status + error.
- **Acceptance criteria**: per AI-S13 ACs (execute+audit, no-match record, partial/failed, loop-cap).
- **Verify**: `docker compose -f docker-compose-test.yml run --rm api-tests pytest apps/api/plane/tests/bgtasks/test_automation_rule_engine.py`
- **Done when**: loop-cap + idempotency + audit all green; no exception leaks secrets; dispatch uses the index.

---

## AI-T15 — Agent CRUD + read-only write-guardrail enforcement (ADMIN)

- **Implements**: AI-E8 / AI-S16.
- **Depends on**: AI-T5 (agent models), AI-T14 (action layer).
- **Risk tier**: R1; the `read_only` write-guardrail is **R0 individually** — must land with a server-side rejection test.
- **Worktree isolation**: yes — registers routes in `external.py`. Serialize.
- **Context**: `GET/POST/PATCH/DELETE workspaces/<slug>/automation/agents/` (+ `/<agent_id>/`), ADMIN only, gated by `workflows_approvals`. Name unique per workspace (case-insensitive). A `read_only` agent **physically cannot invoke a write action** — validated server-side in the action executor, not UI-only.
- **Files**: new `apps/api/plane/app/views/automation_agent.py` + serializer; routes in `external.py`; add a guardrail check in the shared action executor (from AI-T14).
- **TDD — write this failing test first**: `apps/api/plane/tests/app/test_automation_agent.py`
  - `test_admin_creates_agent_unique_name_case_insensitive`.
  - `test_read_only_agent_write_action_rejected_server_side` — read_only scope attempting a write action is rejected regardless of payload/UI.
  - `test_non_admin_agent_crud_rejected`.
  - `test_duplicate_name_different_case_rejected`.
- **Implementation outline**: viewset with ADMIN gating; serializer enforces scope choices + allowed_actions allowlist; executor checks `agent.scope == read_only` and intersects requested action with the write set → reject.
- **Acceptance criteria**: per AI-S16 ACs.
- **Verify**: `docker compose -f docker-compose-test.yml run --rm api-tests pytest apps/api/plane/tests/app/test_automation_agent.py`
- **Done when**: CRUD + uniqueness green; read_only write rejection proven server-side.

---

## AI-T16 — Agent assignment + @mention run (worker, inline response, graceful deactivation)

- **Implements**: AI-E8 / AI-S17.
- **Depends on**: AI-T15 (agents + guardrail), AI-T14 (action layer + audit).
- **Risk tier**: R1; loop guard + graceful-abort are R0 individually.
- **Worktree isolation**: no (new bgtask + mention-parse hook; isolate the comment-save hook if shared).
- **Context**: Assigning an agent (pseudo-assignee) or `@AgentName` in a comment enqueues an `AgentMention {source_type, source_id, status}` and a Copilot-action run honoring the agent's scope; the response threads inline; all actions audited. Agents must not infinitely re-trigger rules (Q4 loop guard). Agent removed/deactivated mid-run → run aborts gracefully, audit notes "agent unavailable," assignment cleared without error.
- **Files**: `apps/api/plane/bgtasks/agent_mention_task.py`; mention parser hooked on comment save; assignment hook on issue assignee change.
- **TDD — write this failing test first**: `apps/api/plane/tests/bgtasks/test_agent_mention_run.py`
  - `test_write_agent_mention_executes_action_threads_response_audited`.
  - `test_read_only_agent_mention_cannot_write` (defense-in-depth with AI-T15).
  - `test_guest_mention_of_write_agent_rejected`.
  - `test_agent_deactivated_mid_run_aborts_gracefully_audit_notes_unavailable_assignment_cleared`.
  - `test_agent_actions_do_not_infinitely_retrigger_rules` (loop guard).
- **Implementation outline**: parse `@AgentName` against `AutomationAgent` (case-insensitive); enqueue mention run; executor honors scope + loop guard (mark agent-originated events so the rule engine skips re-trigger or counts depth); persist response on `AgentMention`; on deactivation, abort + audit + clear assignment.
- **Acceptance criteria**: per AI-S17 ACs.
- **Verify**: `docker compose -f docker-compose-test.yml run --rm api-tests pytest apps/api/plane/tests/bgtasks/test_agent_mention_run.py`
- **Done when**: write run + inline response + audit green; deactivation abort + loop guard proven.

---

## AI-T17 — Intake triage classifier task + suggestion read/apply endpoints

- **Implements**: AI-E7 / AI-S14, AI-S15.
- **Depends on**: AI-T5 (`TriageSuggestion` model), AI-T4 (audit).
- **Risk tier**: R1; the apply path is audited and R0 individually.
- **Worktree isolation**: yes — registers routes in `external.py`; the classifier is a new bgtask (no conflict). Serialize external.py.
- **Context**: On new `IntakeIssue`, an async classifier produces a `TriageSuggestion {suggested_labels, suggested_assignee, suggested_priority, suggested_project, confidence, status=pending}`. `GET workspaces/<slug>/intake/<intake_id>/triage-suggestions/` and `POST .../<suggestion_id>/apply/`. Apply requires ≥ MEMBER; applies labels/assignee/priority/project to the issue, sets `status=applied`, writes audit. Member-corrected values (not AI values) persist when supplied. Already applied/rejected → idempotent no-op. Low confidence (`< 0.5`, Q13) → low-confidence badge in `pending`, still requires human approval; never auto-applied. No provider → no suggestion, manual queue unchanged.
- **Files**: `apps/api/plane/bgtasks/intake_triage_task.py`; new `apps/api/plane/app/views/triage_suggestion.py`; routes in `external.py`.
- **TDD — write this failing test first**: `apps/api/plane/tests/app/test_intake_triage.py`
  - `test_new_intake_issue_produces_pending_suggestion`.
  - `test_no_provider_no_suggestion_manual_unchanged`.
  - `test_guest_non_member_get_suggestions_403`.
  - `test_low_confidence_surfaced_pending_not_auto_applied`.
  - `test_member_apply_applies_values_sets_applied_and_audits`.
  - `test_member_corrected_values_persist_over_ai_values`.
  - `test_guest_or_viewer_apply_rejected_stays_pending`.
  - `test_apply_already_applied_is_idempotent_noop`.
- **Implementation outline**: classifier through LLM seam, restrict suggested assignee/project to valid members/projects in scope; sanitize imported text; apply endpoint requires MEMBER, writes audit, idempotent on status.
- **Acceptance criteria**: per AI-S14/AI-S15 ACs.
- **Verify**: `docker compose -f docker-compose-test.yml run --rm api-tests pytest apps/api/plane/tests/app/test_intake_triage.py`
- **Done when**: classifier + read + apply green; low-confidence handled; apply audited + idempotent; fail-closed.

---

## AI-T18 — Slack connector: channel binding CRUD + signed inbound webhook → IntakeIssue

- **Implements**: AI-E9 / AI-S18.
- **Depends on**: AI-T5 (`SlackChannelBinding`), AI-T17 (inbound → IntakeIssue → triage), AI-T4 (audit).
- **Risk tier**: R1; Slack signature verification is **R0 individually** — must land with valid/invalid/replayed tests.
- **Worktree isolation**: yes — registers routes in `external.py`. Serialize.
- **Context**: ADMIN settings CRUD `…/integrations/slack/channels/` to create `SlackChannelBinding {channel_id, direction, schedule, kind}` under the workspace's `SlackProjectSync`, gated by `integrations`. Inbound `POST workspaces/<slug>/integrations/slack/events/` verifies the Slack signature, then creates an `IntakeIssue` (rate-limited) and enqueues triage if AI-T17 present. Q5 mapping default: `message.text → IntakeIssue.description_html`, `message.user → source_email`, `message.ts → external_id` (document the mapping). Unsigned/replayed → rejected, no side effects. Event for an unbound channel → ignored, logged at info, **not 500**. Sanitize imported text. Secret never logged.
- **Files**: new `apps/api/plane/app/views/integration/slack_connector.py` (binding CRUD + inbound webhook); routes in `external.py`. Reuse the fork's webhook-signature pattern (HMAC-SHA256, timing-safe compare, `SecretField`).
- **TDD — write this failing test first**: `apps/api/plane/tests/app/test_slack_connector.py`
  - `test_admin_creates_channel_binding_gated_by_integrations`.
  - `test_non_admin_binding_rejected_no_secret_exposed`.
  - `test_signed_inbound_for_bound_channel_creates_intake_issue_and_enqueues_triage`.
  - `test_unsigned_or_replayed_rejected_no_side_effects`.
  - `test_inbound_for_unbound_channel_ignored_logged_info_not_500`.
  - `test_imported_text_sanitized`.
- **Implementation outline**: binding viewset (ADMIN, `integrations`); inbound view verifies Slack signature + timestamp (replay window), throttled; maps fields → IntakeIssue, sanitizes, enqueues triage; unbound channel → info log + 200.
- **Acceptance criteria**: per AI-S18 ACs.
- **Verify**: `docker compose -f docker-compose-test.yml run --rm api-tests pytest apps/api/plane/tests/app/test_slack_connector.py`
- **Done when**: signature valid/invalid/replayed all green; unbound channel no-500; inbound creates IntakeIssue; rate-limited; no secret in logs.

---

## AI-T19 — Slack outbound: scheduled summaries + risk/overdue alerts

- **Implements**: AI-E9 / AI-S19.
- **Depends on**: AI-T18 (bindings), AI-T10 (summary generation).
- **Risk tier**: R1.
- **Worktree isolation**: no (new Celery-beat task + alert task; isolate beat-schedule registration if shared).
- **Context**: Outbound `summary` bindings with a daily/weekly cron (Q17: standard cron via Celery beat) post cycle summaries to the bound channel. `alert` bindings post risk/overdue alerts to the configured alert channel when an issue becomes overdue/at-risk. `integrations` off or no provider → no post, skip logged (fail-closed). Deleted Slack channel → failure handled gracefully (logged, no crash); other bindings still run.
- **Files**: `apps/api/plane/bgtasks/slack_outbound_task.py`; Celery-beat schedule entry; reuse AI-T10 summarizer.
- **TDD — write this failing test first**: `apps/api/plane/tests/bgtasks/test_slack_outbound.py`
  - `test_scheduled_summary_binding_posts_to_channel`.
  - `test_alert_binding_posts_on_overdue_or_at_risk`.
  - `test_integrations_off_or_no_provider_skips_and_logs`.
  - `test_deleted_channel_failure_handled_other_bindings_still_run`.
- **Implementation outline**: beat task iterates due `summary` bindings, generates via AI-T10, posts via Slack API using the stored token; alert task triggered on overdue/at-risk transitions; wrap each post in try/except so one failure doesn't abort the batch.
- **Acceptance criteria**: per AI-S19 ACs.
- **Verify**: `docker compose -f docker-compose-test.yml run --rm api-tests pytest apps/api/plane/tests/bgtasks/test_slack_outbound.py`
- **Done when**: summary + alert posts green; fail-closed skip; one bad binding doesn't break the batch.

---

## AI-T20 — Sentry connector: config CRUD + HMAC webhook → classified linked issue

- **Implements**: AI-E9 / AI-S20.
- **Depends on**: AI-T5 (`SentryProjectSync`), AI-T17 (optional async triage), AI-T4 (audit).
- **Risk tier**: R1; HMAC verification is **R0 individually** — must land with valid/invalid/replayed tests.
- **Worktree isolation**: yes — registers routes in `external.py` + edits `db/models/integration/__init__.py` only if not already done in AI-T5. Serialize.
- **Context**: ADMIN settings `…/integrations/sentry/` to register `SentryProjectSync {webhook_secret, severity_map, default_assignee}` (secret write-only, never echoed). Inbound `POST workspaces/<slug>/integrations/sentry/webhook/` verifies HMAC against `webhook_secret` before any processing, then creates an issue with the sanitized stack trace, `severity→priority` mapping (Q18: user-configurable JSON, e.g. `{fatal: urgent, error: high, warning: medium}`), and a service/release link. Unsigned/replayed/mismatched → 401/403, nothing created. Webhook for an unbound project → ignored, logged at info (not 500); secret never logged.
- **Files**: new `apps/api/plane/app/views/integration/sentry_connector.py` (config CRUD + webhook); routes in `external.py`.
- **TDD — write this failing test first**: `apps/api/plane/tests/app/test_sentry_connector.py`
  - `test_admin_registers_config_secret_write_only`.
  - `test_verified_alert_creates_issue_with_mapped_priority_and_links`.
  - `test_payload_sanitized_before_persist`.
  - `test_unsigned_replayed_or_mismatched_rejected_nothing_created`.
  - `test_unbound_project_ignored_logged_info_not_500_secret_never_logged`.
- **Implementation outline**: config viewset (ADMIN, `integrations`), secret write-only; webhook verifies HMAC-SHA256 timing-safe; map severity via `severity_map`; sanitize stack trace; create issue + link; optional triage enqueue.
- **Acceptance criteria**: per AI-S20 ACs.
- **Verify**: `docker compose -f docker-compose-test.yml run --rm api-tests pytest apps/api/plane/tests/app/test_sentry_connector.py`
- **Done when**: HMAC valid/invalid/replayed green; unbound no-500; severity mapping + links correct; secret write-only and never logged.

---

## AI-T21 — MCP server (standalone deployable, token-scoped, audited)

- **Implements**: AI-E9 / AI-S21.
- **Depends on**: AI-T4 (audit), AI-T9 (reused create/search/`/api/v1/` endpoints).
- **Risk tier**: R1; token-scope enforcement is **R0 individually** — must land with token-scope + cross-workspace tests.
- **Worktree isolation**: no (new standalone package/app `apps/mcp/` or `packages/mcp-server`).
- **Context**: A standalone deployable MCP server exposes four tools — `create_issue`, `search_backlog`, `get_cycle_status`, `update_issue` — each mapping to a token-scoped `/api/v1/` Plane endpoint and authenticated by a Plane personal API token. Tool calls cannot exceed the key holder's role (a GUEST/viewer token cannot create/update). Invalid/revoked/cross-workspace token → 401/403, no data returned. Empty backlog `search_backlog` → empty set, still audited. Every call writes to the Plane audit trail. The server is independently deployable and removable without touching the Plane API.
- **Files**: new package under `apps/mcp/` (or `packages/mcp-server/`) — server entry, four tool handlers, an `/api/v1/` Plane client wrapping the token; README for deployment + token scope.
- **TDD — write this failing test first**: `apps/mcp/tests/test_mcp_tools.py` (or the package's test runner)
  - `test_valid_token_create_issue_maps_to_api_v1_and_audits`.
  - `test_guest_token_write_tool_rejected_cannot_exceed_role`.
  - `test_invalid_revoked_or_cross_workspace_token_rejected_no_data`.
  - `test_search_backlog_empty_returns_empty_set_still_audited`.
- **Implementation outline**: implement an MCP server (Python/TypeScript per repo convention — verify which the fork prefers for standalone services); each tool forwards to the corresponding `/api/v1/` route with the caller's token so Plane enforces role server-side; rely on Plane's audit write per call (do not duplicate auth in the MCP layer beyond passing the token).
- **Acceptance criteria**: per AI-S21 ACs.
- **Verify**: package test command (e.g. `pytest apps/mcp/tests/` or `pnpm --filter mcp-server test`); confirm against a running `/api/v1/` in the integration suite.
- **Done when**: token-scope + cross-workspace + empty-backlog green; every tool call audited; server deployable/removable independently.

---

## AI-T22 — Shared types + constants: copilot modes, editor tasks, rule/agent enums

- **Implements**: cross-cutting for AI-E4/E5/E6/E8 frontend.
- **Depends on**: backend contracts from AI-T9 (build_project), AI-T12 (translate), AI-T13/AI-T15 (rule/agent enums) — types should match the shipped server shapes.
- **Risk tier**: R2.
- **Worktree isolation**: yes — edits `@plane/types`, `@plane/constants`, and `apps/web/core/services/ai.service.ts` `TCopilotMode` (all shared). Serialize against any web card importing these.
- **Context**: Centralize the new shared TypeScript types/enums so every web card imports them rather than redeclaring. Extend `TCopilotMode` with `build_project` and `context_assist`; add `TBuildProjectDraft` and extend `TCopilotMessageResponse` with optional `project_draft` (mirror the existing `subtask_draft` shape); add `TRANSLATE` to `AI_EDITOR_TASKS` (`apps/web/core/constants/ai.ts` + `packages/constants/src/ai.ts`); add rule trigger/action and agent scope enums to `@plane/constants`; add the `ai_chat` sidebar nav entry to `packages/constants/src/workspace.ts`.
- **Files**: `apps/web/core/services/ai.service.ts` (type exports), `@plane/types` (e.g. `packages/types/src/...`), `apps/web/core/constants/ai.ts`, `packages/constants/src/ai.ts`, `packages/constants/src/workspace.ts`.
- **TDD — write this failing test first**: `apps/web/core/services/__tests__/ai.types.spec.ts`
  - `TCopilotMode includes build_project and context_assist` — type-level + a runtime const list assertion.
  - `AI_EDITOR_TASKS includes TRANSLATE`.
  - `rule trigger/action and agent scope enums exported with expected members`.
  - `workspace nav registry includes ai_chat entry with href /ai-chat/`.
- **Implementation outline**: extend the unions/enums; keep additive (no removal); ensure `check:types` passes across `web` and consuming packages.
- **Acceptance criteria**:
  - Given the extended `TCopilotMode`, When a component sets `mode: "build_project"`, Then it type-checks.
  - Given `AI_EDITOR_TASKS`, When `TRANSLATE` is referenced, Then it resolves.
  - Given the nav registry, When read, Then it contains an `ai_chat` entry.
- **Verify**: `pnpm --filter web exec vitest run apps/web/core/services/__tests__/ai.types.spec.ts` and `pnpm turbo run check:types --filter=web`
- **Done when**: enums/types land additive; type check green across web and shared packages.

---

## AI-T23 — `AICopilotStore` + `AIService` method extensions

- **Implements**: cross-cutting store/service for AI-E1/E2/E3/E4/E5.
- **Depends on**: AI-T22 (types), and the corresponding backend endpoints (AI-T7/T8/T9/T10/T11/T12) for the methods it wraps.
- **Risk tier**: R2.
- **Worktree isolation**: yes — edits `apps/web/core/services/ai.service.ts` and `apps/web/core/store/root.store.ts` (shared). Serialize.
- **Context**: Add the MobX store and service methods every AI surface uses, so UI cards stay thin. `AICopilotStore` (`apps/web/core/store/ai/copilot.store.ts`) holds `activeMode`, `isPanelOpen`, `buildDraft`, `conversations`, with actions `setMode`, `openPanel({entityType, entityId})`, `applyBuildDraft`; composed onto `root.store.ts`, surfaced via `useStore()`. `AIService` gains `createBuildDraft`, `applyBuildDraft`, `checkDuplicates`, `summarizeEntity`, `createShareLink`, `generateBrief`, `contextAssist`, `translate` (via `performEditorTask`).
- **Files**: create `apps/web/core/store/ai/copilot.store.ts`; modify `apps/web/core/store/root.store.ts`; extend `apps/web/core/services/ai.service.ts`.
- **TDD — write this failing test first**: `apps/web/core/store/ai/__tests__/copilot.store.spec.ts`
  - `setMode updates activeMode observable`.
  - `openPanel sets isPanelOpen and entity context`.
  - `applyBuildDraft success path clears buildDraft via runInAction; failure keeps draft`.
  - And `apps/web/core/services/__tests__/ai.service.spec.ts`: each new method hits the correct path with the correct payload (mock `APIService`).
- **Implementation outline**: follow the MobX store pattern (`constructor(rootStore)`, `makeObservable` with `observable`/`action`/`runInAction`); service methods extend `APIService` and centralize paths/payload shapes.
- **Acceptance criteria**:
  - Given `applyBuildDraft` succeeds, When it resolves, Then `buildDraft` is cleared in `runInAction`; on failure the draft is retained.
  - Given each service method, When called, Then it targets the documented endpoint path with the right payload.
- **Verify**: `pnpm --filter web exec vitest run apps/web/core/store/ai apps/web/core/services/__tests__/ai.service.spec.ts` and `pnpm turbo run check:types --filter=web`
- **Done when**: store + service tests green; store composed onto root; methods match backend contracts.

---

## AI-T24 — Inline duplicate detection in the issue create form

- **Implements**: AI-E2 / AI-S4, AI-S5 (UI).
- **Depends on**: AI-T8 (endpoint), AI-T23 (`checkDuplicates`).
- **Risk tier**: R2; the high-confidence block path is R0 individually (UI must actually block at threshold).
- **Worktree isolation**: no (new component + a hook into the existing form; isolate the form file edit if another web card touches it).
- **Context**: Debounced `checkDuplicates` as the user types title/description in `apps/web/core/components/issues/issue-modal/form.tsx` (+ `components/title-input.tsx`, `description-editor.tsx`). Render a "Similar issues found" list with score chips + `matched_on[]`. `score >= DUPLICATE_BLOCK_THRESHOLD` → blocking warning with a "Create anyway" override. Empty backlog → never blocks. Gated by `ai_copilot` + provider; disabled state otherwise (manual create unchanged).
- **Files**: new `apps/web/core/components/ai/duplicate-detection/DuplicateWarning.tsx`; wire into the issue create form.
- **TDD — write this failing test first**: `apps/web/core/components/ai/duplicate-detection/__tests__/DuplicateWarning.spec.tsx`
  - `renders score chips and matched_on for candidates`.
  - `high_confidence at/above threshold blocks submit until Create anyway`.
  - `low_confidence shows suggestions but does not block submit`.
  - `empty candidates renders nothing and never blocks`.
  - `ai_copilot off or provider missing → no duplicate UI, manual create works`.
- **Implementation outline**: debounce the call; render the list; bind submit-disabled to `high_confidence` until override; gate on flag + provider.
- **Acceptance criteria**: per AI-S4/AI-S5 UI ACs.
- **Verify**: `pnpm --filter web exec vitest run apps/web/core/components/ai/duplicate-detection`
- **Done when**: block-at-threshold + override + empty + gating green.

---

## AI-T25 — Summaries: "Get Digest" button + `AISummaryModal` + share link

- **Implements**: AI-E3 / AI-S6, AI-S7 (UI).
- **Depends on**: AI-T10, AI-T11 (endpoints), AI-T23 (`summarizeEntity`, `createShareLink`).
- **Risk tier**: R2.
- **Worktree isolation**: no (new components + buttons in cycle/project headers + initiative pane; isolate header file edits).
- **Context**: "Summarize"/"Get Digest" button in cycle/project headers + initiative detail → `AISummaryModal` rendering markdown + rollup stat cards (% complete / blockers / at-risk) with a copy-share-link action. ~2–3s spinner using `getAIThinkingMessage`. Gated by `ai_copilot` + provider.
- **Files**: new `apps/web/core/components/ai/summaries/AISummaryModal.tsx`, `GetDigestButton.tsx`; mount in cycle/project headers + initiative pane.
- **TDD — write this failing test first**: `apps/web/core/components/ai/summaries/__tests__/AISummaryModal.spec.tsx`
  - `renders markdown and rollup stat cards on success`.
  - `copy share link calls createShareLink and surfaces the URL`.
  - `thinking copy shows during in-flight request`.
  - `provider missing → disabled button with connect hint`.
- **Implementation outline**: button triggers `summarizeEntity`; modal renders markdown + cards; copy-link calls `createShareLink`; reuse thinking copy + toast.
- **Acceptance criteria**: per AI-S6/AI-S7 UI ACs.
- **Verify**: `pnpm --filter web exec vitest run apps/web/core/components/ai/summaries`
- **Done when**: render + share-link + gating green.

---

## AI-T26 — AI Brief button (issue detail) + in-editor Translate menu item

- **Implements**: AI-E4 / AI-S8, AI-S9 (UI).
- **Depends on**: AI-T12 (endpoints), AI-T22 (`TRANSLATE` task), AI-T23 (`generateBrief`, `translate`).
- **Risk tier**: R2.
- **Worktree isolation**: no (new button + editor menu item; isolate the editor menu file `apps/web/ce/components/pages/editor/ai/menu.tsx` if shared).
- **Context**: "Generate Brief"/"AI Draft" button in issue detail → `generate-brief` → links the new Page, with regenerate/refine controls. Extend the editor selection popover (`menu.tsx`) with a Translate item + language picker; inline result, Accept/Cancel (replace only on Accept). Gated by `ai_copilot` + provider.
- **Files**: new `apps/web/core/components/ai/brief/GenerateBriefButton.tsx`; modify `apps/web/ce/components/pages/editor/ai/menu.tsx` (add Translate item + language dropdown).
- **TDD — write this failing test first**: `apps/web/core/components/ai/brief/__tests__/GenerateBriefButton.spec.tsx` and `apps/web/ce/components/pages/editor/ai/__tests__/translate.spec.tsx`
  - `generate brief success links the new page and shows regenerate control`.
  - `regenerate does not blindly destroy prior page (calls regenerate path)`.
  - `translate item replaces selection only on Accept; Cancel leaves text untouched`.
  - `empty selection or blank language → validation error, no replace`.
  - `provider missing → controls disabled with connect hint`.
- **Implementation outline**: brief button calls `generateBrief`, links page on success; translate menu item calls `performEditorTask({task:"translate", target_language})`, applies on Accept only.
- **Acceptance criteria**: per AI-S8/AI-S9 UI ACs.
- **Verify**: `pnpm --filter web exec vitest run apps/web/core/components/ai/brief apps/web/ce/components/pages/editor/ai`
- **Done when**: brief link + regenerate + translate Accept-only + gating green.

---

## AI-T27 — Build Mode UI: Home widget, Ask/Build dropdown, `/ai-chat` route, `BuildDraftEditor`, global header button

- **Implements**: AI-E1 / AI-S3 (header context-assist), AI-E5 / AI-S10, AI-S11 (UI); design.md AI-DS surfaces (Home widget, mode dropdown, `/ai-chat`, header AI button).
- **Depends on**: AI-T7 (context-assist), AI-T9 (build_project + apply), AI-T22 (types), AI-T23 (store/service).
- **Risk tier**: R2 (frontend-only; reverts by reverting the commit).
- **Worktree isolation**: yes — edits `packages/constants/src/workspace.ts` (nav), `apps/web/app/routes/core.ts`/`extended.ts` (route registration), `home-dashboard-widgets.tsx`, the global app-shell header, and `sidebar-menu-items.tsx`. Serialize against AI-T22 and any nav/route card.
- **Context**: The largest UI card. Per design.md: add an `AskPlaneAIWidget` (Ask/Build dropdown defaulting to Ask, workspace chip, promo copy, "Activate Build mode" button) to Home; a shared `BuildDraftEditor`/`BuildWorkItemRow`/`BuildCyclePicker` rendering the editable draft tree with "Apply draft"/"Cancel"/"Edit cycle assignment" and per-item warnings from apply; a dedicated `/ai-chat` route (left-nav "Plane AI" item, "New chat", "Recents"/"No threads available", composer "What can I do for you?", Build toggle); a global header "AI assistant" button that opens the panel pre-loaded with `context-assist`. Extract shared conversation/composer internals into `apps/web/core/components/ai/shared/` to de-dupe Home widget ↔ `/ai-chat`. **Honesty (no-magic):** mic, "Add files or photos", and "Web search" have NO fork backend — omit or render an explicit disabled/"coming soon" affordance; do NOT ship silent no-ops. Gate everything by `ai_copilot` + provider; nav item hidden (not paywalled) when off.
- **Files**:
  - `apps/web/core/components/ai/ask-plane-widget/AskPlaneAIWidget.tsx`, `CopilotModeDropdown.tsx`
  - `apps/web/core/components/ai/build-mode/BuildDraftEditor.tsx`, `BuildWorkItemRow.tsx`, `BuildCyclePicker.tsx`
  - `apps/web/core/components/ai/chat/AIChatRoot.tsx`, `RecentsList.tsx`, `ChatComposer.tsx`; `apps/web/core/components/ai/shared/` (extracted internals)
  - `apps/web/core/components/ai/AIAssistantButton.tsx`
  - `apps/web/app/(all)/[workspaceSlug]/(ai)/layout.tsx` + `ai-chat/page.tsx`
  - register route in `apps/web/app/routes/core.ts` (or `extended.ts`); nav in `packages/constants/src/workspace.ts` + `sidebar-menu-items.tsx`; widget in `home-dashboard-widgets.tsx`; mount `AIAssistantButton` in the app-shell header.
- **TDD — write this failing test first**: under `apps/web/core/components/ai/**/__tests__/`
  - `AskPlaneAIWidget: Ask/Build dropdown defaults to Ask; Activate Build opens panel in build mode`.
  - `AskPlaneAIWidget: provider missing → disabled widget with connect hint (no paywall)`.
  - `BuildDraftEditor: renders editable draft (name/desc/work_items/suggested_cycle), nothing persisted until Apply; Apply calls applyBuildDraft; per-item warnings render`.
  - `AIChatRoot: empty Recents shows "No threads available"; composer placeholder "What can I do for you?"; Build toggle renders BuildDraftEditor inline`.
  - `nav: ai_chat item hidden when ai_copilot off`.
  - `AIAssistantButton: opens panel and calls contextAssist with derived entity; list/view with no entity opens general assist (no guess)`.
  - `no-magic: mic/files/web-search render only as disabled "coming soon" or are absent (no silent no-op control)`.
- **Implementation outline**: reuse `CopilotPanel` internals via the shared module; mode dropdown maps Ask→`auto`/`answer`, Build→`build_project`; header button derives entity from route params (Q15) and calls `contextAssist`; build editor binds to `AICopilotStore.buildDraft`/`applyBuildDraft`; gate every surface.
- **Acceptance criteria**: per design.md AI-DS acceptance criteria (Home widget, Build draft, `/ai-chat`, header button) + AI-S3/S10/S11 UI ACs.
- **Verify**: `pnpm --filter web exec vitest run apps/web/core/components/ai` and `pnpm turbo run check:types --filter=web`
- **Done when**: widget + dropdown + build editor + `/ai-chat` + header button + gating green; no fake/no-op controls shipped.

---

## AI-T28 — Automations rule builder UI + run history (workspace-level)

- **Implements**: AI-E6 / AI-S12, AI-S13 (UI).
- **Depends on**: AI-T13 (rule CRUD), AI-T14 (runs), AI-T22 (enums).
- **Risk tier**: R2.
- **Worktree isolation**: yes — registers a route in `core.ts` and extends the existing automations settings area. Serialize route-registration edits.
- **Context**: A workspace-level "Automations" settings route (extend the existing project-scoped automations at `settings/projects/[projectId]/automations/`) with an if-then builder: trigger select → conditions → actions dropdown (assign / set_priority / move_to_cycle / post_to_slack / close / run_agent), an "add" action, plus a run-history table reading `AutomationRun`. Gated by `workflows_approvals` + ADMIN.
- **Files**: new `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/automations/page.tsx` + components under `apps/web/core/components/ai/automations/` (`RuleBuilder.tsx`, `RuleList.tsx`, `RunHistoryTable.tsx`); register route in `core.ts`.
- **TDD — write this failing test first**: `apps/web/core/components/ai/automations/__tests__/RuleBuilder.spec.tsx`
  - `trigger→conditions→actions form submits a valid rule payload`.
  - `empty actions or non-allowlisted action shows a validation error (no submit)`.
  - `non-admin sees NotAuthorized / no builder`.
  - `run history table renders AutomationRun rows with status`.
  - `workflows_approvals off → route hidden/disabled (no paywall)`.
- **Implementation outline**: form maps to the AI-T13 payload; reuse ADMIN guard + `NotAuthorizedView`; run-history list reads via service.
- **Acceptance criteria**: per AI-S12/AI-S13 UI ACs (admin-only, validation, run history).
- **Verify**: `pnpm --filter web exec vitest run apps/web/core/components/ai/automations`
- **Done when**: builder + validation + run history + ADMIN/flag gating green.

---

## AI-T29 — Agents UI: assignee-dropdown section + `@AgentName` mention + inline response

- **Implements**: AI-E8 / AI-S16, AI-S17 (UI).
- **Depends on**: AI-T15 (agent CRUD), AI-T16 (mention run), AI-T22 (scope enum).
- **Risk tier**: R2.
- **Worktree isolation**: no (new section + mention handling; isolate the assignee-dropdown and comment-editor files if shared).
- **Context**: An "Agents" section in the assignee dropdown (`apps/web/core/components/issues/assignee-dropdown.tsx`) showing agent chips with a scope badge (read-only/write); `@AgentName` mention in the comment editor enqueues a run and threads the agent's response inline. Gated by `workflows_approvals` + provider.
- **Files**: modify the assignee dropdown to add an Agents section; extend the comment editor mention source to include agents; new `apps/web/core/components/ai/agents/AgentChip.tsx`, `AgentResponseThread.tsx`.
- **TDD — write this failing test first**: `apps/web/core/components/ai/agents/__tests__/agents.spec.tsx`
  - `assignee dropdown shows Agents section with scope badge`.
  - `@AgentName mention enqueues a run and renders inline response`.
  - `read-only agent chip shows read-only badge`.
  - `workflows_approvals off → no Agents section`.
- **Implementation outline**: fetch agents via service; render chips with scope badge; wire mention autocomplete to agents; render `AgentResponseThread` from `AgentMention.response`.
- **Acceptance criteria**: per AI-S16/AI-S17 UI ACs.
- **Verify**: `pnpm --filter web exec vitest run apps/web/core/components/ai/agents`
- **Done when**: agent section + mention + inline response + scope badge + gating green.

---

## AI-T30 — Intake triage review-queue chips (Approve/Correct)

- **Implements**: AI-E7 / AI-S14, AI-S15 (UI).
- **Depends on**: AI-T17 (suggestion endpoints), AI-T23 (service).
- **Risk tier**: R2.
- **Worktree isolation**: no (new chips in the intake review queue; isolate the queue file if shared).
- **Context**: In the intake review queue, render AI-suggested label/assignee/priority/project chips with a confidence badge (low-confidence styled distinctly), plus Approve/Correct buttons. Nothing reaches the backlog without a human action. Gated by `intake` (queue) + `ai_copilot` (suggestions) + provider.
- **Files**: new `apps/web/core/components/ai/intake-triage/TriageSuggestionChips.tsx`; wire into the intake review queue component.
- **TDD — write this failing test first**: `apps/web/core/components/ai/intake-triage/__tests__/TriageSuggestionChips.spec.tsx`
  - `renders suggested label/assignee/priority/project with confidence badge`.
  - `low-confidence suggestion shows the low-confidence badge`.
  - `Approve calls apply; Correct lets the member edit before applying`.
  - `provider/flag off → chips absent, manual triage unchanged`.
- **Implementation outline**: fetch suggestions via service; render chips + confidence badge; Approve → apply endpoint; Correct → editable values then apply.
- **Acceptance criteria**: per AI-S14/AI-S15 UI ACs.
- **Verify**: `pnpm --filter web exec vitest run apps/web/core/components/ai/intake-triage`
- **Done when**: chips + confidence badge + Approve/Correct + gating green.

---

## AI-T31 — Connectors tab: Slack panel, Sentry panel, MCP "Build your own" card

- **Implements**: AI-E9 / AI-S18, AI-S20, AI-S21 (UI); design.md Connectors tab.
- **Depends on**: AI-T18 (Slack CRUD), AI-T20 (Sentry CRUD), AI-T21 (MCP), AI-T23/IntegrationService.
- **Risk tier**: R2.
- **Worktree isolation**: yes — extends `integrations/page.tsx` (shared settings page). Serialize.
- **Context**: Add a "Connectors" tab to Settings → Integrations listing Slack / GitHub / GitLab / Sentry + a "Build your own" (MCP) card. Slack panel: bind channels (inbound→intake, outbound summary/alert), schedule picker (cron, Q17), alert-channel select. Sentry panel: register webhook (show inbound URL `…/integrations/sentry/webhook/`), enter secret (write-only, never echoed `••••`), edit severity_map. MCP card: API-token scope explanation + link to the standalone server; no secrets rendered. Reuse the existing ADMIN guard → `NotAuthorizedView`; gate by `integrations`.
- **Files**: extend `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/(workspace)/integrations/page.tsx` (Installed | Connectors tabs); new `apps/web/core/components/integrations/connectors/ConnectorsList.tsx`, `SlackConnectorPanel.tsx`, `SentryConnectorPanel.tsx`, `McpConnectorCard.tsx`; extend `IntegrationService` with `getSlackChannels/bindSlackChannel`, `getSentryConfig/upsertSentryConfig`.
- **TDD — write this failing test first**: `apps/web/core/components/integrations/connectors/__tests__/connectors.spec.tsx`
  - `Connectors tab lists Slack, GitHub, GitLab, Sentry, Build your own (admin + integrations on)`.
  - `non-admin → NotAuthorizedView`.
  - `Sentry secret input is write-only (renders ••••, never round-trips the value)`.
  - `Slack outbound binding stores schedule as cron and reflects it in the list`.
  - `integrations off → tab hidden (no paywall)`.
- **Implementation outline**: tab switcher; panels call the IntegrationService methods; secret fields write-only; MCP card is informational + link.
- **Acceptance criteria**: per design.md Connectors-tab ACs + AI-S18/S20/S21 UI ACs.
- **Verify**: `pnpm --filter web exec vitest run apps/web/core/components/integrations/connectors` and `pnpm turbo run check:types --filter=web`
- **Done when**: tab + Slack/Sentry panels + MCP card + write-only secret + ADMIN/flag gating green.

---

## Execution order & parallelism

### Dependency graph (text)

```
Backend models/migrations (no deps):
  AI-T1 (IssueEmbedding)
  AI-T3 (AISummary)
  AI-T4 (AutomationRule/Run + AuditLog)
  AI-T5 (Agent/Mention, TriageSuggestion, SentryProjectSync, SlackChannelBinding)  ← depends AI-T4

Backend bgtasks/APIs:
  AI-T2 (embedding task)          ← AI-T1
  AI-T6 (semantic ranking)        ← AI-T1 (soft AI-T2)   [copilot.py]
  AI-T7 (context-assist)          ← AI-T6 (soft)         [copilot.py + external.py]
  AI-T8 (duplicate-check)         ← AI-T6 (soft)         [external.py]
  AI-T9 (build_project + apply)   ← AI-T4 (soft)         [copilot.py + external.py]
  AI-T10 (summarize)              ← AI-T3                [external.py]
  AI-T11 (share summary)          ← AI-T10               [external.py]
  AI-T12 (generate-brief + translate) ← (none)           [external.py + rephrase handler]
  AI-T13 (rule CRUD)              ← AI-T4                [external.py]
  AI-T14 (rule worker + audit)    ← AI-T13, AI-T4
  AI-T15 (agent CRUD + guardrail) ← AI-T5, AI-T14        [external.py]
  AI-T16 (agent mention run)      ← AI-T15, AI-T14
  AI-T17 (intake triage + apply)  ← AI-T5, AI-T4         [external.py]
  AI-T18 (Slack CRUD + inbound)   ← AI-T5, AI-T17, AI-T4 [external.py]
  AI-T19 (Slack outbound)         ← AI-T18, AI-T10
  AI-T20 (Sentry CRUD + webhook)  ← AI-T5, AI-T17, AI-T4 [external.py]
  AI-T21 (MCP server)             ← AI-T4, AI-T9         [standalone]

Frontend foundation:
  AI-T22 (types/constants)        ← contracts of AI-T9/T12/T13/T15   [@plane/types, @plane/constants, ai.service.ts]
  AI-T23 (store + service)        ← AI-T22 + relevant endpoints      [ai.service.ts, root.store.ts]

Frontend surfaces:
  AI-T24 (duplicate UI)           ← AI-T8, AI-T23
  AI-T25 (summaries UI)           ← AI-T10, AI-T11, AI-T23
  AI-T26 (brief + translate UI)   ← AI-T12, AI-T22, AI-T23
  AI-T27 (Build/Home/ai-chat/header) ← AI-T7, AI-T9, AI-T22, AI-T23  [nav/routes/header]
  AI-T28 (automations UI)         ← AI-T13, AI-T14, AI-T22
  AI-T29 (agents UI)              ← AI-T15, AI-T16, AI-T22
  AI-T30 (intake triage UI)       ← AI-T17, AI-T23
  AI-T31 (connectors UI)          ← AI-T18, AI-T20, AI-T21, AI-T23   [integrations/page.tsx]
```

### Parallel batches (run each batch concurrently under separate worktrees where files conflict)

- **Batch A (models, fully parallel, no file conflicts):** AI-T1, AI-T3, AI-T4. Then AI-T5 (after AI-T4) — AI-T5 isolates `integration/__init__.py` + `intake.py`.
- **Batch B (backend logic). `copilot.py` and `external.py` are hot files — serialize edits to each within the batch:**
  - copilot.py chain (serialize): AI-T6 → AI-T7 → AI-T9.
  - external.py registrations (serialize route additions): AI-T8, AI-T10→AI-T11, AI-T12, AI-T13, AI-T17, AI-T18, AI-T20. (Each can be developed in its own worktree; merge route additions one at a time.)
  - Independent bgtasks (parallel, no hot-file conflict): AI-T2, AI-T14 (after AI-T13), AI-T16 (after AI-T15), AI-T19 (after AI-T18), AI-T21 (after AI-T9).
  - Agent/automation chain (serialize where noted): AI-T13 → AI-T14 → AI-T15 → AI-T16.
- **Batch C (frontend foundation, serialize the two shared-file cards):** AI-T22 then AI-T23 (both touch `ai.service.ts`; AI-T23 also touches `root.store.ts`).
- **Batch D (frontend surfaces, mostly parallel):** AI-T24, AI-T25, AI-T26, AI-T28, AI-T29, AI-T30 run in parallel (new component dirs). **Serialize the hot-file cards:** AI-T27 (nav/routes/header/home) and AI-T31 (`integrations/page.tsx`) each touch shared registration/settings files — give them their own worktrees and merge last.

### Milestone correspondence (PRD M1–M9)

- M1: AI-T1, AI-T2, AI-T6, AI-T7 (+ AI-T27 header button portion).
- M2: AI-T8, AI-T24.
- M3: AI-T3, AI-T10, AI-T11, AI-T25.
- M4: AI-T12, AI-T26.
- M5: AI-T9, AI-T27.
- M6: AI-T4, AI-T13, AI-T14, AI-T28.
- M7: AI-T17, AI-T30.
- M8: AI-T15, AI-T16, AI-T29.
- M9: AI-T18, AI-T19, AI-T20, AI-T21, AI-T31.
