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

Provider-backed resource creation is not recorded in this repository yet. This
phase is code-foundation complete, not production-provisioning complete.

Expected target resources:

- Preview Worker: `manut-app-preview`
- Preview D1: `manut-preview`
- Preview R2: `manut-uploads-preview`
- Preview Queue: `manut-jobs-preview`
- Preview KV: `manut-config-preview`
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
```

Result from later phase verification:

- TypeScript check passed.
- Worker tests passed.
- Wrangler dry-run passed.

## Cutover Status

Blocked. Preview and production provider resources still need recorded
deployment/provisioning evidence before `app.manut.xyz` can move to
Cloudflare.

## Rollback

No production traffic or data is moved by this phase. Remove or ignore the
Cloudflare package and keep the current GKE/GCP stack active.
