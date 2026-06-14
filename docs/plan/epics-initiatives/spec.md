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

User stories live in `docs/plan/epics-initiatives/stories.md`. The current task implements `EI-6.2` and `EI-6.3`: add session-authenticated status-update APIs for epics and initiatives, including threaded replies and reactions.

# Tasks

Task cards live in `docs/plan/epics-initiatives/tasks.md`. Current execution is `TASK-24`, following locally completed `TASK-23` status-update model and migration work.

# Acceptance Criteria

- Project members can create, list, update, and delete status updates under `/api/workspaces/<slug>/projects/<project_id>/epics/<epic_id>/status-updates/`.
- Workspace members can create and list status updates under `/api/workspaces/<slug>/initiatives/<initiative_id>/status-updates/`.
- Reads require the matching project/workspace viewer role; writes require Admin or Member roles.
- Creating an epic status update sets `epic`, leaves `initiative` null, sanitizes `comment_html`, and stores `comment_stripped`/`comment_json`.
- Creating a reply stores `parent` and enforces the same owning epic or initiative as the parent update.
- Reactions can be added and removed under the owning status-update route; duplicate active reactions return a validation error.
- Soft-deleted status updates reject new reactions and do not appear in list/detail responses.
- TASK-24 contract tests, `manage.py check`, `makemigrations --check --dry-run`, touched-file Ruff checks, and `git diff --check` pass.
