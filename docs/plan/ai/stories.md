# Plane AI (Ask/Build modes, Connectors, semantic actions) — User Stories

> Source: [docs/prd-ai-2026-06-07.md](../../prd-ai-2026-06-07.md). Stable ID prefix: **AI**.
> Epics map to the nine PRD workstreams / milestones (M1–M9). Each epic ID is referenced as `AI-E<n>`; stories as `AI-S<n>`; cross-referenced by ID.
>
> **Epic index** (titles, for cross-reference until `epics.md` lands):
> - **AI-E1** — Ask Mode semantic upgrade + Context Assist (M1)
> - **AI-E2** — Automatic Duplicate Detection (M2)
> - **AI-E3** — One-Click Summaries (M3)
> - **AI-E4** — AI Brief/Wiki + In-Editor Translation (M4)
> - **AI-E5** — Build Mode project synthesis (M5)
> - **AI-E6** — Semantic Actions rule engine + audit (M6)
> - **AI-E7** — Intake auto-triage (M7)
> - **AI-E8** — Agents (assignment + @mention) (M8)
> - **AI-E9** — Connectors (Slack in/out, Sentry) + MCP server (M9)
>
> **Cross-cutting conventions** applied to every story (not repeated per AC):
> - Acceptance criteria use Given/When/Then; every story includes an authorization-failure scenario and an empty/edge case.
> - All writes are workspace/project-scoped and permission-checked server-side (`allow_permission` + `WorkspaceMember`/`ProjectMember` resolution, mirroring `copilot.py:64,83`).
> - AI generation requires `isSelfHostedFeatureEnabled('ai_copilot')`; connectors require `integrations`; rules/agents require `workflows_approvals`. Disabled flag or unconfigured provider → fail-closed (UI disabled state, API 400 `LLM provider … required`).
> - Roles: **workspace admin** (ADMIN), **project member/lead** (MEMBER), **guest** (GUEST), **viewer** (read-only WorkspaceMember). "Lead" = MEMBER with project-lead designation; called out only where it changes behavior.

---

## AI-E1 — Ask Mode semantic upgrade + Context Assist

### AI-S1 (epic AI-E1) — Semantic (vector) evidence retrieval behind keyword fallback
- **Story**: As a project member, I want Ask Mode answers to rank evidence by semantic relevance when embeddings exist so that I get better-matched issues/pages without changing my workflow when they don't.
- **Acceptance criteria**:
  - Given `WORKSPACE_AI_EMBEDDINGS_ENABLED` is true and `IssueEmbedding` rows exist for the project, When a member asks a question, Then evidence is ranked by cosine similarity over `IssueEmbedding` and the response is tagged `retrieval=relevance`.
  - Given embeddings are absent or every candidate's `content_hash` is stale, When a member asks, Then the existing `icontains` keyword path runs unchanged and the response is tagged `retrieval=keyword`.
  - Given a guest with no workspace membership for the target workspace, When they call the messages endpoint, Then the request is rejected (403) before any retrieval runs.
  - Given a workspace with zero issues/pages, When a member asks, Then the answer returns an empty-evidence result (no error, no crash) and falls back to keyword path.
- **Size**: M. **Priority**: P1. **Depends on**: [AI-E1].

### AI-S2 (epic AI-E1) — Lazy embedding generation on issue write
- **Story**: As a workspace admin, I want issue embeddings to be (re)generated lazily when an issue's content changes so that semantic search stays fresh without a GPU or mandatory backfill.
- **Acceptance criteria**:
  - Given embeddings are enabled and an issue's `name`+`description_html` changes (new `content_hash`), When the issue is saved, Then an `IssueEmbedding` upsert is enqueued and stored with the new `content_hash` and `model_name`.
  - Given an issue is saved with no content change (same `content_hash`), When the save completes, Then no embedding regeneration is enqueued.
  - Given no LLM/embedding provider is configured, When an issue is saved, Then the save succeeds and embedding generation is silently skipped (fail-closed, keyword path remains).
  - Given the embedding provider returns a quota/5xx error mid-generation, When the task runs, Then the prior embedding row is left intact (no partial write) and the failure is logged without secrets.
