# Manut Cloudflare Stack Migration

This document is the operator guide for the Cloudflare migration program. It is
intentionally non-destructive until the production cutover phase is approved.

## Current Production Baseline

- Landing: `https://manut.xyz` is served through Cloudflare Pages.
- App: `https://app.manut.xyz` still routes to the current GKE/GCP stack.
- Current app data resources are documented in `docs/gcp-manut-ops-handover.md`.

## Target Cloudflare Resources

Preview:

- Worker: `manut-app-preview`
- Worker URL: `https://manut-app-preview.bettergogocash.workers.dev`
- D1: `manut-preview` (`28b4db1a-005d-4814-b607-0f82900ce4bd`)
- R2: `manut-uploads-preview`
- Queue: `manut-jobs-preview`
- KV: `manut-config-preview` (`fb075b2d3c8e459eb07cd7e82e741b48`)
- Durable Object: `LiveRoomDurableObject`

Production:

- Worker: `manut-app`
- Worker URL: `https://manut-app.bettergogocash.workers.dev`
- D1: `manut-prod`
- D1 ID: `a29a2712-f899-45ee-8ab9-f64afded7e1c`
- R2: `manut-uploads-prod`
- Queue: `manut-jobs-prod`
- KV: `manut-config-prod`
- KV ID: `e3fdd6cf29dc4f03a9a240830814c629`
- Durable Object: `LiveRoomDurableObject`

## Required Secrets and Variables

GitHub variables:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_ZONE_ID` for future DNS/cutover automation
- `CLOUDFLARE_APP_URL`, default `https://app.manut.xyz`
- `CLOUDFLARE_SITE_URL`, default `https://manut.xyz`

GitHub secrets:

- `CLOUDFLARE_API_TOKEN`
- `BETTERSTACK_API_TOKEN`

The Cloudflare token must be a raw API token, not a Global API Key, not a
`Bearer ...` string, and not a copied shell command.

## Safe Commands

```bash
pnpm --filter @manut/cloudflare check
pnpm --filter @manut/cloudflare test
pnpm --filter @manut/cloudflare baseline
pnpm --filter @manut/cloudflare d1:inventory -- --root apps/api/plane
pnpm --filter @manut/cloudflare d1:compare -- <postgres-counts.json> <d1-counts.json>
pnpm --filter @manut/cloudflare d1:validate-import -- <postgres-counts.json> <d1-counts.json> --relationships <relationship-checks.json> --out process/features/cloudflare-stack-migration/reports/phase-07-d1-import-validation_21-06-26.json
pnpm --filter @manut/cloudflare uploads:compare -- <gcs-manifest.json> <r2-manifest.json>
pnpm --filter @manut/cloudflare uploads:validate -- <gcs-manifest.json> <r2-manifest.json> --out process/features/cloudflare-stack-migration/reports/phase-07-r2-manifest-validation_21-06-26.json
pnpm --filter @manut/cloudflare live:shadow -- https://manut-app.bettergogocash.workers.dev --out process/features/cloudflare-stack-migration/reports/phase-07-live-shadow-validation_21-06-26.json
pnpm --filter @manut/cloudflare auth:smoke-report -- --input <manual-auth-smoke.json> --out process/features/cloudflare-stack-migration/reports/phase-07-authenticated-smoke_21-06-26.json
pnpm --filter @manut/cloudflare betterstack:cutover-report -- --out process/features/cloudflare-stack-migration/reports/phase-07-betterstack-cutover_21-06-26.json
pnpm --filter @manut/cloudflare seven-green-days:report -- --input <phase8-stability-evidence.json> --out process/features/cloudflare-stack-migration/reports/phase-08-seven-green-days_21-06-26.json
pnpm --filter @manut/cloudflare cutover:readiness
pnpm --filter @manut/cloudflare smoke:worker -- https://manut-app-preview.bettergogocash.workers.dev
```

## Provisioning Order

1. Create preview Cloudflare resources.
2. Apply D1 foundation migration to preview.
3. Deploy preview Worker.
4. Run contract tests against preview and current GKE.
5. Repeat for production only after preview is green.

## Cloudflare CI/CD

`.github/workflows/cloudflare-ci-cd.yml` is validation-only for push and pull
request events. Manual deployment is available only through `workflow_dispatch`.

Manual inputs:

