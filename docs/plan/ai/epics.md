# Plane AI (Ask/Build modes, Connectors, semantic actions) — Epics

This breakdown decomposes the **Plane AI Self-Host Parity** feature into implementable epics. It covers **only the PARTIAL/MISSING gaps** identified in the PRD ([docs/prd-ai-2026-06-07.md](../../prd-ai-2026-06-07.md)) — it does **not** re-plan present capabilities (existing `answer`/`draft_subtasks`/`command`/`auto` Copilot core, GitHub/GitLab sync, manual intake triage, manual page authoring).

Scope anchors:
- Backend: Django/DRF in `apps/api/plane/{db,app,api}`; extend the existing Copilot plumbing (`apps/api/plane/app/views/copilot.py`, `COPILOT_MODES` line 37) and LLM seam (`apps/api/plane/app/views/external/base.py`: `get_llm_config`, `is_llm_configured`).
- Frontend: React Router 7 + MobX in `apps/web/{core,ce}`; shared `@plane/{types,services,ui,constants}`.
- Gating: existing flags in `apps/web/ce/lib/self-host-entitlements.ts` (`ai_copilot`, `integrations`, `workflows_approvals`) via `isSelfHostedFeatureEnabled(...)`. No new gating system.
- All new schema is additive with forward+rollback migration notes; never edit applied migrations. All writes are workspace/project-scoped and permission-checked server-side. AI features fail closed (400) when no provider is configured.
- ID prefix for this feature: **AI**. Epics are `AI-E#`; stories/tasks in the stories/tasks docs cross-reference these IDs.

Epics map to PRD milestones M1–M9. Conventions: acceptance criteria use Given/When/Then; every downstream implementation task names a failing test first (TDD).

---

## AI-E1 — Ask Mode Semantic Retrieval + Context Assist

- **User value:** Ask Plane AI returns more relevant evidence (ranked by meaning, not just keyword match), and a zero-setup Context Assist surfaces blockers / at-risk / recent changes for the entity the user is currently viewing — one keystroke, no prior conversation.
- **Scope (in):**
  - `IssueEmbedding` model (`apps/api/plane/db/models/ai/embedding.py`) — optional pgvector column, 1:1 with Issue, `content_hash`, `model_name`.
  - Cosine-similarity evidence ranking in `retrieve_copilot_evidence` (copilot.py) gated by `WORKSPACE_AI_EMBEDDINGS_ENABLED`, with **silent keyword fallback** when embeddings are absent/stale.
  - Lazy/optional embedding backfill (Celery task in `apps/api/plane/bgtasks/`) — no required GPU; uses the configured provider's embedding endpoint when present.
  - `POST workspaces/<slug>/copilot/context-assist/` accepting `{entity_type, entity_id}`; returns blockers, at-risk items, recent changes, suggested follow-ups.
  - Web: Context Assist panel (Cmd+K) + "matched by relevance" vs "matched by keyword" badge in the copilot panel.
- **Out of scope:** Any change to existing `answer` output when embeddings are off; a self-hosted embedding model requirement; cross-entity (workspace-wide) semantic search beyond the existing evidence scope.
- **Technical requirements:**
  - Reuse `get_llm_config`/`is_llm_configured` (external/base.py) at the AI seam; 400 fail-closed mirrors copilot.py line 90–94.
  - Extend `COPILOT_MODES` (copilot.py line 37) or add a dedicated route per PRD API Contracts; reuse `_has_project_context_permission` (copilot.py line 98) and the guest gate (line 83).
  - Model extends `ProjectBaseModel` (`apps/api/plane/db/models/project.py`) for workspace/project FK + soft-delete; `VectorField(dim=...)` with idempotent `CREATE EXTENSION vector`.
  - Forward migration: enable `vector` extension (idempotent) + create `issue_embeddings`. Rollback: drop table; extension drop guarded (skip if other tables use it). Keyword path unaffected by rollback.
  - Web service method on `ai.service.ts` (extends `APIService`); MobX `aiCopilotStore` for context-assist state.
