# Executive Summary

Expand Plane Copilot into a Vertex Gemini-first workspace assistant. V1 supports grounded answers, issue-context subtask drafts, permission-scoped workspace evidence, persistent conversation history, and allowlisted auto-applied issue actions.

# Current Rollout Evidence

- Current production is verified at commit
  `254013b7228bd39b7ac1645052fbbb48fb62f0c5` on tag
  `preview-254013b7228b`.
- `Plane CI/CD` run `27503184003` completed successfully, including the GKE
  migration job. The migration job `plane-app-api-migrate-254013b7228b`
  completed with no pending migrations.
- Code Quality runs `27503183507` and `27503183488` completed successfully, and
  GitHub reports `0` open code-scanning alerts.
- The Copilot feature rollout baseline remains
  `0b80aadd9610d2446f835d06c872c4283b6ddd83` / `preview-0b80aadd9610`.
- Live instance config reports `has_llm_configured=true` from
  `GET https://app.manut.xyz/api/instances/`.

# Business Goals

- Let Manut workspace users ask operational questions without manually searching projects, comments, pages, and activity.
- Let issue owners turn natural-language commands into safe Plane issue updates.
- Keep Copilot useful inside the existing issue side panel before building broader app-wide entry points.

# Technical Goals

- Prefer Vertex AI Gemini when `LLM_PROVIDER=vertexai`.
- Retrieve evidence across all projects the user can read, with optional issue context pinned first.
- Persist Copilot conversations and messages per workspace/user.
- Apply only allowlisted actions through existing Plane serializers and permission checks.
- Expose recent conversation history in the Copilot panel.

# Requirements

- `POST /api/workspaces/:slug/copilot/messages/` accepts `conversation_id`, `message`, `mode`, `project_id`, and `issue_id`.
- Modes are `auto`, `answer`, `draft_subtasks`, and `command`.
- Guests can ask read-only questions but cannot run write commands or draft-subtask write flows.
- Supported command actions are `create_issue`, `update_issue`, `set_priority`, `set_state`, `assign_user`, `unassign_user`, and `create_label`.
- Unsupported, destructive, admin, billing, permission, import, and external side-effect actions are rejected.
- `GET /api/workspaces/:slug/copilot/conversations/` returns recent user conversations and messages.

# Non-Goals

- No delete/archive commands.
- No cross-workspace evidence.
- No autonomous external integrations.
- No global app launcher beyond the existing Copilot panel.

# Architecture

- The API endpoint validates workspace/project access, retrieves evidence, calls the configured LLM, validates action plans, executes plans in one transaction, and persists the assistant response.
- Vertex calls use `google.genai` with `response_mime_type=application/json` and a Gemini-compatible response schema.
- OpenAI-compatible fallback uses JSON schema output and nullable command fields.
- The web service owns typed Copilot request/response contracts.
- The Copilot panel owns prompt mode selection, recent history display, response citations, applied action links, and manual subtask application.

# Data Models

- `CopilotConversation`: workspace, user, title, and `last_message_at`.
- `CopilotMessage`: conversation, workspace, user, optional project/issue, mode, prompt, answer, citations, actions, and action results.

# API Contracts

## `POST /api/workspaces/:slug/copilot/messages/`

```json
{
  "conversation_id": "uuid-or-null",
  "message": "Create a child issue for launch QA",
  "mode": "command",
  "project_id": "uuid",
  "issue_id": "uuid"
}
```

Returns:

```json
{
  "conversation_id": "uuid",
  "mode": "command",
  "answer": "I created the launch QA work item.",
  "citations": [],
  "subtask_draft": null,
  "actions": [{ "type": "create_issue", "status": "applied" }],
  "action_results": [{ "type": "create_issue", "status": "applied", "entity_id": "uuid" }]
}
```

## `GET /api/workspaces/:slug/copilot/conversations/`

Returns the current user's 20 most recent workspace Copilot conversations with persisted messages.

# Security

- Workspace permission decorators remain the outer API gate.
- Project and issue context is checked before retrieval.
- Evidence is limited to readable projects.
- Guests are rejected before LLM calls for write modes.
- Action execution requires project role checks and existing serializers.
- All actions execute inside a database transaction.
- Destructive/admin/external actions are not supported.

# Edge Cases

- Missing LLM configuration returns `400`.
- Unknown conversation ids return `404`.
- Unsupported action types return `400` and are not applied.
- Invalid serializer payloads return `400` and are not applied.
- Empty or malformed subtask drafts normalize to an empty draft list.
- Nullable LLM action fields are stripped before execution.

# Testing Strategy

- Backend contract tests cover Vertex configuration, permission-scoped citations, subtask drafts, command action application, persistence, and guest write rejection.
- Frontend checks cover service/panel type safety through `pnpm --filter=web check:types`.
- Build validation uses `pnpm --filter=web build`.
- Docker contract tests remain the source of truth for API runtime validation.

# Rollback Plan

- Remove the Copilot conversation/message models and migration before production migration if not yet applied.
- Remove the conversations route and command execution branch.
- Revert the web service response types and panel history/action rendering.
- Keep existing read-only Copilot answer mode if command execution must be disabled.