- **Size**: M. **Priority**: P2. **Depends on**: [AI-S1].

### AI-S3 (epic AI-E1) — Zero-setup Context-Aware Assist for the current entity
- **Story**: As a project member, I want a one-keystroke (Cmd+K) assist panel that surfaces the current page's blockers, at-risk items, and recent changes so that I get context without starting a conversation.
- **Acceptance criteria**:
  - Given a member is viewing an issue/cycle/project, When they invoke `POST copilot/context-assist/` with `{entity_type, entity_id}`, Then the response includes `blockers[]`, `at_risk[]`, `recent_changes[]`, and `suggested_follow_ups[]` scoped to that entity.
  - Given a guest who lacks membership on the entity's project, When they call context-assist, Then the request is rejected (403) and no entity data is returned.
  - Given `entity_type`/`entity_id` references an entity in another workspace, When called, Then it is rejected (404/403) and never leaks cross-workspace data.
  - Given the entity has no blockers/at-risk/recent activity, When called, Then each list returns empty and the panel shows a "nothing to flag" empty state.
- **Size**: M. **Priority**: P1. **Depends on**: [AI-E1].

---

## AI-E2 — Automatic Duplicate Detection

### AI-S4 (epic AI-E2) — Inline duplicate check on issue create
- **Story**: As a project member, I want similar existing issues surfaced as I type a new issue's title/description so that I avoid creating duplicates.
- **Acceptance criteria**:
  - Given a member is typing in the issue-create form, When `POST issues/duplicate-check/` is called with `{title, description, project_id}`, Then it returns ranked `candidates[]` of `{issue_id, score, matched_on[]}` for that project only.
  - Given a candidate's `score ≥ DUPLICATE_BLOCK_THRESHOLD`, When results render, Then `high_confidence=true` and the form shows a blocking warning with a "Create anyway" override.
  - Given a guest without project membership, When they call duplicate-check, Then the request is rejected (403) and no candidate IDs are returned.
  - Given a brand-new project with an empty backlog, When duplicate-check is called, Then it returns empty `candidates[]` and never blocks submission.
- **Size**: M. **Priority**: P1. **Depends on**: [AI-E1] (reuses embedding/keyword retrieval; degrades to keyword).

### AI-S5 (epic AI-E2) — Transparent match scoring and override audit
- **Story**: As a project lead, I want to see why each match was flagged and have overrides recorded so that the team trusts the duplicate signal.
- **Acceptance criteria**:
  - Given duplicate candidates are returned, When they render, Then each shows a score chip and `matched_on[]` (e.g., title/description) so the basis is transparent.
  - Given a member overrides a high-confidence block and creates the issue, When the issue is created, Then the override is recorded (audit/event) with the matched candidate IDs.
  - Given a viewer (read-only) attempts to submit a create after override, When the create is attempted, Then it is rejected on the create endpoint (not duplicate-check) by role check.
  - Given duplicate-check is called with an empty/whitespace title and empty description, When invoked, Then it returns empty candidates (no query executed) rather than erroring.
- **Size**: S. **Priority**: P2. **Depends on**: [AI-S4].

---

## AI-E3 — One-Click Summaries

### AI-S6 (epic AI-E3) — Generate cycle/project/initiative digest
- **Story**: As a project member, I want a one-click digest of a cycle/project/initiative so that I can quickly understand status without reading every item.
- **Acceptance criteria**:
  - Given a member opens a cycle header, When they trigger `POST cycles/<id>/summarize/`, Then the response returns markdown plus `rollup {percent_complete, blockers[], at_risk[]}` for that cycle.
  - Given the same pattern for `projects/<id>/summarize/` and `initiatives/<id>/summarize/`, When triggered by a member, Then each returns markdown + rollup scoped to that entity.
  - Given a guest or non-member of the project, When they trigger summarize, Then the request is rejected (403) and no summary is generated.
  - Given an empty cycle/project (no work items or activity), When summarize is triggered, Then it returns "no activity" markdown with a zeroed rollup (not an error).