- **Security:** Reads require workspace/project membership; multi-tenant isolation enforced by workspace FK on every embedding query (workspace A can never query workspace B vectors). Never log prompts containing workspace data. pgvector in shared DB — every retrieval query filters by workspace_id.
- **Dependencies:** Existing Copilot core + `get_llm_config`. No dependency on other AI-E# epics. Foundational: AI-E2 (Duplicate Detection) reuses the embedding/similarity infrastructure when present.
- **Epic-level acceptance criteria:**
  - Given embeddings exist and `WORKSPACE_AI_EMBEDDINGS_ENABLED`, When a user asks a question, Then evidence is ranked by cosine similarity and the response badge reads "matched by relevance".
  - Given no embeddings (or stale `content_hash`), When a user asks the same question, Then retrieval silently uses the existing `icontains` keyword path and the badge reads "matched by keyword".
  - Given no LLM provider is configured, When context-assist is called, Then the endpoint returns 400 cleanly and the UI shows a disabled state.
  - Given a user on entity X, When they trigger Context Assist, Then blockers/at-risk/recent-changes for X are returned with no prior conversation, scoped to entities they may read.
- **Risk tier:** **R1** — adds the pgvector extension (costly to reverse, shared multi-tenant DB) and new schema/route, but additive and fail-closed; existing keyword path is the safe fallback. Migration reverse-review required pre-deploy.
- **Entitlement flag:** `ai_copilot`.

---

## AI-E2 — Automatic Duplicate Detection on Issue Create

- **User value:** When creating an issue, the user is warned (and on high confidence, soft-blocked with an override) if a near-duplicate already exists, reducing backlog noise. Match scores are transparent.
- **Scope (in):**
  - `POST workspaces/<slug>/projects/<project_id>/issues/duplicate-check/` accepting `{title, description, project_id}`; returns ranked `candidates[] {issue_id, score, matched_on[]}` plus `high_confidence` boolean.
  - Threshold logic: `score >= DUPLICATE_BLOCK_THRESHOLD` → `high_confidence=true`; below → suggestions only.
  - Reuse embedding similarity (AI-E1) when present; degrade to keyword scoring when absent.
  - Web: debounced inline check in the issue create form (`apps/web/core/components/issues/`); "Similar issues found" list with score chips; high-confidence blocking warning with "Create anyway" override (`checkDuplicates` service method).
- **Out of scope:** Cross-project dedup; auto-merge of duplicates; bulk retroactive dedup of existing backlog; blocking without an override path.
- **Technical requirements:**
  - DRF endpoint follows the list/detail pattern (cycle.py/label.py); input validation via `serializers.Serializer`; project-context permission via the copilot.py helper.
  - Empty backlog → returns empty `candidates`, never blocks (PRD Edge Cases).
  - Rate-limit the duplicate-check endpoint (debounce client-side + server throttle), as it fires on keystroke.
  - `DUPLICATE_BLOCK_THRESHOLD` is a named constant (no magic number).
- **Security:** Membership-checked reads only; candidates restricted to issues the requesting user may view in the target project; no leakage of items from other workspaces/projects.
- **Dependencies:** AI-E1 (embedding similarity, optional — degrades to keyword without it). No schema of its own.
- **Epic-level acceptance criteria:**
  - Given a title/description matching an existing issue at `score >= DUPLICATE_BLOCK_THRESHOLD`, When the user attempts to submit, Then the form shows a blocking warning with the matched score and an explicit override.
  - Given a low-confidence match (below threshold), When typing, Then suggestions render but submission is not blocked.
  - Given an empty project backlog, When the duplicate-check runs, Then it returns an empty candidate list and never blocks.
  - Given `ai_copilot` is off or no provider, When creating an issue, Then duplicate-check is disabled and manual create works unchanged.
- **Risk tier:** **R2** — additive read-only endpoint + UI; no schema beyond optional embeddings; reverts by removing endpoint and UI. (The high-confidence block path is treated as R0 individually and must land with boundary tests.)
- **Entitlement flag:** `ai_copilot`.

---

## AI-E3 — One-Click Summaries (Cycle / Project / Initiative) + Shareable Link