# Milestones

## Milestone 1 - Contract Tests

- Objective: define command execution and guest rejection behavior.
- Business impact: prevents unsafe Copilot writes.
- Technical scope: API contract tests.
- Dependencies: Docker test stack.
- Risks: Docker availability can block local verification.
- Success metrics: targeted tests fail before implementation and pass after.
- Rollback strategy: remove tests if command mode is cancelled.

## Milestone 2 - Backend Actions And History

- Objective: persist conversations and execute safe actions.
- Business impact: makes Copilot useful for issue operations.
- Technical scope: models, migration, endpoint, schemas, routes.
- Dependencies: issue and label serializers.
- Risks: serializer validation and permission drift.
- Success metrics: compile, Ruff, and contract tests pass.
- Rollback strategy: remove models, route, and command branch.

## Milestone 3 - Panel UX

- Objective: expose history, command mode, citations, and applied actions.
- Business impact: makes the feature usable from issue context.
- Technical scope: service types and Copilot panel.
- Dependencies: existing modal and issue service.
- Risks: unavailable local API prevents browser smoke.
- Success metrics: format, lint, typecheck, and build pass.
- Rollback strategy: hide command/history UI and revert service types.

# Epics

## Epic 1 - Grounded Workspace Evidence

- User value: users get answers from accessible Plane data.
- Technical requirements: issue, project, comment, activity, and page retrieval.
- Security considerations: enforce readable project scope.
- Edge cases: no search terms, issue context without search hits.
- Data flow: prompt to evidence list to LLM schema.
- API contracts: Copilot messages endpoint.
- Testing strategy: permission-scoped citation tests.

## Epic 2 - Safe Command Execution

- User value: members can create and update issues from natural language.
- Technical requirements: action normalization, permission checks, serializers, transaction.
- Security considerations: reject unsupported/destructive actions.
- Edge cases: invalid ids, invalid state/labels/assignees, guest commands.
- Data flow: LLM actions to validated plans to action results.
- API contracts: action and action result arrays.
- Testing strategy: command application and guest rejection tests.

## Epic 3 - Persistent Copilot UX

- User value: users can reopen recent Copilot work.
- Technical requirements: conversation list API and typed panel state.
- Security considerations: return only the current user's workspace history.
- Edge cases: empty history, missing latest message, structured backend errors.
- Data flow: conversation API to panel history buttons to loaded response.
- Testing strategy: typecheck and production build.

# User Stories

- As a workspace member, I want to ask Copilot about my readable workspace evidence so I can find relevant work faster.
- As an issue owner, I want Copilot to draft subtasks so I can review and apply child work items quickly.
- As a project member, I want command mode to create or update issues so routine issue maintenance is faster.
- As a guest, I want read-only answers but no write access so workspace permissions stay intact.
- As a returning user, I want recent Copilot conversations so I can continue prior work.

# Tasks

## Task 1 - Backend Contract Tests

- Objective: lock command and permission behavior.
- Scope: API tests.
- Files: `apps/api/plane/tests/contract/app/test_copilot_app.py`.
- Dependencies: Docker test stack.
- Risk Tier: R1.
- Acceptance Criteria: command actions apply and guest commands are rejected before LLM calls.
- Tests: targeted Docker pytest.
- Rollback: delete added tests.
- Assigned Model: GPT-5.5 xhigh.
- Assigned Agent: primary.

## Task 2 - Backend Implementation

- Objective: add history persistence and safe action execution.
- Scope: models, migration, API, routes.
- Files: `apps/api/plane/app/views/copilot.py`, `apps/api/plane/db/models/copilot.py`, migration, API route files.
- Dependencies: issue/label serializers and role model.
- Risk Tier: R1.
- Acceptance Criteria: response includes `conversation_id`, `actions`, and `action_results`; writes are permission checked.
- Tests: Ruff, compile, targeted Docker pytest.
- Rollback: remove route, models, migration, and command branch.
- Assigned Model: GPT-5.3-Codex-Spark.
- Assigned Agent: primary.

## Task 3 - Frontend Implementation

- Objective: expose command mode, recent history, and applied actions.
- Scope: web service and panel.
- Files: `apps/web/core/services/ai.service.ts`, `apps/web/core/components/copilot/panel.tsx`.
- Dependencies: existing Copilot panel, issue service.
- Risk Tier: R2.
- Acceptance Criteria: typecheck/build pass and touched files have no lint warnings.
- Tests: web format, lint, typecheck, build.
- Rollback: revert service types and panel UI changes.
- Assigned Model: GPT-5.3-Codex-Spark.
- Assigned Agent: primary.

# Acceptance Criteria

- Backend exposes message and conversation APIs.
- Conversation history persists successful Copilot responses.
- Command mode applies allowlisted issue/label actions transactionally.
- Guests cannot run write modes.
- Frontend panel can send command requests and load recent conversations.
- Web format, lint, typecheck, and production build pass.
- Backend compile and targeted Ruff pass.
- Docker contract test blocker is documented if Docker is unavailable.