- **Size**: M. **Priority**: P1. **Depends on**: [AI-E1] (LLM plumbing).

### AI-S7 (epic AI-E3) — Persist and share a summary via signed token
- **Story**: As a project lead, I want to create a shareable link to a digest so that stakeholders without an account can read the rollup.
- **Acceptance criteria**:
  - Given a member generates a summary, When they choose "Copy share link", Then an `AISummary` is persisted with a random `share_token` and the link is returned.
  - Given an unauthenticated visitor with a valid `share_token`, When they `GET summaries/shared/<share_token>/`, Then they receive rollup markdown only — never private item IDs or unsanitized content.
  - Given a guest attempts to create (not read) a shared summary, When they call the summarize/share endpoint, Then it is rejected (≥ MEMBER required for share creation).
  - Given an invalid, revoked, or expired `share_token`, When the shared read endpoint is hit, Then it returns 404 (not 500) and leaks nothing about the workspace.
- **Size**: M. **Priority**: P2. **Depends on**: [AI-S6].

---

## AI-E4 — AI Brief/Wiki + In-Editor Translation

### AI-S8 (epic AI-E4) — Generate a structured Brief page for an issue
- **Story**: As a project member, I want to generate a structured brief (Problem / Solution / Acceptance Criteria / Notes) for an issue so that I start from a real draft instead of a blank page.
- **Acceptance criteria**:
  - Given a member is in issue detail, When they trigger `POST issues/<id>/generate-brief/`, Then a sectioned `Page` is created, linked to the issue, and `page_id` is returned.
  - Given AI-generated brief content, When it is persisted and rendered, Then rich text is sanitized (no raw HTML injection) before save and display.
  - Given a guest without project membership, When they call generate-brief, Then it is rejected (403) and no page is created.
  - Given a brief already exists for the issue, When the member chooses "Regenerate", Then a fresh draft is produced without silently destroying the prior page (regenerate/refine, not blind overwrite).
- **Size**: M. **Priority**: P1. **Depends on**: [AI-E1].

### AI-S9 (epic AI-E4) — In-editor translation as a rephrase task
- **Story**: As a project member, I want to translate selected editor text into a target language from the existing rephrase popover so that I can localize content inline.
- **Acceptance criteria**:
  - Given a member selects text and opens the rephrase popover, When they pick "Translate" + a `target_language`, Then `performEditorTask(task='translate', target_language)` routes through the extended `rephrase-grammar` handler and returns translated text.
  - Given the member sees the translated result, When they click Accept, Then the selection is replaced; When they click Cancel, Then the original text is untouched (replace only on Accept).
  - Given a guest blocked from write modes (per `WRITE_MODES`), When they invoke translate, Then it is rejected server-side.
  - Given an empty selection or an unsupported/blank `target_language`, When translate is invoked, Then a clear validation error is shown and no destructive replace occurs.
- **Size**: S. **Priority**: P1. **Depends on**: [AI-E1].

---

## AI-E5 — Build Mode project synthesis

### AI-S10 (epic AI-E5) — Synthesize an editable project draft from a description
- **Story**: As a project member, I want to describe a project in natural language and get an editable draft hierarchy (issues, estimates, suggested cycle) so that I can scaffold work quickly.
- **Acceptance criteria**:
  - Given a member submits a description with `mode=build_project`, When the copilot responds, Then it returns `project_draft {name, description, work_items[]{name, description, estimate, priority, labels[], assignee_suggestion}, suggested_cycle}` and never auto-finalizes anything.
  - Given the returned draft, When rendered in the build-mode tree, Then the member can edit names/estimates/priority/assignee/labels and cycle assignment before applying.
  - Given a guest (blocked from write modes), When they request `build_project`, Then it is rejected server-side.
  - Given the LLM provider is unconfigured, When `build_project` is requested, Then the endpoint returns 400 `LLM provider … required` and the UI shows a disabled state (fail-closed).