- **User value:** A "Get Digest" button produces a markdown summary plus rollup stats (percent complete, blockers, at-risk) for a cycle, project, or initiative, with an optional shareable read-only link for stakeholders.
- **Scope (in):**
  - `AISummary` model (`apps/api/plane/db/models/ai/summary.py`): `entity_type (cycle|project|initiative)`, `entity_id`, `markdown`, `rollup JSON`, nullable indexed `share_token`, `generated_by`.
  - `POST .../cycles/<id>/summarize/`, `.../projects/<id>/summarize/`, `.../initiatives/<id>/summarize/` → markdown + `rollup {percent_complete, blockers[], at_risk[]}`.
  - `GET workspaces/<slug>/summaries/shared/<share_token>/` — signed-token read (no session); returns rollup markdown only.
  - Web: "Summarize"/"Get Digest" button in cycle/project headers + initiative detail; markdown render, rollup stat cards, copy-share-link action; ~2–3s spinner.
- **Out of scope:** Scheduled/recurring summary generation (that lives in AI-E9 Slack outbound); editing/versioning of generated summaries beyond regenerate; export to PDF.
- **Technical requirements:**
  - Reuse LLM seam + fail-closed 400.
  - `share_token` is random + expiring; shared read endpoint returns rollup markdown only, **never private item IDs** or unsanitized content (PRD Security + API Contracts line 99).
  - Empty cycle/project → "no activity" markdown + zeroed rollup (PRD Edge Cases).
  - Model extends `ProjectBaseModel` (project nullable for initiative scope). Forward: create `ai_summaries`. Rollback: drop table.
- **Security:** Generating a shareable summary requires ≥ MEMBER. Shared link is unauthenticated-but-tokened and must never expose IDs of private items beyond aggregate rollup; sanitize AI-generated markdown before persist/render.
- **Dependencies:** Existing cycle/project/initiative models + Copilot LLM plumbing. None on other AI-E# epics.
- **Epic-level acceptance criteria:**
  - Given a populated cycle, When a MEMBER requests a summary, Then markdown + rollup (percent_complete, blockers, at_risk) is returned and optionally persisted with a `share_token`.
  - Given an empty cycle, When summarized, Then a "no activity" markdown with a zeroed rollup is returned.
  - Given a valid `share_token`, When an unauthenticated client GETs the shared endpoint, Then only rollup markdown is returned — no private item IDs.
  - Given an expired/invalid `share_token`, When the shared endpoint is called, Then it returns 404/expired and leaks nothing.
- **Risk tier:** **R1** — new schema + a public (token-gated) read surface; additive and gated, but the shared-link path touches data exposure and must land with leakage tests. Rollback drops the table.
- **Entitlement flag:** `ai_copilot`.

---

## AI-E4 — AI First Drafts / Brief Generation + In-Editor Translation

- **User value:** Authors get a structured "AI Brief" Page (Problem / Solution / Acceptance Criteria) generated from an issue and linked back to it, with regenerate/refine; and the existing editor rephrase popover gains a Translate option with a target-language picker.
- **Scope (in):**
  - `POST .../issues/<issue_id>/generate-brief/` → creates a sectioned `Page` (reuses existing `Page` model, `apps/api/plane/db/models/page.py`), links it to the issue, returns `page_id`; supports regenerate.
  - Extend `POST workspaces/<slug>/rephrase-grammar/` with `task=translate` + `target_language` — **a translate branch in the existing handler, no new model** (PRD Requirement 7).
  - Web: "Generate Brief"/"AI Draft" button in issue detail (links new Page; regenerate/refine controls); extend the editor selection popover with Translate + language picker, inline result, Accept/Cancel.
  - Extend `AI_EDITOR_TASKS` (`apps/web/core/constants/ai.ts` + `packages/constants/src/ai.ts`) and `performEditorTask`/`TTaskPayload` (`ai.service.ts`).
