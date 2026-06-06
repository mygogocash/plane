# Executive Summary

Make the GoGoCash/Manut self-hosted Plane instance expose every product feature
family available in the self-hosted positioning: project management, wiki,
intake, dashboards, analytics, active cycles, work item types, templates,
recurring work, worklogs, workflows, approvals, integrations, AI, enterprise
access controls, auditability, and mobile/self-host support.

This fork is based on the public Community Edition source. It does not contain
Plane's private Commercial Edition module tree. Therefore the implementation
strategy is not a one-line license bypass. The safe path is:

1. Unlock and polish every feature already present in CE.
2. Replace every remaining paid upsell with a self-host entitlement state.
3. Build open, first-party equivalents for missing Commercial features.
4. Deploy each feature family to GCP only after tests and rollback paths are
   proven.

# Business Goals

- Give GoGoCash and Manut a full self-hosted project-management platform without
  paid-plan interruptions.
- Keep all workspace data and AI traffic under our controlled infrastructure.
- Avoid dependence on Railway or external Plane Cloud checkout flows.
- Match the current Plane product promise as closely as practical from our fork.
- Preserve a deployable `preview` branch with reversible, tested milestones.

# Technical Goals

- Make self-host entitlement the default product state for this deployment.
- Remove remaining CE-paid upgrade surfaces from reachable workflows.
- Inventory all feature families against current source availability.
- Implement missing features incrementally with open data models, services, UI,
  and tests.
- Keep GCP deployment compatibility: GKE, Cloud SQL Postgres, Memorystore/GCS,
  in-cluster RabbitMQ, and Vertex AI/Gemini copilot.
- Keep CodeQL/security remediation compatible with the feature work.

# Requirements

- Self-host users must not see “Upgrade to paid plan” modals for features that
  exist in this fork.
- Feature navigation must show self-host status rather than Free/Pro/Business
  subscription prompts.
- Any newly built feature must have server-side authorization checks.
- Any new schema must have forward and rollback migration notes.
- Any new AI capability must run through configured self-host providers, not
  Plane Cloud.
- All feature work must be covered by focused tests before implementation.
- All deploys must use the GCP/GKE path, not Railway.
- Pushes to `preview` must release through GitHub Actions to Artifact Registry
  and GKE; no legacy Railway deploy hooks are valid rollback paths.

# Non-Goals

- Do not copy proprietary Plane Commercial source that is not present in this
  repository.
- Do not fake feature completion with static UI that has no backend behavior.
- Do not disable auth, permissions, validation, or audit trails to make features
  appear unlocked.
- Do not introduce external billing or Plane Cloud checkout dependencies.
- Do not ship broad refactors unrelated to the current feature milestone.

# Architecture

- `apps/web/ce/lib/self-host-entitlements.ts` remains the central frontend
  entitlement source for this fork.
- CE-present features should read from entitlement helpers instead of subscription
  plan names.
- Missing feature families get open replacements under existing ownership
  boundaries:
  - backend models and APIs in `apps/api/plane/db`, `apps/api/plane/app`, and
    `apps/api/plane/api`
  - frontend routes/components in `apps/web/core` and `apps/web/ce`
  - shared types/constants/services in `packages/types`, `packages/constants`,
    and `packages/services`
- Feature flags should default on for this self-host instance only when the
  feature is fully functional.
- Deploy artifacts remain split Plane component images published to Artifact
  Registry and rolled out through GKE by `.github/workflows/ci-cd.yml`.
- GitHub Actions deploys authenticate through GCP Workload Identity Federation
  and use namespace-scoped Kubernetes rollout permissions tracked in
  `k8s/github-actions-deployer-rbac.yaml`.

# Data Models

Expected new or extended model areas:

- Worklogs: issue, actor, duration, date, description, source, permissions.
- Templates: project templates, work item templates, page templates, visibility,
  ownership, cloned payload.
- Recurring work: schedule, timezone, next run, generation history, owner,
  project, target work item payload.
- Workflows: workflow, workflow states, allowed transitions, movers, default
  creation rules, work item type binding.
