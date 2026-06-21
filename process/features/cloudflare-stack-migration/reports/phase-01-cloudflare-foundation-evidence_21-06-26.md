# Phase 1 Cloudflare Foundation Evidence

Captured: 2026-06-21T09:20:00Z

## Scope Completed

- Added the `@manut/cloudflare` Worker package.
- Added Wrangler configuration for preview and production resource names.
- Added D1 migrations for foundation and first shadow core tables.
- Added bindings for D1, R2, Queue, KV, and Durable Object primitives.
- Added local validation scripts for baseline capture, D1 row-count comparison,
  upload manifest comparison, and model inventory.

## Current Provisioning Status

Preview provider-backed resources were created with local Wrangler OAuth. This
phase is preview-foundation provisioned, not production-provisioning complete.

Expected target resources:

- Preview Worker: `manut-app-preview`
- Preview Worker URL: `https://manut-app-preview.bettergogocash.workers.dev`
- Preview D1: `manut-preview`
- Preview D1 ID: `28b4db1a-005d-4814-b607-0f82900ce4bd`
- Preview R2: `manut-uploads-preview`
- Preview Queue: `manut-jobs-preview`
- Preview KV: `manut-config-preview`
- Preview KV ID: `fb075b2d3c8e459eb07cd7e82e741b48`
- Production Worker: `manut-app`
- Production D1: `manut-prod`
- Production R2: `manut-uploads-prod`
- Production Queue: `manut-jobs-prod`
- Production KV: `manut-config-prod`

## Verification Commands

```bash
pnpm --filter @manut/cloudflare check
pnpm --filter @manut/cloudflare test
pnpm --filter @manut/cloudflare exec wrangler deploy --dry-run --env="" --outdir /tmp/manut-cloudflare-phase6-dry-run
CLOUDFLARE_ACCOUNT_ID=187ab61ed9dbc6e616cb23e6b95aa8f1 pnpm --filter @manut/cloudflare db:migrate:preview
CLOUDFLARE_ACCOUNT_ID=187ab61ed9dbc6e616cb23e6b95aa8f1 pnpm --filter @manut/cloudflare deploy:preview
```

Result:

- TypeScript check passed.
- Worker tests passed.
- Wrangler dry-run passed.
- Remote preview D1 migrations `0001_foundation.sql` and
  `0002_shadow_core.sql` applied successfully.
- Preview Worker deployed successfully with bindings for D1, R2, KV, Queue, and
  Durable Objects.
- Queue producer and consumer triggers attached to `manut-jobs-preview`.
- Preview Worker version ID:
  `2856b18f-2e3d-4a0b-94f9-f9276bd1c2b0`.

## Cutover Status

Blocked. Preview foundation exists, but production provider resources, GitHub
Cloudflare credentials, data migration, authenticated smoke, and DNS cutover
approval are still missing before `app.manut.xyz` can move to Cloudflare.

## Rollback

No production traffic or data is moved by this phase. Remove or ignore the
Cloudflare package and keep the current GKE/GCP stack active.