- **Out of scope:** New Wiki document type or model; translation of stored/persisted content (translate operates on editor selection only); brief templates beyond the Problem/Solution/Acceptance-Criteria default.
- **Technical requirements:**
  - Brief generation reuses the `Page` model + issue↔page linking (`ProjectPage` M2M); sanitize AI-generated rich text before persistence (no raw HTML injection — PRD Security line 139).
  - Translate routes through the existing rephrase pipeline; must not break the existing casual/formal scoring (`casual_score`/`formal_score` in `TTaskPayload`).
  - Empty selection or unsupported language → clear validation error, no destructive replace (PRD Edge Cases).
  - Regenerate must not require deleting the old page (open question Q8 → default: regenerate updates/links a new draft, prior page retained unless replaced).
- **Security:** Brief generation requires ≥ MEMBER + project membership. Sanitize all generated content. Fail closed (400) with no provider.
- **Dependencies:** Existing `Page` model + `rephrase-grammar` handler + LLM seam. None on other AI-E# epics (no new schema).
- **Epic-level acceptance criteria:**
  - Given an issue, When a MEMBER requests a brief, Then a sectioned Page is created, linked to the issue, and `page_id` is returned.
  - Given an existing brief, When the user regenerates, Then a new draft is produced without destroying the prior page.
  - Given selected editor text and a target language, When the user accepts a Translate result, Then only the selection is replaced; casual/formal rephrase still works unchanged.
  - Given an empty selection or unsupported language, When Translate is invoked, Then a validation error is shown and nothing is replaced.
- **Risk tier:** **R2** — no new schema (reuses Page); translate is an additive branch; reverts by reverting endpoint/editor task. Content-sanitization path is treated as R0 individually (must have injection tests).
- **Entitlement flag:** `ai_copilot`.

---

## AI-E5 — Build Mode (Project Synthesis + Transactional Apply)

- **User value:** From a plain-language description, Build Mode synthesizes an editable project draft (issues with estimates/priorities/labels/assignee suggestions + a suggested cycle). The user edits, then applies it transactionally — never auto-final.
- **Scope (in):**
  - New `build_project` Copilot mode (extend `COPILOT_MODES`, copilot.py line 37); returns `project_draft {name, description, work_items[] (name, description, estimate, priority, labels[], assignee_suggestion), suggested_cycle}`.
  - `POST workspaces/<slug>/projects/<project_id>/build-project/apply/` — persists an approved/edited draft transactionally (project → issues → cycle membership).
  - Web: `apps/web/core/components/ai/build-mode/` (description input + editable draft tree — issues, estimates, cycle assignment); Cmd+K command-palette entry; `aiCopilotStore.buildDraft` + `applyBuildDraft`; `createBuildDraft`/`applyBuildDraft` on `ai.service.ts`.
  - Extend `TCopilotMode` union in `@plane/types`/`ai.service.ts` with `build_project`.
- **Out of scope:** Auto-finalizing a draft without human apply; cross-project synthesis; generating cycles/initiatives outside the single suggested cycle; non-issue entity types (sub-issue trees beyond what the draft schema defines).
- **Technical requirements:**
  - Apply is transactional (`django.db.transaction.atomic`); mid-apply failure rolls back fully (PRD Testing — transactional rollback test).
  - Missing label/state/member referenced in the draft → **create-or-skip with a per-item warning, never fail the whole apply** (PRD Edge Cases line 147). Invalid/unset `default_state` handled (open question Q7 → skip state assignment with warning rather than failing).
  - Concurrent apply for the same draft is idempotent on a draft token (PRD Edge Cases line 156).
  - LLM quota exhaustion mid-generation → 503 with retry hint; **partial drafts never persisted**.
  - Apply endpoint requires ADMIN/MEMBER (PRD API Contracts line 96).
- **Security:** Apply requires ≥ MEMBER + project membership; every applied draft writes to the audit trail (see AI-E6 audit infra). Guests cannot run build write actions (extend `WRITE_MODES`).
- **Dependencies:** Existing Copilot core, Project/Issue/Cycle models, transaction primitives. Soft-dependency on AI-E6 audit-log infra for apply auditing (can land with a minimal audit write if AI-E6 not yet merged).
- **Epic-level acceptance criteria:**
  - Given a description, When `build_project` runs, Then a non-persisted editable `project_draft` (work_items + suggested_cycle) is returned, not a finalized project.
  - Given an edited draft, When a MEMBER applies it, Then project + issues + cycle membership are persisted in one transaction.
  - Given a draft referencing a non-existent label/assignee, When applied, Then that item is created-or-skipped with a per-item warning and the rest of the apply succeeds.
  - Given a mid-apply failure, When the transaction aborts, Then no partial project/issues persist.
  - Given two concurrent applies of the same draft token, When both run, Then the second is a no-op idempotent.
