# Phase 2 Frontend and Edge Routing Evidence

Captured: 2026-06-21T08:34:11Z

## Scope Completed

- Added `/api/cloudflare/routes` as a local Worker route-map endpoint for Phase 2 shadow routing.
- Updated `/api/cloudflare/migration-status` to report `frontend-edge-routing` as the active implemented phase.
- Added `x-manut-edge-route`, `x-manut-edge-contract`, and `x-manut-cloudflare-phase` headers to legacy-proxy requests/responses.
- Kept app shell, static assets, `/api/*`, `/auth/*`, `/live/*`, `/uploads/*`, `/spaces`, and `/god-mode` as legacy-proxy candidates.
- Kept `cutover_ready: false`; no DNS, GKE, GCS, D1, R2, or production Worker routing was changed.

## Route Contract

Representative `/api/cloudflare/routes` classifications:

| Path                               | Action         | Contract     |
| ---------------------------------- | -------------- | ------------ |
| `/healthz`                         | `local`        | Worker route |
| `/api/instances/`                  | `local`        | Worker route |
| `/api/cloudflare/migration-status` | `local`        | Worker route |
| `/api/workspaces/`                 | `legacy-proxy` | `api`        |
| `/auth/login`                      | `legacy-proxy` | `auth`       |
| `/live/workspace/ws-id/`           | `legacy-proxy` | `live`       |
| `/uploads/workspace/logo.png`      | `legacy-proxy` | `uploads`    |
| `/spaces`                          | `legacy-proxy` | `spaces`     |
| `/god-mode`                        | `legacy-proxy` | `god-mode`   |
| `/assets/index.js`                 | `legacy-proxy` | `static`     |
| `/`                                | `legacy-proxy` | `app-shell`  |

The route map only reports whether `LEGACY_GKE_ORIGIN` is configured. It does not expose the origin value.

## Verification Commands

```bash
pnpm --filter @manut/cloudflare check
pnpm --filter @manut/cloudflare test
pnpm --filter @manut/cloudflare exec wrangler deploy --dry-run --env="" --outdir /tmp/manut-cloudflare-phase2-dry-run
pnpm --filter @manut/cloudflare baseline
```

## Results

- `pnpm --filter @manut/cloudflare check`: passed.
- `pnpm --filter @manut/cloudflare test`: passed, 5 files and 37 tests.
- Wrangler dry-run: passed, upload size `253.61 KiB`, gzip `52.14 KiB`.
- Baseline:
  - `manut.xyz`: HTTP `200`, served by Cloudflare, contains `Manut`.
  - `app.manut.xyz/api/instances/`: HTTP `200`, current GKE app API remains reachable.
  - `app.manut.xyz`: DNS A record remains `34.143.231.225`.
  - `app.manut.xyz/uploads`: HTTP `403` XML GCS access-denied response, preserving current GCS-backed behavior.

## Rollback

No public rollback action is needed for this phase because nothing was deployed or routed publicly.
If a preview Worker deployment later exposes incorrect routing, remove or disable the Worker route
and keep `app.manut.xyz` on the current GKE origin.

## Remaining Blockers

- Static frontend delivery through Pages or Workers Assets is not enabled yet.
- `/uploads/*` remains legacy-proxied until R2 object count/checksum validation passes.
- Backend API routes remain legacy-proxied until the D1 Worker API reaches contract parity.
- `/live/*` remains legacy-proxied until Durable Object WebSocket rooms pass shadow tests.
