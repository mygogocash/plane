# Executive Summary

Plane AI Copilot V1 adds a Plane-native right-side panel that answers questions from permission-scoped workspace data and drafts child work items for review before creation. The feature extends the existing Django API and React web app, uses Google Vertex AI Gemini through backend-only configuration, and leaves the existing `/ai-assistant/` editor endpoints intact.

# Business Goals

- Help workspace users find answers from Plane data without leaving the product.
- Reduce manual breakdown work by drafting sub-work-items from an existing work item.
- Preserve user control by requiring explicit review and apply before any work item is created.
- Keep V1 deployable without vector indexes, embeddings, file ingestion, or persistent chat history.

# Technical Goals

- Add `POST /api/workspaces/:slug/copilot/messages/`.
- Retrieve compact evidence from readable issues, sub-issues, projects, pages, comments, and activity.
- Enforce workspace and project membership before evidence reaches the configured LLM provider.
- Return typed response data with answer text, citations, and optional subtask draft items.
- Apply selected subtask drafts through the existing issue creation API with `parent_id`.
- Expose workspace and issue-detail Copilot entry points in the web app.

# Requirements

- Input fields: `message`, optional `project_id`, optional `issue_id`, and `mode` as `answer`, `draft_subtasks`, or `auto`.
- Output fields: `mode`, `answer`, `citations[]`, and optional `subtask_draft.items[]`.
- Citation fields: `entity_type`, `entity_id`, `title`, `url`, and `excerpt`.
- Subtask fields: `name`, `description_html`, `priority`, `assignee_ids`, `label_ids`, and `rationale`.
- Guests may ask within readable scope but cannot request subtask drafts.
- Missing LLM configuration must return `400` before model calls.
- Existing `/ai-assistant/` behavior must keep working with Vertex AI or the existing API-key providers.
- Secrets must remain backend-only.
- Vertex AI uses `LLM_PROVIDER=vertexai`, `LLM_MODEL`, `LLM_VERTEX_PROJECT`, and `LLM_VERTEX_LOCATION`; credentials are supplied through Google ADC or service account environment configuration, not frontend code.

# Non-Goals

- No embeddings, vector database, semantic index, or attachment ingestion in V1.
- No autonomous project changes or model-created work items.
- No persistent chat threads.
- No voice UI.
- No new subtask tracking data model.
- No provider-specific parity beyond Google Vertex AI for Copilot V1; the existing API-key providers remain rollback-compatible for legacy editor prompts.

# Architecture

- React web opens a Copilot panel from the workspace dashboard and issue detail.
- `AIService.sendCopilotMessage` posts to the new workspace Copilot endpoint.
- Django validates request payload and permissions, then gathers compact evidence from existing Plane models.
- Django sends only permission-scoped snippets to Google Vertex AI Gemini or the configured rollback provider.
- The LLM returns structured JSON for answer and optional subtask draft.
- React renders citations and editable draft rows.
- React applies selected draft rows with `IssueService.createIssue`, passing `parent_id` to the existing issue create path.
- Existing sub-work-items store refreshes after apply.

# Data Models

- No new database tables.
- Evidence is transient request data.
- Draft subtasks are transient frontend state until the user clicks apply.
- Created child work items use the existing `Issue.parent_id` relationship.

# API Contracts

## `POST /api/workspaces/:slug/copilot/messages/`

Request:

```json
{
  "message": "Break this work item into subtasks.",
  "mode": "draft_subtasks",
  "project_id": "uuid",
  "issue_id": "uuid"
}
```

Response:

```json
{
  "mode": "draft_subtasks",
  "answer": "Review these subtasks before creating them.",
  "citations": [
    {
      "entity_type": "issue",
      "entity_id": "uuid",
      "title": "Launch checklist",
      "url": "/workspace/projects/project-id/issues/issue-id",
      "excerpt": "Relevant evidence text"
    }
  ],
  "subtask_draft": {
    "items": [
      {
        "name": "Verify invite email",
        "description_html": "<p>Send a test invite and confirm delivery.</p>",
        "priority": "high",
        "assignee_ids": [],
        "label_ids": [],
        "rationale": "Invite delivery is part of the launch checklist."
      }
    ]
  }
}
```

# Security

- Workspace membership is required before the endpoint executes.
- Project and issue context must be readable by the requesting user.
- Evidence retrieval is scoped to projects where the user is an active project member.
- Guests are blocked from `draft_subtasks`.
- LLM credentials and Google Cloud project/location are read from backend configuration only.
- The frontend receives only model output and citations, never API keys.
- Model output is normalized before returning to the frontend.
- Writes use existing issue creation validation, activity logging, and permission checks.

# Edge Cases