- **Risk tier:** **R1** — performs multi-entity writes against live workspace data via a new contract; transactional. The build-apply transaction is an untested-critical path treated as **R0 individually** and must land with full rollback/idempotency/graceful-skip coverage before deploy.
- **Entitlement flag:** `ai_copilot`.

---

## AI-E6 — Semantic Actions Rule Engine + Audit Trail

- **User value:** Admins define if-then automations (trigger → conditions → actions) that run in the background on issue lifecycle events — assign, set priority, move to cycle, post to Slack, close, run agent — with a full run history / audit trail.
- **Scope (in):**
  - `AutomationRule` (`apps/api/plane/db/models/automation/rule.py`): `name`, `is_active`, `trigger (choice)`, `conditions JSON`, `actions JSON`, project nullable (=workspace-wide), `created_by`.
  - `AutomationRun`: rule FK, `triggered_by_event`, `status (success|partial|failed)`, `actions_applied JSON`, nullable `error`, entity ref.
  - Audit trail write for every rule run + every agent/connector mutation (immutable `AuditLog`-style entries; reuse existing audit infra if present, else add).
  - CRUD `GET/POST/PATCH/DELETE workspaces/<slug>/automation/rules/` (+ `/<rule_id>/`) — ADMIN.
  - Worker evaluation (Celery, `apps/api/plane/bgtasks/`) on issue created/updated/mentioned/labeled; executes the existing Copilot action allowlist + rule-engine action set.
  - Web: "Automations" settings route (`apps/web/core/.../settings/automations/`) — trigger select → conditions → actions builder; run-history view from `AutomationRun`.
  - Trigger/action enums added to `@plane/constants`.
- **Out of scope:** Arbitrary code execution by rules (actions stay allowlisted — PRD Non-Goals); a second-level agent-specific rule DSL (Q19 — thin first-party layer only); visual flow editor beyond the if-then form.
- **Technical requirements:**
  - Rule-loop safety: per-event execution depth cap + idempotency guard on `AutomationRun` (PRD Edge Cases line 152; Q3).
  - Rules trigger in a background worker and return immediately to the request handler (async task pattern, celery.py).
  - Index `(workspace, is_active, trigger)` for fast dispatch. Forward: two tables + index. Rollback: drop `AutomationRun` then `AutomationRule`; disable via `is_active`/flag **before** reverting worker code.
  - Actions reuse the allowlist concepts from copilot.py (`ISSUE_ACTION_FIELDS`, etc.).
  - Workspace-wide rule (null project) triggering on project events scoped correctly (Q12).
- **Security:** Rule administration requires ADMIN. Every run logged to `AutomationRun` + audit; audit logs never exposed cross-workspace or on public/Space surfaces. Actions cannot exceed the allowlist.
- **Dependencies:** Existing Copilot action allowlist + Celery. Audit infra is established here and reused by AI-E5 (apply), AI-E7 (triage apply), AI-E8 (agents), AI-E9 (connectors).
- **Epic-level acceptance criteria:**
  - Given an active rule (trigger=issue_labeled, action=set_priority), When a matching label is added, Then the action runs in the worker and an `AutomationRun` with status + audit entry is written.
  - Given a rule whose action re-triggers the same rule, When it fires, Then the execution depth cap / idempotency guard prevents an infinite loop.
  - Given a non-ADMIN user, When they attempt rule CRUD, Then the request is rejected.
  - Given conditions that don't match an event, When the event fires, Then no action runs (and per Q10 policy, the no-match outcome is recorded as configured).
- **Risk tier:** **R1** — an automation engine performing background writes against live workspace data; behavior teams build on. Rule-loop safety + audit write are untested-critical paths treated as **R0 individually**; must land with loop-cap/idempotency/audit tests. Disable-by-flag is the first-line rollback.
- **Entitlement flag:** `workflows_approvals`.