- `deploy_target`: `none`, `preview`, or `production`.
- `apply_d1_migrations`: applies D1 migrations for the selected target before
  deploy.
- `run_live_baseline`: runs the live `manut.xyz` / `app.manut.xyz` baseline.
- `run_r2_manifest_validation`: runs synthetic upload manifest validation.
- `cloudflare_preview_url`: optional deployed Worker URL for smoke checks.

Push/PR validation runs:

- `pnpm --filter @manut/cloudflare check`
- `pnpm --filter @manut/cloudflare test`
- Worker dry-run bundle
- synthetic D1 row-count validation
- synthetic R2 manifest validation

Manual deploy requires:

- GitHub secret `CLOUDFLARE_API_TOKEN`
- GitHub variable `CLOUDFLARE_ACCOUNT_ID`

Future DNS/cutover automation additionally requires:

- GitHub variable `CLOUDFLARE_ZONE_ID`

Current GitHub repository state:

- `CLOUDFLARE_ACCOUNT_ID` is configured.
- `CLOUDFLARE_APP_URL` is configured.
- `CLOUDFLARE_SITE_URL` is configured.
- `CLOUDFLARE_ZONE_ID` is not configured; this blocks DNS/cutover
  automation, not Worker deployment to `workers.dev`.
- `CLOUDFLARE_API_TOKEN` is not configured.
- Local Wrangler OAuth is authenticated and was used for the first preview
  and production provisioning/deploy, but GitHub Actions still needs a raw API
  token secret before manual Worker deploy can run there.

Current Cloudflare provider state:

- Preview Worker is deployed to
  `https://manut-app-preview.bettergogocash.workers.dev`.
- Production Worker is deployed to
  `https://manut-app.bettergogocash.workers.dev`.
- Production D1 schema migrations `0001_foundation.sql` and
  `0002_shadow_core.sql` are applied to `manut-prod`.
- Production deploy evidence is stored at
  `process/features/cloudflare-stack-migration/reports/phase-07-cloudflare-production-deploy_21-06-26.json`.
- Production smoke evidence is stored at
  `process/features/cloudflare-stack-migration/reports/phase-07-cloudflare-production-smoke_21-06-26.json`.
- `app.manut.xyz` DNS has not been changed and still uses the current GKE/GCP
  production stack.

The deploy job writes `Production DNS changed: false` and does not update
`app.manut.xyz` routing. DNS cutover remains a separate Phase 7 operator action.

## Cutover Readiness Checker

Phase 7 and Phase 8 are blocked until the local readiness gate passes:

```bash
pnpm --filter @manut/cloudflare cutover:readiness
pnpm --filter @manut/cloudflare cutover:readiness -- --phase phase-08
```

The checker is non-destructive. By default it evaluates the Phase 7 production
cutover gate. Use `--phase phase-08` for decommission, or `--phase all` for a
full program audit. It reads local phase reports plus explicit evidence paths
from environment variables and exits `1` while hard gates are missing.

Required Phase 7 evidence:

- `CLOUDFLARE_PREVIEW_SMOKE_REPORT`
- `CLOUDFLARE_PRODUCTION_DEPLOY_REPORT`
- `CLOUDFLARE_PRODUCTION_SMOKE_REPORT`
- `D1_IMPORT_VALIDATION_REPORT`
- `R2_MANIFEST_VALIDATION_REPORT`
- `LIVE_SHADOW_TEST_REPORT`
- `AUTHENTICATED_SMOKE_REPORT`
- `BETTERSTACK_CUTOVER_REPORT`
- `CUTOVER_APPROVED=true`

Required Phase 8 evidence:

- `SEVEN_GREEN_DAYS_REPORT`

At the current migration state the expected output is `Cutover readiness:
BLOCKED`. That is correct until preview/prod deploy evidence, D1/R2 validation,
authenticated smoke, Better Stack checks, and explicit operator approval are
recorded.

The preview smoke gate has local evidence at
`process/features/cloudflare-stack-migration/reports/phase-07-cloudflare-preview-smoke_21-06-26.json`.
The readiness checker uses that default path if
`CLOUDFLARE_PREVIEW_SMOKE_REPORT` is not set.

The production Worker deploy gate has local evidence at
`process/features/cloudflare-stack-migration/reports/phase-07-cloudflare-production-deploy_21-06-26.json`.
The readiness checker validates JSON evidence by requiring `ok: true`, including
for env-provided report paths. High-risk cutover gates also validate the report
shape:

