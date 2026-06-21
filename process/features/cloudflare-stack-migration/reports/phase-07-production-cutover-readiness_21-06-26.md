# Phase 7 Production Cutover Readiness

Captured: 2026-06-21T09:20:00Z

## Status

Blocked. The cutover plan now exists, but production cutover cannot safely run
until external data, smoke, observability, and approval evidence exists.

## Latest Known Runtime Baseline

Latest captured baseline during this report:

- `manut.xyz` served HTTP `200` through Cloudflare and contained Manut branding.
- `app.manut.xyz/` served HTTP `200` from the current app origin.
- `app.manut.xyz/api/instances/` returned HTTP `503` from the current GKE app
  path at `2026-06-21T09:19:16Z`, then returned HTTP `200` with JSON at
  `2026-06-21T09:26:47Z` and again at `2026-06-21T09:40:09Z`.
- `app.manut.xyz` DNS still resolved to GKE IP `34.143.231.225`.
- `/uploads` still returned the current GCS-backed HTTP `403` XML response.
- Latest post-production-Worker baseline at `2026-06-21T10:01:13Z` returned
  HTTP `200` for `https://app.manut.xyz/api/instances/`, HTTP `403` for
  `/uploads`, and still resolved `app.manut.xyz` to GKE IP `34.143.231.225`.

## Readiness Gate

Run:

```bash
pnpm --filter @manut/cloudflare cutover:readiness
```

Expected current result:

- `Cutover readiness: BLOCKED`
- `Phase 7 cutover ready: no`
- `Phase 8 decommission ready: no`
- `Selected checks passed: 10/16`

Better Stack cutover evidence command:

```bash
pnpm --filter @manut/cloudflare betterstack:cutover-report -- --out process/features/cloudflare-stack-migration/reports/phase-07-betterstack-cutover_21-06-26.json
```

That report requires `BETTERSTACK_API_TOKEN` and expects all three Better Stack
monitors to be `up`: `manut.xyz`, `app.manut.xyz`, and
`app.manut.xyz API instances`.

## Preview Cloudflare Smoke

Report:
`process/features/cloudflare-stack-migration/reports/phase-07-cloudflare-preview-smoke_21-06-26.json`

Result:

- `https://manut-app-preview.bettergogocash.workers.dev/healthz` returned HTTP
  `200`.
- `/api/instances/` returned HTTP `200` with Manut instance metadata.
- `/api/cloudflare/migration-status` returned HTTP `200` and confirmed the
  legacy proxy is configured.
- `/api/cloudflare/routes` returned HTTP `200` and `cutover_ready: false`.
- `/api/cloudflare/d1/workspaces` returned HTTP `200` from D1 shadow reads.
- `/api/workspaces/` proxied to legacy GKE and returned HTTP `401` with
  `x-manut-edge-route: legacy-gke`.
- `/uploads` proxied to legacy GKE/GCS and returned HTTP `403` with
  `x-manut-edge-route: legacy-gke`.

Preview deploy evidence:

- Worker: `manut-app-preview`
- URL: `https://manut-app-preview.bettergogocash.workers.dev`
- Version ID: `2856b18f-2e3d-4a0b-94f9-f9276bd1c2b0`
- Queue producer: `manut-jobs-preview`
- Queue consumer: `manut-jobs-preview`

## Production Cloudflare Worker Evidence

Reports:

- `process/features/cloudflare-stack-migration/reports/phase-07-cloudflare-production-deploy_21-06-26.json`
- `process/features/cloudflare-stack-migration/reports/phase-07-cloudflare-production-smoke_21-06-26.json`

Deploy result:

- Worker: `manut-app`
- URL: `https://manut-app.bettergogocash.workers.dev`
- Version ID: `6549b2cf-5254-495c-a407-549242cb7595`
- D1: `manut-prod` (`a29a2712-f899-45ee-8ab9-f64afded7e1c`)
- R2: `manut-uploads-prod`
- KV: `manut-config-prod` (`e3fdd6cf29dc4f03a9a240830814c629`)
- Queue producer and consumer: `manut-jobs-prod`
- DNS changed: `false`

Smoke result:

- `https://manut-app.bettergogocash.workers.dev/healthz` returned HTTP `200`.
- `/api/instances/` returned HTTP `200` with Manut instance metadata.
- `/api/cloudflare/migration-status` returned HTTP `200` and confirmed the
  legacy proxy is configured.
- `/api/cloudflare/routes` returned HTTP `200` and `cutover_ready: false`.
- `/api/cloudflare/d1/workspaces` returned HTTP `200` from D1 shadow reads
  with an empty production D1 dataset.
- `/api/workspaces/` proxied to legacy GKE and returned HTTP `401` with
  `x-manut-edge-route: legacy-gke`.
- `/uploads` proxied to legacy GKE/GCS and returned HTTP `403` with
  `x-manut-edge-route: legacy-gke`.

## Blocking Evidence Gaps

- No final D1 import validation report is recorded.
- No final R2 manifest validation report is recorded.
- No Durable Object live shadow test report is recorded.
- No authenticated app smoke report is recorded.
- No Better Stack cutover-green report is recorded.
- No explicit `CUTOVER_APPROVED=true` operator approval is recorded.

## Operator Decision

Do not change `app.manut.xyz` routing yet. Keep GKE/GCP as active production
runtime and rollback anchor.

## Production Health Note

The current app API had a transient non-green probe during this phase:
`/api/instances/` returned HTTP `503` once and later returned HTTP `200`.
Continue monitoring before using the GKE API as a parity source for Cloudflare
contract tests or a rollback target.

The latest baseline in this report returned HTTP `200` for
`https://app.manut.xyz/api/instances/`, while DNS still pointed
`app.manut.xyz` at GKE IP `34.143.231.225`.