- Missing LLM configuration returns `400`; for Vertex AI this means missing `LLM_PROVIDER`, `LLM_MODEL`, or Google Cloud project/location, while API-key providers still require `LLM_API_KEY`.
- `auto` mode becomes `draft_subtasks` only for subtask-like prompts.
- Empty evidence still allows an answer, but the model is instructed to state missing context.
- Invalid project or issue context returns `403`.
- Draft rows with empty names are ignored on apply.
- Unsupported or malformed priorities normalize to `none`.
- Failed apply leaves draft rows in place for retry.
- Existing sub-work-items may be filtered; refresh uses the current store behavior.

# Testing Strategy

- Backend contract tests cover permission failure, missing config, citations, and structured draft output.
- Frontend service and UI should be covered by component tests when the web test harness is available.
- Apply flow must be browser-smoked against an issue detail page.
- Verification gates:
  - `pnpm check`
  - `docker compose -f docker-compose-test.yml run --rm --build api-tests pytest -m contract -k "copilot or issue"`
  - `docker compose -f docker-compose-test.yml run --rm api-tests pytest -m unit`
  - Browser smoke: ask a workspace question, draft subtasks from an issue, apply selected subtasks, verify sub-work-items count refreshes.

# Rollback Plan

- Hide or remove Copilot trigger buttons in the web app.
- Disable or remove the `/copilot/messages/` route.
- Keep existing issue creation and sub-work-items behavior unchanged.
- Existing created subtasks remain normal Plane work items and can be deleted or edited through current workflows.

# Milestones

## Milestone 1 - Planning And Spec

- Objective: document the feature contract and rollout gates.
- Business impact: gives implementation and review a clear boundary.
- Technical scope: `spec.md` and env documentation.
- Dependencies: existing AI config names plus Vertex AI project/location settings.
- Risks: stale deployment spec replaced in this local non-git workspace.
- Success metrics: spec contains all required AGENTS sections.
- Rollback strategy: restore prior spec content if this branch is not for Copilot.

## Milestone 2 - Backend Retrieval And LLM Adapter

- Objective: add permission-scoped Copilot API.
- Business impact: enables internal-data answers and drafts.
- Technical scope: endpoint, serializer, retrieval helpers, LLM adapter, tests.
- Dependencies: existing `LLM_*` configuration, Vertex AI credentials, and Plane membership models.
- Risks: R1 because selected workspace snippets leave the app boundary through Google Vertex AI.
- Success metrics: backend contract tests pass.
- Rollback strategy: remove route and view module.

## Milestone 3 - Frontend Copilot Panel

- Objective: expose workspace Q&A and issue-context drafting.
- Business impact: makes Copilot usable without changing existing workflows.
- Technical scope: service types, panel UI, citations, draft review controls.
- Dependencies: instance config and existing layout portal.
- Risks: R2 reversible UI changes.
- Success metrics: panel renders configured and unconfigured states.
- Rollback strategy: remove trigger buttons and component imports.

## Milestone 4 - Apply Flow And Tracking Refresh

- Objective: create reviewed subtasks through existing issue APIs.
- Business impact: turns draft decomposition into tracked child work.
- Technical scope: `IssueService.createIssue` with `parent_id`, refresh sub-work-items.
- Dependencies: existing issue create permissions and sub-issue store.
- Risks: R1 user-facing writes, mitigated by explicit user click.
- Success metrics: selected drafts create child issues and refresh progress.
- Rollback strategy: remove apply button while keeping Q&A.

## Milestone 5 - Validation And Handoff

- Objective: run quality gates and document limitations.
- Business impact: prepares deploy review.
- Technical scope: backend contract tests, web checks, env docs, final audit.
- Dependencies: Docker test stack and pnpm toolchain.
- Risks: full test suite runtime and non-git workspace commit limitation.
- Success metrics: required checks pass or blockers are documented.
- Rollback strategy: leave changes uncommitted until applied in a real `mygogocash/plane` clone on `preview`; set `LLM_PROVIDER` back to an API-key provider or hide the Copilot UI.

# Epics

## Epic 1 - Permission-Scoped Retrieval

- User value: users receive answers grounded only in data they can already read.
- Technical requirements: workspace permission, project membership filtering, compact evidence format.
- Security considerations: no evidence from unreadable projects or issues.
- Edge cases: issue context from an unreadable project, empty evidence, archived projects.
- Data flow: Plane DB to Django evidence list to model prompt.
- API contracts: citations mirror evidence IDs, titles, URLs, and excerpts.
- Testing strategy: non-member and issue-context contract tests.

## Epic 2 - Structured Subtask Drafts

- User value: users can review and edit proposed child work items.
- Technical requirements: typed draft item schema, priority normalization, editable frontend state.
- Security considerations: guests cannot draft subtasks; writes use existing issue permissions.
- Edge cases: malformed model JSON, empty names, invalid priority, failed apply.
- Data flow: model draft to panel state to existing issue create API.
- API contracts: `subtask_draft.items[]` shape remains stable.
- Testing strategy: structured draft contract test and browser apply smoke.

