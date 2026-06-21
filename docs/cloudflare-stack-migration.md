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
- D1: `manut-preview`
- R2: `manut-uploads-preview`
- Queue: `manut-jobs-preview`
- KV: `manut-config-preview`
- Durable Object: `LiveRoomDurableObject`

Production:

- Worker: `manut-app`
- D1: `manut-prod`
- R2: `manut-uploads-prod`
- Queue: `manut-jobs-prod`
- KV: `manut-config-prod`
- Durable Object: `LiveRoomDurableObject`

## Required Secrets and Variables

GitHub variables:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_ZONE_ID`
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
pnpm --filter @manut/cloudflare uploads:compare -- <gcs-manifest.json> <r2-manifest.json>
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
- GitHub variable `CLOUDFLARE_ZONE_ID`

The deploy job writes `Production DNS changed: false` and does not update
`app.manut.xyz` routing. DNS cutover remains a separate Phase 7 operator action.

## Cutover Rule

Do not change `app.manut.xyz` routing until the selected phase report proves:

- Worker frontend routing is correct.
- `/api/instances/` and representative API routes match current GKE contracts.
- D1 import checks pass.
- R2 object checks pass.
- live/update and upload smoke pass.
- Better Stack preview checks are green.

## R2 Upload Validation

`/uploads/*` R2 reads are disabled by default. A Worker environment must set
`R2_UPLOADS_READ_ENABLED=true` before the route enters the R2 compatibility
handler. Without that flag, upload requests remain legacy-proxied to GKE/GCS.

Before enabling the flag in any shared environment:

1. Export a GCS manifest from `plane-affine-495114-uploads`.
2. Export an R2 manifest from `manut-uploads-preview` or `manut-uploads-prod`.
3. Compare the manifests:

```bash
pnpm --filter @manut/cloudflare uploads:compare -- gcs-manifest.json r2-manifest.json
```

Accepted manifest rows can include `key`, `name`, `object`, `objectKey`, or
`path` plus `size` and optional checksum fields such as `crc32c`, `etag`,
`md5Hash`, or `sha256`.

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
pnpm --filter @manut/cloudflare d1:compare -- postgres-counts.json d1-counts.json
```

4. Validate relationships such as `projects.workspace_id -> workspaces.id`.
5. Add contract tests comparing GKE and Worker responses for representative
   workspaces/projects.
6. Add auth and membership enforcement for any user-facing route.

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
