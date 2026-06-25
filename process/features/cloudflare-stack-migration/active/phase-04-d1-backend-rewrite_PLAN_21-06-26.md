# Phase 4 - D1 Backend Rewrite

**Status:** CODE DONE for shadow reads; continued in `worker-native-api-migration_PLAN_25-06-26.md`

## Objective

Prepare the Django/Postgres to Worker/D1 rewrite with model inventory, schema
mapping, and repeatable validation tooling before implementing domain APIs.

## Scope

- Inventory Django models and migration files without importing Django or
  connecting to production data.
- Map Postgres-specific assumptions to SQLite/D1-compatible patterns.
- Add row-count comparison tooling for future export/import verification.
- Add first D1-backed shadow read endpoints without taking over production
  `/api/v1/*` routes.
- Keep Cloud SQL as source of truth until final cutover.

## Implementation Tasks

- Add static model/migration inventory tooling.
- Add source/target row-count comparison tooling.
- Create the first D1 model mapping reference.
- Add read-only D1 shadow endpoints for workspaces and projects.
- Identify compatibility risks for JSON fields, partial indexes, constraints,
  timezone handling, and generated IDs.

## Tests

- Node smoke test for model inventory.
- Node smoke test for matching and mismatched row-count JSON fixtures.
- Worker tests for missing D1 binding, workspace list reads, and project reads
  scoped by workspace slug.
- Future: domain-specific contract tests comparing GKE and Worker API responses.

## Rollback

No runtime data change is made. If D1 compatibility fails, keep Django/Postgres
active and evaluate Hyperdrive/Postgres as a separate fallback plan.

## Done When

- Inventory and comparison tools run without credentials.
- Model mapping reference names highest-risk tables and migration constraints.
- First API domain candidate is selected for implementation.

## Phase 4 Evidence

- Report: `process/features/cloudflare-stack-migration/reports/phase-04-d1-backend-rewrite-evidence_21-06-26.md`
- Shadow routes:
  - `/api/cloudflare/d1/workspaces`
  - `/api/cloudflare/d1/workspaces/:workspaceSlug/projects`
- Production cutover status: blocked until export/import, row-count checks,
  relationship checks, auth boundaries, and contract parity pass.