- Approvals: transition approval policy, approvers, approval decisions, audit
  history.
- Teamspaces: workspace grouping, membership/visibility, project/page binding.
- Audit logs: actor, target, event type, diff, request metadata, retention.
- AI usage: provider, action, token/credit metadata if available, local logs.

# API Contracts

- Existing CE API routes must remain backward compatible.
- New APIs must be versionless under the existing Plane route style.
- APIs must consistently scope by `workspaceSlug`, `projectId`, and object IDs.
- Mutating routes must enforce workspace/project role checks server-side.
- Public/Space APIs must not expose private teamspace, audit, workflow, or
  internal AI data unless explicitly designed for public access.
- AI routes must not require Plane Cloud credentials.

# Security

- Treat every new feature as multi-tenant within a workspace.
- Enforce least-privilege workspace/project roles on all reads and writes.
- Keep uploaded files private with signed URLs.
- Sanitize user-provided rich text and imported content.
- Do not log raw API keys, session tokens, AI prompts containing secrets, or
  sensitive headers.
- Keep GCP secrets in Secret Manager/Kubernetes secrets; never commit them.
- Run CodeQL and local tests before deploy.

# Edge Cases

- Mixed workspaces with old Free-plan metadata after self-host entitlement is on.
- Existing projects with `is_time_tracking_enabled=false`.
- Template cloning across projects with missing labels/states/members.
- Recurring work generation during worker downtime.
- Workflow transition conflicts with bulk operations.
- Approval policies when approvers are removed from a workspace.
- Teamspace membership changes while pages/projects are open in other sessions.
- AI provider outage or Vertex quota exhaustion.
- Public views/pages under private or secret projects.

# Testing Strategy

- Follow RED, GREEN, REFACTOR for every milestone.
- Unit tests for entitlement helpers and feature-specific business rules.
- API tests for authorization, validation, and persistence.
- Frontend tests for gating, empty states, and critical forms.
- Migration checks with the Docker test stack.
- Type/lint/format checks for touched packages.
- Deployment smoke checks on `https://app.manut.xyz/api/instances/` after the
  GitHub Actions GKE rollout.

# Rollback Plan

- Every milestone ships in a focused commit.
- Frontend entitlement/display regressions roll back by reverting the milestone
  commit and redeploying frontend.
- Backend schema milestones require reverse migration review before deploy.
- Background-worker features must be disabled by a feature flag before rolling
  back worker code.
- AI features must fail closed to normal non-AI workflows when provider config is
  unavailable.
- Production code rollback uses a prior immutable Artifact Registry
  `preview-<short_sha>` tag or Kubernetes rollout history on the GKE workloads.

# Milestones

# Milestone 1 — Feature Inventory and Entitlement Hardening

## Goal

Document every marketed feature family and remove remaining CE-paid surfaces
where functionality already exists.

## Business Impact

Users stop hitting upgrade walls for self-host functionality.

## Technical Scope

Feature matrix, entitlement helper expansion, paid-copy cleanup, test coverage.

## Dependencies

Existing self-host entitlement module and local Vitest.

## Risks

UI could imply missing features exist before implementation.

## Success Metrics

No reachable CE-present workflow shows a paid upgrade modal.

## Rollback

Revert entitlement/display changes.

# Milestone 2 — Worklogs and Time Tracking

## Goal

Make time tracking a complete self-host feature.

## Business Impact

Teams can track effort and report work directly inside Plane.

## Technical Scope

Backend worklog APIs if absent, frontend property/activity UI, permissions,
export support.

## Dependencies

Existing project `is_time_tracking_enabled` field and issue activity surfaces.

## Risks

Incorrect time totals or missing authorization.

## Success Metrics

Users can create, edit, list, delete, and export worklogs.

## Rollback

Disable worklog UI and revert API changes.

# Milestone 3 — Templates and Recurring Work

## Goal

Enable project/work item/page templates plus recurring work generation.

## Business Impact

Repeated operational workflows become reusable and schedulable.

## Technical Scope

Template models/APIs/UI, recurrence scheduler, worker tasks, run history.

