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
  `2026-06-21T09:26:47Z`.
- `app.manut.xyz` DNS still resolved to GKE IP `34.143.231.225`.
- `/uploads` still returned the current GCS-backed HTTP `403` XML response.

## Readiness Gate

Run:

```bash
pnpm --filter @manut/cloudflare cutover:readiness
```

Expected current result:

- `Cutover readiness: BLOCKED`
- `Phase 7 cutover ready: no`
- `Phase 8 decommission ready: no`
- `Selected checks passed: 8/16`

## Blocking Evidence Gaps

- No Cloudflare preview smoke report is recorded.
- No production Cloudflare deploy report is recorded.
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