## Epic 3 - Copilot Web Experience

- User value: users can ask from workspace context or a specific work item.
- Technical requirements: workspace panel trigger, issue-detail trigger, citations, disabled config state.
- Security considerations: no frontend secrets.
- Edge cases: AI disabled, request failure, partial apply failure.
- Data flow: panel request to Copilot endpoint, response to citations/draft UI.
- API contracts: `AIService.sendCopilotMessage` mirrors backend payload.
- Testing strategy: component tests plus browser smoke.

# User Stories

- As a workspace member, I want to ask questions about internal Plane data so I can find project context quickly.
- As a work item owner, I want Copilot to draft subtasks so I can review a breakdown before creating child work.
- As a guest, I want answers only from my readable scope so confidential project data is not exposed.
- As an admin, I want Copilot to use existing backend LLM config so secrets are centrally managed.
- As a reviewer, I want citations so I can inspect the source behind Copilot answers.

# Tasks

## Task 1 - Backend Contract Tests

- Objective: lock permission, config, citation, and draft behavior.
- Scope: Django contract tests.
- Files: `apps/api/plane/tests/contract/app/test_copilot_app.py`.
- Dependencies: Docker test stack.
- Risk Tier: R2.
- Acceptance Criteria: tests fail before implementation and pass after.
- Tests: targeted pytest file.
- Rollback: delete test file if feature is removed.
- Assigned Model: GPT-5.5 xhigh.
- Assigned Agent: primary.

## Task 2 - Copilot Endpoint

- Objective: implement validated API and retrieval.
- Scope: Django views and URL registration.
- Files: `apps/api/plane/app/views/copilot.py`, `apps/api/plane/app/views/__init__.py`, `apps/api/plane/app/urls/external.py`.
- Dependencies: Task 1.
- Risk Tier: R1.
- Acceptance Criteria: endpoint returns answers, citations, and drafts without leaking unreadable evidence.
- Tests: contract pytest file.
- Rollback: remove route and view import.
- Assigned Model: GPT-5.3-Codex-Spark.
- Assigned Agent: primary execution.

## Task 3 - Web Service And Panel

- Objective: add Copilot web entry points.
- Scope: AI service, panel component, dashboard header, issue detail.
- Files: `apps/web/core/services/ai.service.ts`, `apps/web/core/components/copilot/*`, `apps/web/app/(all)/[workspaceSlug]/(projects)/header.tsx`, `apps/web/core/components/issues/issue-detail/main-content.tsx`.
- Dependencies: Task 2.
- Risk Tier: R2.
- Acceptance Criteria: panel renders, sends prompts, shows citations, and edits draft rows.
- Tests: `pnpm check` and browser smoke.
- Rollback: remove trigger imports and component files.
- Assigned Model: GPT-5.3-Codex-Spark.
- Assigned Agent: primary execution.

## Task 4 - Apply Selected Drafts

- Objective: create selected child work items through existing APIs.
- Scope: Copilot panel apply action and sub-issue refresh.
- Files: `apps/web/core/components/copilot/panel.tsx`, `apps/web/core/components/issues/issue-detail/main-content.tsx`.
- Dependencies: Task 3.
- Risk Tier: R1.
- Acceptance Criteria: selected drafts create issues with `parent_id` and refresh sub-work-items.
- Tests: browser smoke.
- Rollback: remove apply action.
- Assigned Model: GPT-5.3-Codex-Spark.
- Assigned Agent: primary execution.

## Task 5 - Env Docs And Handoff

- Objective: document AI configuration and validation status.
- Scope: env examples and final report.
- Files: `.env.example`, `apps/api/.env.example`, `spec.md`.
- Dependencies: Tasks 1-4.
- Risk Tier: R2.
- Acceptance Criteria: LLM vars are documented and legacy GPT vars are marked legacy only.
- Tests: docs review.
- Rollback: restore previous env comments.
- Assigned Model: GPT-5.5 xhigh.
- Assigned Agent: primary.

# Acceptance Criteria

- `POST /api/workspaces/:slug/copilot/messages/` exists.
- Non-members receive `403` and no model call.
- Missing LLM config receives `400` and no model call.
- Issue-context questions include permission-scoped citations.
- Subtask prompts return structured draft items.
- Workspace dashboard has a Copilot entry point.
- Issue detail has a Copilot entry point.
- Draft rows are selectable and editable before apply.
- Apply creates existing Plane issues with `parent_id`.
- Existing sub-work-items state refreshes after apply.
- Existing `/ai-assistant/` endpoints remain unchanged.
