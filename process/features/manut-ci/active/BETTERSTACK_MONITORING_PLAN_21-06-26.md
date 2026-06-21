# Executive Summary

Add Better Stack uptime monitoring as a GitHub-managed operational integration for
`https://app.manut.xyz` without storing Better Stack credentials in the repository.

# Business Goals

- Track Manut production availability outside GKE and GitHub Actions.
- Give operators a repeatable way to provision monitors after deploys.
- Keep deploys safe when Better Stack credentials are not configured yet.

# Technical Goals

- Add an idempotent monitor sync script for Manut production.
- Add a manual GitHub Actions workflow for Better Stack provisioning.
- Run the same sync after successful `Manut CI/CD` production deploys.
- Document required secrets and optional monitor tuning variables.

# Requirements

- Do not commit Better Stack API tokens or monitor IDs.
- Monitor `https://app.manut.xyz/` for HTTP `200` and Manut branding.
- Monitor `https://app.manut.xyz/api/instances/` for HTTP `200` and the instance JSON shape.
- Make monitor provisioning safe to rerun.
- If the token is missing, warn and skip instead of failing production deploys.

# Non-Goals

- Do not add runtime app dependencies for Better Stack.
- Do not replace GKE rollout smoke checks.
- Do not require Terraform or a separate infra stack for this small integration.

# Architecture

- `.github/ops/betterstack/sync-manut-monitors.sh` owns monitor definitions and API calls.
- `.github/workflows/betterstack-monitoring.yml` lets operators dry-run or provision monitors.
- `.github/workflows/ci-cd.yml` runs the sync after a successful GKE deploy.
- `docs/gcp-manut-ops-handover.md` is the operator source of truth.

# Data Models

No application data models change. Better Stack monitor records are external operational
resources keyed by monitor name and URL.

# API Contracts

- Better Stack Uptime API base: `https://uptime.betterstack.com/api/v2`.
- Manut root: `GET /` returns HTTP `200` and contains `Manut`.
- Manut instance smoke: `GET /api/instances/` returns HTTP `200` and contains
  `current_version`.

# Security

- `BETTERSTACK_API_TOKEN` must be a GitHub Actions secret.
- The token is used only in GitHub Actions or a local operator shell.
- The script does not echo token values.
- Missing token is a warning, not a deploy failure.

# Edge Cases

- Better Stack token absent during the first deploy after this integration.
- Existing monitors may already exist by name or URL.
- Operator may want a different escalation policy or monitor group.
- App URL may change through `GCP_APP_URL` or `BETTERSTACK_APP_URL`.

# Testing Strategy

- `bash -n scripts/betterstack/sync-manut-monitors.sh`
- Script dry-run output must be valid JSON.
- `actionlint` validates GitHub workflow syntax.
- Existing smoke checks continue to validate production separately.

# Rollback Plan

- Revert this plan, script, docs, and workflow changes.
- Delete Better Stack monitors manually if they were created and are no longer desired.
- Production app runtime is unaffected by rollback.

# Milestones

## Milestone 1 - Repo Integration

- Objective: add script, workflow, CI hook, and docs.
- Business impact: monitoring can be provisioned from GitHub.
- Technical scope: shell script, GitHub Actions, ops handover.
- Dependencies: Better Stack API token.
- Risks: API token missing or insufficient permissions.
- Success metrics: dry-run and actionlint pass.
- Rollback: revert integration commit.

# Epics

## Epic 1 - Uptime Monitor Provisioning

- User value: production status is tracked outside app infrastructure.
- Technical requirements: idempotent create/update behavior.
- Security considerations: token stays in GitHub Secrets.
- Edge cases: existing monitors by URL or name.
- Data flow: GitHub Actions -> Better Stack Uptime API -> external monitors.
- API contracts: app root and instance endpoint return HTTP `200`.
- Testing strategy: dry-run and workflow validation.

# User Stories

As an operator, I want Better Stack to monitor Manut root and API health so that production
availability regressions are visible outside GKE and GitHub.

Acceptance criteria:

- A manual workflow can dry-run monitor payloads.
- A manual workflow can sync monitors when `BETTERSTACK_API_TOKEN` is present.
- A successful GKE deploy attempts monitor sync without blocking deploys if the token is absent.
- Ops docs explain the required secret and optional variables.

# Tasks

## Task

### Objective

Add Better Stack uptime monitor integration for Manut production.

### Scope

Scripts, GitHub Actions, and ops docs only.

### Files

- `.github/ops/betterstack/sync-manut-monitors.sh`
- `.github/workflows/betterstack-monitoring.yml`
- `.github/workflows/ci-cd.yml`
- `docs/gcp-manut-ops-handover.md`

### Dependencies

Better Stack API token with monitor read/write access.

### Risk Tier

R2. Production runtime is not modified.

### Acceptance Criteria

- Dry-run works without a token.
- Missing token skips safely with a warning.
- Workflow syntax validates.
- Docs include setup and rollback instructions.

### Tests

- `bash -n .github/ops/betterstack/sync-manut-monitors.sh`
- `.github/ops/betterstack/sync-manut-monitors.sh --dry-run`
- `actionlint .github/workflows/*.yml`

### Rollback

Revert the integration commit and remove any Better Stack monitors created from the external
dashboard if required.

### Assigned Model

GPT-5.5 xhigh.

### Assigned Agent

Codex orchestrator.