---

## AI-E7 — Intake Auto-Triage (Suggestion Queue)

- **User value:** New intake items get AI-suggested labels, assignee, priority, and project routing surfaced in a human-review queue with confidence — nothing reaches the backlog without a human approve/correct.
- **Scope (in):**
  - `TriageSuggestion` (extend `apps/api/plane/db/models/intake.py`): `intake_issue FK (1:1)`, `suggested_labels JSON`, nullable `suggested_assignee FK`, `suggested_priority`, nullable `suggested_project FK`, `confidence float`, `status (pending|applied|rejected)`.
  - Async classifier task (Celery) on new `IntakeIssue` producing a `TriageSuggestion`.
  - `GET workspaces/<slug>/intake/<intake_id>/triage-suggestions/`, `POST .../<suggestion_id>/apply/` (apply only on human approve).
  - Web: review-queue badges (AI-suggested label/assignee/priority + confidence); Approve/Correct buttons; nothing auto-applied.
- **Out of scope:** Auto-accepting suggestions without human action; changing the existing manual triage flow; modifying `IntakeIssue` fields/status choices.
- **Technical requirements:**
  - Extends `intake.py` with a **new table referencing existing `IntakeIssue`** — forward adds table only; rollback drops `TriageSuggestion` only, leaving `IntakeIssue` intact (PRD Data Models line 84).
  - Classifier runs through the LLM seam; fail closed if no provider (queue reverts to manual).
  - Confidence interpretation (Q13): low-confidence (`< 0.5`) surfaces as a low-confidence badge in `pending`, still requires human approval; never auto-rejected silently.
  - Apply writes to the audit trail (AI-E6 infra).
- **Security:** Reads require workspace/project membership; apply requires ≥ MEMBER. Suggested assignee/project restricted to valid members/projects in scope. Sanitize any imported text before persistence.
- **Dependencies:** Existing `Intake`/`IntakeIssue` models + Celery + LLM seam. Soft-dependency on AI-E6 audit infra; can also receive items from AI-E9 (Slack/Sentry inbound) when those land.
- **Epic-level acceptance criteria:**
  - Given a new IntakeIssue, When the async classifier completes, Then a `TriageSuggestion` (labels/assignee/priority/project/confidence, status=pending) is created.
  - Given a pending suggestion, When a MEMBER approves it, Then the suggestion is applied, `status=applied`, and an audit entry is written.
  - Given no LLM provider, When an IntakeIssue arrives, Then no suggestion is produced and manual triage works unchanged.
  - Given a low-confidence suggestion, When viewed in the queue, Then it shows a low-confidence badge and still requires human approval.
- **Risk tier:** **R1** — new schema + a classifier that proposes (but does not auto-apply) writes; additive, rollback drops only the new table. Apply path audited and treated as R0 individually.
- **Entitlement flag:** `intake` (queue surface) + `ai_copilot` (suggestion generation).

---

## AI-E8 — Automation Agents (Assignment + @mention)

- **User value:** A first-party automation agent can be assigned to a work item or `@AgentName`-mentioned in a comment; the mention/assignment enqueues an allowlisted Copilot-action run honoring a read-only vs write guardrail, with the agent's response threaded inline and every action audited.
- **Scope (in):**
  - `AutomationAgent` (`apps/api/plane/db/models/automation/agent.py`): `name (unique per workspace)`, `scope (read_only|write)`, `allowed_actions JSON`, `is_active`.
  - `AgentMention`: agent FK, `source_type (comment|issue)`, `source_id`, `status`, nullable `response`.
  - CRUD `GET/POST/PATCH/DELETE workspaces/<slug>/automation/agents/` (+ `/<agent_id>/`) — ADMIN.
  - Mention/assignment enqueues a Copilot-action run (worker) honoring the agent guardrail; response rendered inline.
  - Web: Agents section in the assignee dropdown + `@AgentName` mention in comment editor; guardrail (read-only/write) shown on the agent chip; agent join/response inline in the thread.
