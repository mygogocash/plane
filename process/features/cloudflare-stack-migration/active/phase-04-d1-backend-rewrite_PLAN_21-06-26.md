# Phase 4 - D1 Backend Rewrite

**Status:** IN PROGRESS for inventory tooling, backend rewrite blocked

## Objective

Prepare the Django/Postgres to Worker/D1 rewrite with model inventory, schema
mapping, and repeatable validation tooling before implementing domain APIs.

## Scope

- Inventory Django models and migration files without importing Django or
  connecting to production data.
- Map Postgres-specific assumptions to SQLite/D1-compatible patterns.
- Add row-count comparison tooling for future export/import verification.
- Keep Cloud SQL as source of truth until final cutover.

## Implementation Tasks

- Add static model/migration inventory tooling.
- Add source/target row-count comparison tooling.
- Create the first D1 model mapping reference.
- Identify compatibility risks for JSON fields, partial indexes, constraints,
  timezone handling, and generated IDs.

## Tests

- Node smoke test for model inventory.
- Node smoke test for matching and mismatched row-count JSON fixtures.
- Future: domain-specific contract tests comparing GKE and Worker API responses.

## Rollback

No runtime data change is made. If D1 compatibility fails, keep Django/Postgres
active and evaluate Hyperdrive/Postgres as a separate fallback plan.

## Done When

- Inventory and comparison tools run without credentials.
- Model mapping reference names highest-risk tables and migration constraints.
- First API domain candidate is selected for implementation.