## Dependencies

Celery/beat worker and existing project/issue/page create flows.

## Risks

Duplicate generation, timezone errors, bad cloned references.

## Success Metrics

Templates create real entities and recurring work runs predictably.

## Rollback

Pause recurrence worker flag and revert feature routes.

# Milestone 4 — Workflows and Approvals

## Goal

Implement single and then multiple workflows with transition rules and approvals.

## Business Impact

Teams can enforce agreed delivery process without manual policing.

## Technical Scope

Workflow models, state mapping, transition validation, approval policy, UI.

## Dependencies

State model, issue update APIs, work item type support.

## Risks

Breaking existing state transitions or bulk operations.

## Success Metrics

Invalid transitions are blocked and required approvals are enforced.

## Rollback

Disable workflow enforcement flag and keep state updates unrestricted.

# Milestone 5 — Teamspaces, Initiatives, and Hierarchy

## Goal

Complete organization-scale grouping with teamspaces and richer hierarchy.

## Business Impact

Large teams can separate work without creating multiple tools.

## Technical Scope

Teamspace membership, navigation, project/page binding, initiative/epic polish.

## Dependencies

Existing issue type epic support and workspace navigation.

## Risks

Visibility leaks across teams.

## Success Metrics

Teamspace-scoped content appears only to authorized members.

## Rollback

Hide teamspace navigation and keep project access unchanged.

# Milestone 6 — Enterprise Controls and Audit

## Goal

Add enterprise-grade access controls, SSO/LDAP hardening, and audit logs.

## Business Impact

Self-host can satisfy stronger compliance and admin requirements.

## Technical Scope

GAC/RBAC refinements, auth-provider settings, audit log APIs/UI, retention.

## Dependencies

Existing auth providers, role models, and admin settings.

## Risks

Locking admins out or logging sensitive values.

## Success Metrics

Admins can inspect actions and enforce access rules without data exposure.

## Rollback

Disable enterprise controls while preserving existing auth.

# Milestone 7 — Self-Hosted AI and Semantic Search

## Goal

Expand the existing Vertex AI/Gemini copilot into broader Plane AI capability.

## Business Impact

Users get contextual project help inside our infrastructure.

## Technical Scope

Provider abstraction, workspace context indexing, local logs, AI search, action
guardrails.

## Dependencies

Existing copilot work, Vertex AI config, optional OpenSearch/vector storage.

## Risks

Hallucinated edits, prompt leakage, provider outage.

## Success Metrics

AI answers and actions are scoped, logged, and recoverable.

## Rollback

Disable AI feature flag and preserve manual workflows.

# Epics

# Epic 1 — Self-Host Entitlements

## User Value

Self-host users see the product as self-hosted, not as a cloud Free plan.

## Technical Requirements

Central helpers, tests, no paid modals for available features.

## Security Considerations

Entitlements must not override authorization.

## Edge Cases

Old subscription metadata still says Free.

## Data Flow

Instance config -> frontend entitlement helper -> route/component display.

## API Contracts

No new API required for this epic.

## Testing Strategy

Vitest coverage for entitlement helpers and critical gated components.

# Epic 2 — Feature Completion

## User Value

Users can perform the workflows advertised by Plane self-host.

## Technical Requirements

Backend persistence, services, UI, permissions, tests for each feature.

## Security Considerations

Workspace/project scoping on every API.

## Edge Cases

Cross-project cloning, deleted users, and worker retries.

## Data Flow

User action -> API -> domain service/model -> activity/audit -> UI refresh.

## API Contracts

REST endpoints under existing app route conventions.

## Testing Strategy

API tests first, then frontend tests, then smoke.

# Epic 3 — GCP Production Rollout

## User Value

All features work on the live self-hosted domain.

## Technical Requirements

GitHub Actions builds component images, applies migrations, rolls GKE
workloads, and smokes public endpoints.

## Security Considerations

No secrets in logs; migrations tested before production.

## Edge Cases

Worker and web versions during rolling deploy.

## Data Flow

GitHub `preview` branch -> Artifact Registry -> GKE rollout -> live smoke.