- **Out of scope:** A proprietary ADK clone; autonomous code execution; agents creating other agents; agents with actions beyond the allowlist (PRD Non-Goals line 47, 51).
- **Technical requirements:**
  - Built on the AI-E6 rule-engine action layer (PRD Milestone M8 "on top of M6 action layer").
  - `read_only` scope **physically cannot invoke write actions** — validated server-side, not UI-only (PRD Security line 137).
  - Loop guard: agent actions must not infinitely re-trigger rules (Q4).
  - Agent removed/deactivated while assigned or mid-run → run aborts, audit notes "agent unavailable," assignment cleared gracefully (PRD Edge Cases line 153).
  - Unique `(workspace, lower(name))`. Forward: tables + unique index. Rollback: drop `AgentMention` then `AutomationAgent`; deactivate agents before reverting mention handling.
- **Security:** Agent administration requires ADMIN. `read_only` enforcement server-side. Every agent action audited. Agents never exposed on public/Space surfaces.
- **Dependencies:** **AI-E6** (rule-engine action layer + audit) — hard dependency. Existing comment/issue models + worker.
- **Epic-level acceptance criteria:**
  - Given a `write`-scope agent mentioned in a comment, When the mention is processed, Then it executes an allowlisted action and threads its response inline with an audit entry.
  - Given a `read_only`-scope agent, When it attempts a write action, Then the action is rejected server-side regardless of UI state.
  - Given an agent deactivated mid-run, When the run continues, Then it aborts gracefully, the audit notes "agent unavailable," and any assignment is cleared.
  - Given a non-ADMIN user, When they attempt agent CRUD, Then the request is rejected.
- **Risk tier:** **R1** — agents perform writes; the read_only write-guardrail and loop guard are untested-critical paths treated as **R0 individually** and must land with rejection/loop tests. Deactivate-then-revert rollback.
- **Entitlement flag:** `workflows_approvals`.

---

## AI-E9 — Connectors: Slack (in/out), Sentry, and MCP Server

- **User value:** Slack channels can feed intake and receive scheduled summaries + risk/overdue alerts; Sentry alerts auto-create classified issues; and an open MCP server lets external agents create/search/update Plane items via a scoped API token — every action audited.
- **Scope (in):**
  - **Slack:** `SlackChannelBinding` (extend `apps/api/plane/db/models/integration/slack.py`): `slack_project_sync FK`, `channel_id`, `direction (inbound|outbound)`, nullable `schedule (cron)`, `kind (request|summary|alert)`. Inbound webhook `POST workspaces/<slug>/integrations/slack/events/` (signature-verified) → `IntakeIssue`. Scheduled (daily/weekly) cycle summaries posted out; risk/overdue alerts to a configured channel. Settings UI to bind channels + schedules + alert channel.
  - **Sentry:** `SentryProjectSync` (`apps/api/plane/db/models/integration/sentry.py`, mirrors `SlackProjectSync`): `webhook_secret (SecretField, never logged)`, `severity_map JSON`, `default_assignee`. Inbound `POST workspaces/<slug>/integrations/sentry/webhook/` (HMAC against secret) → classified issue with stack trace + severity→priority mapping + service/release link. Settings UI to register webhook + severity map.
  - **MCP server:** standalone deployable (`apps/mcp/` or `packages/mcp-server`) exposing `create_issue`, `search_backlog`, `get_cycle_status`, `update_issue`; authenticates with a Plane personal API token via `/api/v1/` routes; every call writes to the Plane audit trail.
  - Register `SentryProjectSync`/`SlackChannelBinding` in `apps/api/plane/db/models/integration/__init__.py`.
  - Web: workspace settings → Connectors tab (Slack panel + Sentry panel) under `integrations`.
