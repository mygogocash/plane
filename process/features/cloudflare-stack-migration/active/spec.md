# Manut Cloudflare Stack Migration Spec

## Executive Summary

Migrate Manut from the current GKE/GCP runtime to a Cloudflare-native stack in
phases while keeping the GKE release as rollback until Cloudflare production has
been verified.

## Business Goals

- Put Manut's public delivery, app routing, storage, jobs, and data platform under
  the Cloudflare suite.
- Reduce dependence on GKE/GAR/GCS for the Manut production path.
- Keep `https://app.manut.xyz` and `https://manut.xyz` stable for users.

## Technical Goals

- Create a parallel Cloudflare runtime before any production cutover.
- Build a Worker-native API surface that preserves existing public contracts.
- Move uploads to R2, relational state to D1, async jobs to Queues/Workflows,
  live collaboration to Durable Objects, and cache/session primitives to KV or
  Durable Objects.
- Add Cloudflare CI/CD checks without deleting or disabling the GKE workflow.

## Requirements

- `https://manut.xyz` stays on Cloudflare Pages.
- `https://app.manut.xyz/api/instances/` continues returning HTTP 200 with Manut
  instance metadata.
- GKE/GCP resources stay online until final cutover and post-cutover soak finish.
- D1 migration must prove row counts, relationships, and representative API
  responses before write traffic moves.
- R2 migration must prove object counts and checksums before upload signing
  changes.

## Non-Goals

- Immediate production cutover in the foundation phase.
- Clerk integration or auth provider replacement.
- Replacing Resend SMTP.
- Deleting GCP resources before a 7-day green Cloudflare soak.

## Architecture

- Landing: Cloudflare Pages project `manut`.
- App front door: Cloudflare Worker route for `app.manut.xyz`.
- API: TypeScript Worker using Hono.
- Data: Cloudflare D1 with Drizzle schema/migrations.
- Uploads: Cloudflare R2 bucket with `/uploads/*` compatibility route.
- Jobs: Cloudflare Queues, Scheduled Workers, and Workflows.
- Live: Durable Objects WebSocket rooms.
- Cache/session/locking: KV for simple cache, Durable Objects for coordinated
  state.

## Data Models

- Start with foundation tables for instance config, migration audit, upload object
  audit, and job audit.
- Map current Django models from `apps/api/plane/db/models` into D1 phase by
  phase.
- Keep Postgres as source of truth until D1 import and shadow-read comparison
  pass.

## API Contracts

- Preserve existing app origin and path contracts:
  - `/api/*`
  - `/auth/*`
  - `/uploads/*`
  - `/live/*`
  - `/spaces`
  - `/god-mode`
- Foundation Worker must expose:
  - `GET /healthz`
  - `GET /api/instances/`
  - `GET /api/cloudflare/migration-status`

## Security

- Do not commit Cloudflare, GCP, database, R2, Resend, or Better Stack secrets.
- Required Cloudflare token scopes must be documented before production deploy.
- Production D1/R2/Queues must use separate names from preview resources.
- Destructive database/storage operations require an explicit rollback point and
  current backup.

## Edge Cases

- D1 SQLite semantics do not support every Postgres behavior.
- Existing sessions may need forced re-login at cutover.
- Upload URLs and CORS must keep browser direct-upload flows working.
- Queue retries must not duplicate non-idempotent jobs.
- DNS rollback must be possible by pointing `app.manut.xyz` back to GKE.

## Testing Strategy

- Unit tests for Worker routes and migration helpers.
- Contract tests against current GKE responses before Worker parity claims.
- D1 row-count, foreign-key, and representative query checks.
- R2 object-count and checksum checks.
- Queue retry/dead-letter tests.
- Public and authenticated production smoke before cutover is considered done.

## Rollback Plan

- Keep GKE, Cloud SQL, Redis, RabbitMQ, and GCS unchanged through shadow testing.
- Roll app traffic back by restoring `app.manut.xyz` DNS/routing to GKE.
- Keep final Postgres export and R2/GCS checksum reports before deleting any
  source resource.

## Milestones

- M0: Baseline and guardrails.
- M1: Cloudflare foundation scaffold.
- M2: Frontend and edge routing.
- M3: R2 upload migration.
- M4: D1 backend rewrite.
- M5: Queues, cron, cache, and live.
- M6: Cloudflare CI/CD.
- M7: Production cutover.
- M8: Decommission.

## Epics

- Cloudflare platform foundation.
- Worker API parity.
- Data migration.
- Upload migration.
- Async/runtime primitives.
- CI/CD and operations.
- Production cutover and decommission.

## User Stories

- As a user, I want `app.manut.xyz` to keep working during migration so that my
  workspace is not disrupted.
- As an operator, I want Cloudflare and GKE to run in parallel so that rollback is
  a routing change, not a rebuild.
- As an operator, I want evidence for data and upload migration so that cutover
  can be audited.

## Tasks

- Create phase-program artifacts under `process/features/cloudflare-stack-migration`.
- Add `apps/cloudflare` Worker package with foundation routes and bindings.
- Add D1 foundation schema and migration.
- Add baseline evidence capture tooling.
- Add Cloudflare CI/CD validation workflow.

## Acceptance Criteria

- `apps/cloudflare` type-checks and tests pass.
- Foundation Worker returns Manut-compatible `/api/instances/` JSON.
- No production traffic is moved by this phase.
- Phase plans state explicit rollback and validation gates.
- Cloudflare CI/CD can run validation without GCP credentials.