## API Contracts

No deployment-specific API changes.

## Testing Strategy

Local checks, Docker migrations, rollout status, HTTP smoke.

# User Stories

As a workspace member, I want every available feature to open without an upgrade
modal so that I can use the self-host instance as the full workspace system.

Acceptance criteria: CE-present feature routes render functional screens and
paid-plan modals do not block them.

As a project manager, I want templates, recurring work, workflows, approvals,
and worklogs so that repeated delivery processes are controlled inside Plane.

Acceptance criteria: each object can be created, updated, listed, deleted, and
used in its main workflow with permissions enforced.

As an admin, I want teamspaces, access controls, audit logs, and SSO/LDAP-ready
configuration so that the instance can support larger teams safely.

Acceptance criteria: private data does not leak across teams and admin actions
are auditable.

As a self-host operator, I want AI and search to run through our configured
providers so that prompts, responses, and logs stay under our infrastructure.

Acceptance criteria: AI features work without Plane Cloud checkout or billing
and fail closed when provider config is missing.

# Tasks

# Task

## Objective

Build the all-features inventory matrix.

## Scope

Map public feature list to current source status and implementation path.

## Files

`docs/self-host-feature-parity-matrix-2026-06-06.md`

## Dependencies

Current source tree and Plane public feature pages.

## Risk Tier

R2

## Acceptance Criteria

Every major feature family is classified as present, gated, partial, or missing.

## Tests

Document review and targeted source references.

## Rollback

Delete or revert the matrix.

## Assigned Model

GPT-5.5 xhigh

## Assigned Agent

local codex orchestration

# Task

## Objective

Harden the self-host entitlement helper.

## Scope

Expose feature-family capability flags for all CE-present gates.

## Files

`apps/web/ce/lib/self-host-entitlements.ts`,
`apps/web/ce/lib/self-host-entitlements.test.ts`

## Dependencies

Existing entitlement helper.

## Risk Tier

R2

## Acceptance Criteria

Tests prove self-host has all CE-present capability flags enabled.

## Tests

`pnpm --filter web test -- apps/web/ce/lib/self-host-entitlements.test.ts`

## Rollback

Revert helper/test changes.

## Assigned Model

GPT-5.3-Codex-Spark

## Assigned Agent

local codex execution

# Task

## Objective

Remove remaining paid-plan UI from self-host reachable surfaces.

## Scope

Billing, upgrade, active cycles, bulk operations, embeds, templates/worklogs
empty states where code exists.

## Files

Targeted CE/core frontend components found by source inventory.

## Dependencies

Entitlement helper.

## Risk Tier

R2

## Acceptance Criteria

No reachable self-host screen asks for Pro/Business/Enterprise to use a
CE-present feature.

## Tests

Targeted Vitest/component tests and Playwright smoke where available.

## Rollback

Revert UI changes.

## Assigned Model

GPT-5.3-Codex-Spark

## Assigned Agent

local codex execution

# Task

## Objective

Implement missing feature families milestone by milestone.

## Scope

Worklogs, templates, recurring work, workflows, approvals, teamspaces,
enterprise controls, audit logs, AI search.

## Files

Backend, frontend, shared packages, migrations, workers, docs.

## Dependencies

Milestone-specific designs and tests.

## Risk Tier

R1

## Acceptance Criteria

Each feature family has tested CRUD/workflow behavior and live GCP smoke proof.

## Tests

API, frontend, migration, type/lint, and deployment smoke tests.

## Rollback

Feature flag disablement and commit/migration rollback per milestone.

## Assigned Model

GPT-5.5 xhigh for architecture, GPT-5.3-Codex-Spark for execution

## Assigned Agent

local codex execution plus isolated subagents where safe

# Acceptance Criteria

- Root `spec.md` reflects the self-host all-features program.
- A feature parity matrix exists and is kept updated.
- CE-present paid gates are removed from self-host screens.
- Missing Commercial features are implemented as working open replacements.
- All changes are tested, committed, pushed, deployed to GCP, and smoke checked
  before claiming completion.