- **Out of scope:** Rebuilding GitHub/GitLab sync (PRESENT); Slack OAuth re-install flow (reuse existing `SlackProjectSync` token); MCP write actions beyond the four named tools; new billing/credit metering.
- **Technical requirements:**
  - Webhook hardening: Slack signature verification + Sentry HMAC mandatory; reject unsigned/replayed; rate-limit inbound webhooks (PRD Security line 141). Reuse the fork's webhook-signature pattern (HMAC-SHA256, timing-safe compare, `SecretField`).
  - Secrets stored via Secret Manager / K8s secrets, **never plaintext columns committed with values** (PRD Data Models line 88).
  - Webhook for an unbound channel/project → ignored, logged at info, **not 500** (PRD Edge Cases line 154).
  - MCP token scoped to a single user's workspace permissions; tool calls cannot exceed the key holder's role (PRD Security line 142); the MCP server is a separate deployable that can be taken offline independently.
  - Sentry `severity_map` user-configurable in settings (Q18, e.g. `{fatal: urgent, error: high, warning: medium}`).
  - Slack schedule syntax: standard cron via Celery beat (Q17). Sanitize all imported Slack/Sentry content before persist/render.
  - Forward: add `SlackChannelBinding` + `SentryProjectSync` tables. Rollback: disable bindings, revert webhooks; drop new tables leaving `SlackProjectSync` intact; MCP server removed independently.
- **Security:** Connector administration requires ADMIN. Webhook secrets never logged. Connector secrets never exposed cross-workspace or on public surfaces. MCP audited per call. Imported content sanitized.
- **Dependencies:** Existing `SlackProjectSync` + `WorkspaceIntegration`; AI-E6 audit infra (mutation auditing); AI-E7 intake (Slack/Sentry inbound → IntakeIssue → triage). Outbound summaries reuse AI-E3 summary generation.
- **Epic-level acceptance criteria:**
  - Given a valid Slack-signed inbound event for a bound channel, When received, Then an `IntakeIssue` is created (and a triage suggestion enqueued if AI-E7 present).
  - Given an invalid or replayed signature, When a webhook arrives, Then it is rejected without side effects.
  - Given a Sentry alert with a mapped severity, When the HMAC verifies, Then a classified issue is created with the mapped priority and service/release link.
  - Given a webhook for an unbound channel/project, When received, Then it is ignored and logged at info (no 500).
  - Given an MCP API token, When a tool call is made, Then it cannot exceed the key holder's role and the call is written to the audit trail.
- **Risk tier:** **R1** — connector webhooks + an externally reachable MCP server performing writes; webhook signature verification and MCP token-scope enforcement are untested-critical paths treated as **R0 individually** and must land with valid/invalid/replayed + token-scope tests. Bindings disable-first rollback; MCP is independently deployable.
- **Entitlement flag:** `integrations` (connectors + MCP).

---

## Dependency-Ordered Epic List

Order reflects PRD milestones M1–M9 (lowest-risk/additive first; later epics build on earlier infra):

1. **AI-E1 — Ask Mode Semantic Retrieval + Context Assist** (M1) — establishes the embedding/similarity infra; no epic dependencies.
2. **AI-E2 — Automatic Duplicate Detection** (M2) — reuses AI-E1 similarity (degrades to keyword without it).
3. **AI-E3 — One-Click Summaries + Shareable Link** (M3) — independent; summary generation reused later by AI-E9 outbound.
4. **AI-E4 — AI Brief Generation + In-Editor Translation** (M4) — independent; no new schema.
5. **AI-E5 — Build Mode (synthesis + transactional apply)** (M5) — soft-depends on AI-E6 audit (can land with minimal audit write).
6. **AI-E6 — Semantic Actions Rule Engine + Audit Trail** (M6) — establishes the rule-action layer + audit infra reused by E5/E7/E8/E9.
7. **AI-E7 — Intake Auto-Triage** (M7) — uses AI-E6 audit; feeds from AI-E9 inbound.
8. **AI-E8 — Automation Agents (assignment + @mention)** (M8) — **hard depends on AI-E6** action layer + audit.
9. **AI-E9 — Connectors (Slack in/out, Sentry) + MCP Server** (M9) — uses AI-E6 audit, AI-E7 intake, AI-E3 summaries; MCP is an independently deployable artifact.

Note: AI-E6 (audit + action layer) is foundational for E5/E7/E8/E9 even though the PRD lists it at M6 for risk-sequencing reasons. Implementations of E5/E7 that land before E6 must include a minimal audit write to be replaced by the AI-E6 audit infra when it merges.