- **Size**: L. **Priority**: P1. **Depends on**: [AI-E1].

### AI-S11 (epic AI-E5) — Transactionally apply an approved build draft
- **Story**: As a project lead, I want to apply an edited build draft so that the project, issues, and cycle membership are persisted atomically.
- **Acceptance criteria**:
  - Given an approved draft, When a MEMBER+ calls `POST projects/<project_id>/build-project/apply/`, Then project → issues → cycle membership are persisted in a single transaction and the new IDs are returned.
  - Given a draft references labels/states/members that don't exist in the target project, When applied, Then missing references are create-or-skipped with a per-item warning and the apply still succeeds (never fails the whole transaction on a missing label).
  - Given a guest or viewer, When they call apply, Then it is rejected (≥ MEMBER required) and nothing is persisted.
  - Given two concurrent applies for the same draft token, When both run, Then the second is an idempotent no-op (no duplicate project/issues created).
- **Size**: L. **Priority**: P1. **Depends on**: [AI-S10].

---

## AI-E6 — Semantic Actions rule engine + audit

### AI-S12 (epic AI-E6) — Author and manage automation rules
- **Story**: As a workspace admin, I want to create if-then automation rules (trigger → conditions → actions) so that routine work-item handling happens automatically.
- **Acceptance criteria**:
  - Given an admin opens the Automations settings, When they `POST automation/rules/` with `{trigger, conditions JSON, actions JSON}`, Then an `AutomationRule` is created scoped to the workspace (project nullable = workspace-wide).
  - Given an admin lists/edits/deletes rules, When they call the CRUD endpoints, Then changes apply only within their workspace and are gated by `workflows_approvals`.
  - Given a non-admin (member/guest), When they attempt rule CRUD, Then the request is rejected (ADMIN required).
  - Given a rule with an empty `actions[]` or an action not in the allowlist, When saved, Then it is rejected with a validation error (no inert/unsafe rule persisted).
- **Size**: M. **Priority**: P1. **Depends on**: [AI-E1, AI-E6].

### AI-S13 (epic AI-E6) — Evaluate rules on issue lifecycle signals with full audit
- **Story**: As a workspace admin, I want active rules evaluated in a worker on issue created/updated/mentioned/labeled signals so that allowlisted actions run reliably and every run is recorded.
- **Acceptance criteria**:
  - Given an active rule whose trigger and conditions match an issue event, When the worker evaluates it, Then the allowlisted action(s) execute and an `AutomationRun {status, actions_applied, entity ref}` plus audit entry are written.
  - Given a rule evaluates but no conditions match, When the worker runs, Then no action executes and the outcome is recorded per the configured audit granularity (no silent state changes).
  - Given an action fails mid-run (e.g., target invalid), When the worker completes, Then `AutomationRun.status=partial|failed` with `error` set and partial actions recorded — no exception leaks secrets.
  - Given rule A's action triggers an event that would re-trigger rule A, When evaluated, Then a per-event execution depth cap + idempotency guard stops the loop (bounded runs, deduped on rule+entity+event).
- **Size**: L. **Priority**: P0. **Depends on**: [AI-S12].

---

## AI-E7 — Intake auto-triage

