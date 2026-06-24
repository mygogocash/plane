# Phase 1 - Cloudflare Foundation

**Status:** CODE DONE for package scaffold, deploy/provisioning pending

## Objective

Create the Cloudflare application foundation in-repo without moving production
traffic.

## Scope

- Add `apps/cloudflare` Worker package.
- Add Worker bindings for D1, R2, Queues, KV, and Durable Objects.
- Add foundation D1 schema and migration.
- Add validation workflow.

## Implementation Tasks

- Create Hono Worker routes for `GET /healthz`, `GET /api/instances/`, and
  `GET /api/cloudflare/migration-status`.
- Add Drizzle schema for foundation audit/config tables.
- Add `wrangler.toml` with preview and production binding names.
- Add CI validation for typecheck and tests.

## Tests

- `pnpm --filter @manut/cloudflare check`
- `pnpm --filter @manut/cloudflare test`
- `pnpm --filter @manut/cloudflare baseline` when live network evidence is
  needed.

## Rollback

Delete or ignore `apps/cloudflare` and the Cloudflare workflow. No production
traffic or data is changed by this phase.

## Done When

- Typecheck and tests pass.
- Cloudflare resources can be provisioned using documented names.
- No GKE/GCP deploy behavior regresses.
