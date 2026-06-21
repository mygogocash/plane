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
```

## Provisioning Order

1. Create preview Cloudflare resources.
2. Apply D1 foundation migration to preview.
3. Deploy preview Worker.
4. Run contract tests against preview and current GKE.
5. Repeat for production only after preview is green.

## Cutover Rule

Do not change `app.manut.xyz` routing until the selected phase report proves:

- Worker frontend routing is correct.
- `/api/instances/` and representative API routes match current GKE contracts.
- D1 import checks pass.
- R2 object checks pass.
- live/update and upload smoke pass.
- Better Stack preview checks are green.