### AI-S14 (epic AI-E7) — AI triage suggestions for new intake items
- **Story**: As a project lead, I want new intake issues automatically classified with suggested labels/assignee/priority/project so that triage is faster.
- **Acceptance criteria**:
  - Given a new `IntakeIssue` is created and AI is enabled, When the async classifier runs, Then a `TriageSuggestion {suggested_labels, suggested_assignee, suggested_priority, suggested_project, confidence}` is produced and surfaced in the review queue.
  - Given no provider is configured, When an intake issue arrives, Then no suggestion is produced and the item appears in the manual queue unchanged (fail-closed).
  - Given a guest/non-member of the intake's project, When they `GET intake/<id>/triage-suggestions/`, Then the request is rejected (403).
  - Given an intake issue with empty/garbage content, When classified, Then a low-`confidence` suggestion (or none) is returned and surfaced with a low-confidence badge — nothing is auto-applied.
- **Size**: M. **Priority**: P1. **Depends on**: [AI-E1].

### AI-S15 (epic AI-E7) — Human-approved application of triage suggestions
- **Story**: As a project member, I want to approve or correct an AI triage suggestion so that nothing reaches the backlog without a human decision.
- **Acceptance criteria**:
  - Given a pending suggestion, When a MEMBER+ calls `POST .../<suggestion_id>/apply/` (Approve), Then the labels/assignee/priority/project are applied to the issue and the suggestion `status=applied`.
  - Given a member corrects values before applying, When applied, Then the corrected values (not the AI values) are persisted and the suggestion is marked applied.
  - Given a guest or viewer attempts apply, When called, Then it is rejected (≥ MEMBER required) and the suggestion stays `pending`.
  - Given a suggestion already `applied` or `rejected`, When apply is called again, Then it is an idempotent no-op (no double application).
- **Size**: S. **Priority**: P1. **Depends on**: [AI-S14].

---

## AI-E8 — Agents (assignment + @mention)

### AI-S16 (epic AI-E8) — Define automation agents with read/write guardrails
- **Story**: As a workspace admin, I want to define automation agents with a scope (read-only/write) and an allowed-actions list so that AI actors operate within hard limits.
- **Acceptance criteria**:
  - Given an admin creates an `AutomationAgent {name, scope, allowed_actions[]}`, When saved, Then the name is unique per workspace (case-insensitive) and it is gated by `workflows_approvals`.
  - Given a `read_only` agent, When it is invoked to perform a write action, Then the action is rejected server-side (physical guardrail, not UI-only).
  - Given a non-admin attempts agent CRUD, When called, Then it is rejected (ADMIN required).
  - Given a duplicate agent name (same workspace, different case), When created, Then it is rejected with a uniqueness validation error.
- **Size**: M. **Priority**: P1. **Depends on**: [AI-E6].

### AI-S17 (epic AI-E8) — Assign and @mention agents on work items
- **Story**: As a project member, I want to assign an agent to an issue or `@mention` it in a comment so that it runs its allowlisted actions and threads a response.
- **Acceptance criteria**:
  - Given a member assigns an agent (pseudo-assignee) or `@AgentName`-mentions it in a comment, When saved, Then an `AgentMention {source_type, source_id, status}` is enqueued and a Copilot-action run executes honoring the agent's scope; all actions are audited.
  - Given the agent responds, When the run completes, Then its response is rendered inline in the thread and the agent chip shows its scope badge (read-only/write).
  - Given a guest attempts to mention/assign an agent that performs writes, When invoked, Then the write is rejected (guest blocked from write modes / agent guardrail).
  - Given an agent is deactivated or removed while assigned or mid-run, When the run proceeds, Then it aborts gracefully, the audit notes "agent unavailable," and the assignment is cleared without error.
- **Size**: L. **Priority**: P1. **Depends on**: [AI-S16, AI-S13].

---

## AI-E9 — Connectors (Slack in/out, Sentry) + MCP server

