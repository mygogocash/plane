# Executive Summary

Epics and Initiatives close the self-host parity gap documented in `docs/prd-epics-initiatives-2026-06-07.md`. The fork already has reusable work-item primitives, layouts, and timeline infrastructure, but epic UI is stubbed and Initiatives do not exist. Delivery stays behind entitlement flags until each surface is functional.

# Business Goals

Give self-hosted workspaces first-party epics, initiatives, structured status updates, and scoped AI summaries without Plane Cloud billing, proprietary source, or tenant data leakage.

# Technical Goals

Reuse `Issue`, `IssueType.is_epic`, `Issue.parent`, existing layouts, MobX stores, DRF permission patterns, and the current copilot provider abstraction. Add only additive schema where needed and keep every new surface feature-flagged.

# Requirements

- Register `epics` and `initiatives` entitlement flags first, both defaulting to `false`.
- Build epic frontend foundation before turning the `epics` flag on.
- Build epic backend contracts and authorization before live epic data is exposed.
- Build initiative models, API, store, and UI before turning the `initiatives` flag on.
- Keep all reads and writes workspace- or project-scoped with server-side role checks.

# Non-Goals

- Do not rebuild list, board, timeline, calendar, spreadsheet, cycle, or intake infrastructure.
- Do not copy proprietary Plane Commercial source.
- Do not introduce Plane Cloud or external billing dependencies.
- Do not expand custom properties beyond the epic-scoped fields in the PRD.

# Architecture

Frontend work lives in `apps/web/{core,ce}` and shared packages under `packages/{services,types,constants,i18n}`. Backend work lives in `apps/api/plane/{db,app,api}`. Epics reuse Issue rows with epic issue types; Initiatives and status updates add new first-party models.

# Data Models

Epics use existing `Issue` rows, `IssueType.is_epic`, and `Issue.parent`. Later milestones add `IssueProperty`, `Initiative`, initiative join tables, `StatusUpdate`, and `StatusUpdateReaction` as additive models with reverse migrations.

# API Contracts

Epic session routes are scoped by `slug` and `project_id` under `/api/workspaces/<slug>/projects/<project_id>/epics/`. Initiative session routes are workspace-scoped under `/api/workspaces/<slug>/initiatives/`. v1 parity follows the same role enforcement for list/create/detail. AI NLQ extends copilot routes and fails closed when no provider is configured.

# Security

Every queryset must filter by tenant scope. Epic writes require project edit roles; Initiative writes require workspace Admin or Member roles. Cross-workspace references return `400`. Rich text is sanitized server-side. Feature flags are kill switches and stay off until the corresponding surface is complete.

# Edge Cases

Zero-child progress returns `0` without divide-by-zero. Cross-workspace duplicate or attach re-resolves or rejects tenant-specific references. Converted epics must not silently lose children. Deleted or non-epic members are skipped in rollups.

# Testing Strategy

Use TDD per task card. Frontend foundation uses Vitest plus web type checks. Backend API and model work uses Django pytest contract/unit tests in Docker. Schema tasks must prove forward and reverse migrations.

# Rollback Plan

Frontend-only milestones roll back by reverting commits and leaving flags `false`. Backend route milestones roll back by removing routes and setting flags `false`. Additive schema milestones roll back through reverse migrations. AI features roll back by disabling the AI surface while manual workflows remain available.

# Milestones

1. Epic frontend foundation with `epics` flag off.
2. Epic backend contracts, progress, attach, convert, duplicate, then `epics` on.
3. Epic custom properties.
4. Initiative models and API.
5. Initiative UI, then `initiatives` on.
6. Structured status updates.
7. AI NLQ and summaries.

# Epics

The delivery epics are `EPIC-1` through `EPIC-7` in `docs/plan/epics-initiatives/epics.md`, aligned to the milestones above.

# User Stories

User stories live in `docs/plan/epics-initiatives/stories.md`. The current checkpoint completes the EPIC-7 scoped AI workflow: fail-closed `/copilot/query/` NLQ plus the epic and initiative Ask AI / Summarize affordance.

# Tasks

Task cards live in `docs/plan/epics-initiatives/tasks.md`. Current execution has completed `TASK-27`, following locally completed `TASK-25` threaded status-update UI work and `TASK-26` scoped NLQ endpoint work. The feature-family cards are locally complete; production integration still requires safe reconciliation of the divergent local `main` and `origin/preview` histories.

# Acceptance Criteria

- `POST /api/workspaces/<slug>/copilot/query/` accepts `{ scope, object_id, question }` for `epic`, `initiative`, and `workspace` scopes.
- NLQ reuses the existing copilot provider boundary (`get_llm_config`, `is_llm_configured`, `call_copilot_llm`) and is not exposed on the v1 api-key surface.
- Epic and initiative evidence includes only caller-readable target data plus readable status updates; unreadable project evidence is excluded before the model call.
- Missing provider config fails closed with `409 ai_provider_not_configured`; provider outage returns graceful `503 ai_unavailable` without leaking provider exception text.
- Non-members are rejected before provider calls, and project-scoped epic reads require project membership.
- TASK-26 contracts, adjacent copilot/status-update/v1 contracts, `manage.py check`, `makemigrations --check --dry-run`, touched-file Ruff format/check, and `git diff --check` pass.
- Epic and initiative details render Ask AI / Summarize controls wired to `POST /api/workspaces/<slug>/copilot/query/`.
- The frontend renders `409 ai_provider_not_configured` as a disabled "Configure AI provider" state, without an error toast.
- The frontend renders `503 ai_unavailable` as a non-blocking "AI unavailable" message while manual detail viewing remains available.
- TASK-27 Ask AI Vitest, adjacent status-update/initiative Vitests, `pnpm turbo run check:types --filter=web`, touched-file `oxfmt`/`oxlint`, `git diff --check`, and a local Playwright MCP boot smoke pass within the known backend-unavailable local constraint.