- D1 import evidence must include `summary`, `source_counts`,
  `target_counts`, passing `count_report`, at least one `relationship_checks`
  entry, zero count-table mismatches, zero failed relationship checks, and every
  relationship row must pass with zero orphans.
- R2 manifest evidence must come from strict checksum validation, include
  `source_manifest` and `target_manifest`, require shared checksums, have zero
  object mismatches, include an empty `mismatches` array, and have equal source,
  target, and matched object counts.
- Authenticated smoke evidence must include every required workflow check with
  passing evidence.
- Better Stack cutover evidence must include the required `public-site`,
  `app-root`, and `api-instances` monitor checks, and every monitor check must
  be `up`.
- Phase 8 seven-green-days evidence must set `green_days_verified: true` and
  include `cutover_at`, `verified_through`, at least seven full days between
  those timestamps, and passing evidence checks for Better Stack monitors,
  Cloudflare Worker logs, D1 backup/export, R2 backup/export, and rollback
  retention.

Evidence paths supplied through env vars use the gate definition for validation,
so arbitrary file names do not bypass these contracts. High-risk evidence files
must be JSON.

## Phase 8 Seven Green Days Evidence

After Cloudflare cutover, build the decommission gate report from operator
evidence:

```bash
pnpm --filter @manut/cloudflare seven-green-days:report -- \
  --input phase8-stability-evidence.json \
  --out process/features/cloudflare-stack-migration/reports/phase-08-seven-green-days_21-06-26.json
pnpm --filter @manut/cloudflare cutover:readiness -- --phase phase-08
```

The input must cover at least seven full days from `cutover_at` through
`verified_through` and include these passing check IDs with evidence:

- `betterstack-monitors`
- `cloudflare-worker-logs`
- `d1-backup-export`
- `r2-backup-export`
- `rollback-retention`

This report does not approve destructive work by itself. Each provider resource
class still needs a separate destructive-action approval before GKE/GCP
resources are disabled or removed.

## Cutover Rule

Do not change `app.manut.xyz` routing until the selected phase report proves:

- Worker frontend routing is correct.
- `/api/instances/` and representative API routes match current GKE contracts.
- D1 import checks pass.
- R2 object checks pass.
- live/update and upload smoke pass.
- Better Stack preview checks are green.

## Live Shadow Validation

The Worker exposes diagnostic Durable Object live rooms under
`/api/cloudflare/live/rooms/*`. Public `/live/*` remains legacy-proxied to GKE
until Phase 7 cutover passes. Use `pnpm --filter @manut/cloudflare live:shadow`
against the deployed Worker URL to validate health, metadata, lock
acquire/conflict/release behavior, and WebSocket echo. Only commit
`phase-07-live-shadow-validation_21-06-26.json` when the report has `ok: true`.

## Authenticated Smoke Evidence

Authenticated smoke is operator-captured because it requires a real user
session and must not embed credentials in the repo. Capture manual evidence as
JSON and normalize it with:

```bash
pnpm --filter @manut/cloudflare auth:smoke-report -- --input manual-auth-smoke.json --out process/features/cloudflare-stack-migration/reports/phase-07-authenticated-smoke_21-06-26.json
```

The readiness gate rejects weak `ok: true` placeholders. Every required check
must pass and include evidence:

- `login`
- `session-refresh`
- `workspace-sidebar`
- `project-list`
- `work-item-create`
- `work-item-edit`
- `work-item-delete`
- `upload-attachment`
- `live-update`
- `admin-route`
- `public-space-route`

Minimal input shape:

```json
{
  "actor": "operator@example.com",
  "target_origin": "https://app.manut.xyz",
  "checks": [
    {
      "id": "login",
      "ok": true,
      "evidence": "screenshot path, recording id, or concise operator note",
      "observed_at": "2026-06-21T12:00:00.000Z"
    }
  ]
}
```

## R2 Upload Validation

`/uploads/*` R2 reads are disabled by default. A Worker environment must set
`R2_UPLOADS_READ_ENABLED=true` before the route enters the R2 compatibility
handler. Without that flag, upload requests remain legacy-proxied to GKE/GCS.

Before enabling the flag in any shared environment:

