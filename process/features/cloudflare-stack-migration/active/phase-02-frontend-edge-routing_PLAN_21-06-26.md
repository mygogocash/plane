# Phase 2 - Frontend and Edge Routing

**Status:** CODE DONE and locally verified for route foundation; production routing blocked

## Objective

Create the Cloudflare edge routing layer for `app.manut.xyz` while keeping
legacy GKE as the active production origin.

## Scope

- Classify app paths by Cloudflare-local, legacy-proxied, static frontend, and
  blocked/planned behavior.
- Preserve `/api/instances/` as a local Worker contract anchor.
- Proxy not-yet-migrated `/api/*`, `/auth/*`, `/live/*`, `/spaces`, and
  `/god-mode` routes to `LEGACY_GKE_ORIGIN` during shadow testing.
- Prepare for future Pages or Workers Assets static frontend delivery.

## Implementation Tasks

- Add route classification and proxy helpers.
- Add contract tests for local `/api/instances/` handling and legacy proxy
  candidates.
- Keep all production DNS and ingress unchanged.

## Tests

- `pnpm --filter @manut/cloudflare check`
- `pnpm --filter @manut/cloudflare test`
- Worker dry-run with explicit preview environment.

## Rollback

Disable or remove the Cloudflare router package. Since DNS remains on GKE, no
public rollback action is required.

## Done When

- Edge route tests pass.
- Legacy proxy behavior is explicit and observable.
- No route silently claims migration completion before the backend/asset service
  exists.

## Phase 2 Evidence

- Report: `process/features/cloudflare-stack-migration/reports/phase-02-frontend-edge-routing-evidence_21-06-26.md`
- Local Worker route map: `/api/cloudflare/routes`
- Production cutover status: blocked until Phase 3/4/5 validation and authenticated smoke pass.