### AI-S18 (epic AI-E9) — Bind Slack channels for inbound/outbound flows
- **Story**: As a workspace admin, I want to bind Slack channels for inbound intake, outbound summaries, and alerts so that the team works from Slack.
- **Acceptance criteria**:
  - Given an admin opens the Slack connector settings, When they create a `SlackChannelBinding {channel_id, direction, schedule, kind}`, Then it is persisted under the workspace's `SlackProjectSync` and gated by `integrations`.
  - Given a signed inbound Slack event for a bound channel, When `POST integrations/slack/events/` is hit, Then the signature is verified and an `IntakeIssue` is created (rate-limited); unsigned/replayed requests are rejected.
  - Given a non-admin attempts to create/edit a channel binding, When called, Then it is rejected (ADMIN required) and no secret is exposed.
  - Given a Slack event arrives for a channel/project no longer bound, When received, Then it is ignored and logged at info (no 500).
- **Size**: L. **Priority**: P1. **Depends on**: [AI-E7] (inbound → intake), [AI-E1].

### AI-S19 (epic AI-E9) — Scheduled Slack summaries and risk/overdue alerts
- **Story**: As a project lead, I want scheduled cycle summaries and risk/overdue alerts posted to Slack so that the team stays informed without opening Plane.
- **Acceptance criteria**:
  - Given an outbound `summary` binding with a daily/weekly schedule, When the scheduler fires, Then a cycle summary is posted to the bound channel.
  - Given an `alert` binding, When an issue becomes overdue/at-risk, Then a risk alert is posted to the configured alert channel.
  - Given `integrations` is disabled or no LLM provider is configured, When the scheduler fires, Then no post is attempted and the skip is logged (fail-closed).
  - Given a binding whose channel was deleted in Slack, When a scheduled post fails, Then the failure is handled gracefully (logged, no crash) and other bindings still run.
- **Size**: M. **Priority**: P2. **Depends on**: [AI-S18, AI-E3].

### AI-S20 (epic AI-E9) — Sentry webhook → classified, linked issue
- **Story**: As a workspace admin, I want Sentry alerts to auto-create classified issues linked to service/release so that incidents land in Plane with the right priority.
- **Acceptance criteria**:
  - Given an admin registers a `SentryProjectSync {webhook_secret, severity_map, default_assignee}`, When `POST integrations/sentry/webhook/` arrives, Then the HMAC against `webhook_secret` is verified before any processing.
  - Given a verified Sentry alert, When processed, Then an issue is created with the sanitized stack trace, `severity→priority` mapping applied, and a service/release link; the payload is sanitized before persistence.
  - Given an unsigned, replayed, or HMAC-mismatched request, When received, Then it is rejected (401/403) and nothing is created.
  - Given a Sentry webhook for a project with no `SentryProjectSync` binding, When received, Then it is ignored and logged at info (no 500), and the secret is never logged.
- **Size**: M. **Priority**: P1. **Depends on**: [AI-E7] (optional async triage), [AI-E1].

### AI-S21 (epic AI-E9) — MCP server exposing scoped, audited Plane tools
- **Story**: As a developer/admin, I want a standalone MCP server exposing Plane create/search/status/update tools authenticated by my personal API token so that external agents act within my permissions.
- **Acceptance criteria**:
  - Given a valid personal API token, When an MCP client calls `create_issue`, `search_backlog`, `get_cycle_status`, or `update_issue`, Then each maps to the token-scoped `/api/v1/` endpoint and every call writes to the Plane audit trail.
  - Given a token whose holder has GUEST/viewer role, When a write tool (`create_issue`/`update_issue`) is called, Then it is rejected — tool calls cannot exceed the key holder's role.
  - Given an invalid, revoked, or cross-workspace token, When any tool is called, Then it is rejected (401/403) and no Plane data is returned.
  - Given a `search_backlog` call against a workspace with an empty backlog, When executed, Then it returns an empty result set (no error), and the call is still audited.
- **Size**: L. **Priority**: P2. **Depends on**: [AI-E6] (audit trail), [AI-E5] (reused create/search endpoints).