1. Export a GCS manifest from `plane-affine-495114-uploads`.
2. Export an R2 manifest from `manut-uploads-preview` or `manut-uploads-prod`.
3. Compare the manifests:

```bash
pnpm --filter @manut/cloudflare uploads:validate -- gcs-manifest.json r2-manifest.json --out process/features/cloudflare-stack-migration/reports/phase-07-r2-manifest-validation_21-06-26.json
```

Accepted manifest rows can include `key`, `name`, `object`, `objectKey`, or
`path` plus `size` and optional checksum fields such as `crc32c`, `etag`,
`md5Hash`, or `sha256`.

`uploads:validate` requires at least one shared checksum field per object. Use
plain `uploads:compare` only for exploratory size/key checks; it is not strong
enough to satisfy Phase 7 cutover evidence.

The final `phase-07-r2-manifest-validation_21-06-26.json` report will be
rejected by readiness unless it has `checksumPolicy.requireSharedChecksum: true`,
`mismatchedObjectCount: 0`, `source_manifest`, `target_manifest`, and equal
source, target, and matched object counts, plus an empty `mismatches` array.

The R2 bucket must deny anonymous listing for bare `/uploads` and allow object
reads only through the Worker route. CORS for `manut-uploads-prod` should allow
`https://app.manut.xyz` for the methods used by the app upload flow.

## D1 Shadow Reads

The first D1-backed backend slice is intentionally exposed only through
Cloudflare diagnostic routes:

- `GET /api/cloudflare/d1/workspaces`
- `GET /api/cloudflare/d1/workspaces/:workspaceSlug/projects`

These routes require the `MANUT_DB` binding. If it is missing, they return
`503 D1_BINDING_MISSING`. They do not replace production `/api/v1/*` routes and
always report `cutover_ready: false`.

Before any production API route can use this D1 implementation:

1. Export Cloud SQL row counts for the selected tables.
2. Import the same rows into the matching D1 tables.
3. Compare counts:

```bash
pnpm --filter @manut/cloudflare d1:validate-import -- postgres-counts.json d1-counts.json --relationships relationship-checks.json --out process/features/cloudflare-stack-migration/reports/phase-07-d1-import-validation_21-06-26.json
```

4. Validate relationships such as `projects.workspace_id -> workspaces.id`.
5. Add contract tests comparing GKE and Worker responses for representative
   workspaces/projects.
6. Add auth and membership enforcement for any user-facing route.

The final `phase-07-d1-import-validation_21-06-26.json` report will be rejected
by readiness unless it has zero count mismatches, zero failed relationship
checks, `source_counts`, `target_counts`, passing `count_report`, and at least
one relationship check where every row passes with zero orphans.

Relationship check files can use:

```json
{
  "checks": [
    {
      "name": "projects.workspace_id",
      "source": "projects",
      "target": "workspaces",
      "orphanCount": 0
    }
  ]
}
```

## Queue, Cache, Lock, and Live Primitives

Phase 5 keeps the current Celery/RabbitMQ/Redis/live Node services active while
adding Cloudflare-native primitives:

- Cloudflare Queues envelope validation and consumer failure behavior for
  `upload-audit`, `migration-audit`, `email-dispatch`, and `import-export`.
- KV JSON cache helpers under `apps/cloudflare/src/cache.ts`; missing bindings
  return explicit `KV_BINDING_MISSING` misses instead of silent fallbacks.
- Durable Object room locks under
  `/live/{room}/locks/{lockKey}/acquire` and
  `/live/{room}/locks/{lockKey}/release`; lock conflicts return HTTP `409`.
- Live room health/metadata endpoints continue to report WebSocket
  collaboration as not implemented until shadow tests exist.

Replacement mapping:

| Current GCP/GKE dependency        | Cloudflare target             | Phase 5 status                             |
| --------------------------------- | ----------------------------- | ------------------------------------------ |
| RabbitMQ/Celery dispatch          | Cloudflare Queues             | Envelope and retry/failure primitives only |
| Celery beat                       | Scheduled Workers / Workflows | Planned                                    |
| Redis cache                       | KV for cacheable JSON         | Helper implemented                         |
| Redis locks / strong coordination | Durable Objects               | Room lock primitive implemented            |
| Node live WebSocket service       | Durable Objects WebSockets    | Planned, not production-ready              |
