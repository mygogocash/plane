# Worker-Native API Migration

**Status:** IN_PROGRESS — Slices 1–4 implemented in code; Slice 5 runbook ready for operator cutover  
**Parent:** `phase-04-d1-backend-rewrite_PLAN_21-06-26.md`, `phase-08-decommission_PLAN_21-06-26.md`  
**Blocker removed by:** GKE must stay until this program completes on `app.manut.xyz`

## Objective

Serve production `app.manut.xyz` API and auth from the Cloudflare Worker + D1/R2/KV/Queues
stack with Django contract parity, then retire the GKE Django runtime.

## Current state (2026-06-25)

| Layer           | Status                                                                                               |
| --------------- | ---------------------------------------------------------------------------------------------------- |
| D1 data         | `workspaces` (3), `projects` (10) imported; identity import tooling + migrations `0003`/`0004` ready |
| Worker routes   | Native handlers registered behind `WORKER_NATIVE_API_ENABLED` (session bridge + D1 reads/writes)     |
| `app.manut.xyz` | **Bypasses Worker** for API — hits GKE Django directly today                                         |
| Auth            | Magic login + sessions on GKE (Redis + Celery email)                                                 |

## Migration slices (strict order)

### Slice 0 — Router foundation (this PR)

- `WORKER_NATIVE_API_ENABLED` feature flag (default off)
- `api-router.ts` route registry + dispatch
- D1 migration `0003_identity_core.sql` (schema only)
- Endpoint inventory reference doc
- Migration status reports `active_phase: worker-native-api-migration`

### Slice 1 — Identity import

- Extend Postgres → D1 import for `users`, `profiles`, `workspace_members`
- Update `d1:validate-import` required tables for identity slice
- Import production identity rows before enabling native routes in prod

### Slice 2 — Read APIs (authenticated)

- Worker session bridge (KV magic tokens → session cookie contract)
- `POST /auth/magic-generate/` + queue `email-dispatch` (Resend)
- `POST /auth/magic-sign-in/` (form POST redirect parity)
- `GET /api/users/me/`
- `GET /api/users/me/settings/`
- `GET /api/users/me/workspaces/` (D1 join)
- Contract tests vs GKE shadow responses

### Slice 3 — Workspace + project reads

- `GET /api/workspaces/:slug/`
- `GET /api/workspaces/:slug/projects/`
- Issue list/detail read paths used by authenticated smoke

### Slice 4 — Writes + uploads

- Issue create/edit/delete on D1
- R2 upload signing (`/api/assets/v2/...`) replacing GCS presigned POST
- Queue consumers for async side effects

### Slice 5 — Production routing cutover

- Point `app.manut.xyz` `/api/*` and `/auth/*` through Worker (not direct GKE)
- Enable `WORKER_NATIVE_API_ENABLED=true` per-route rollout
- Re-run authenticated smoke; compare Django vs Worker headers (no `allow: GET, PATCH` from DRF)
- Only then execute GCP runtime teardown (Phase 8 destructive checklist)

## Hard gates (each slice)

1. TDD: failing contract test → minimal handler → green suite
2. D1 import validation for any new table before prod enable
3. Legacy proxy remains fallback when flag off or handler returns `501`
4. No GCP deletion until Slice 5 smoke passes on production hostname

## Key files

| Area                | Path                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| Router              | `apps/cloudflare/src/api-router.ts`                                                              |
| Native handlers     | `apps/cloudflare/src/native-api/`                                                                |
| D1 migrations       | `apps/cloudflare/migrations/`                                                                    |
| Edge classification | `apps/cloudflare/src/edge-routing.ts`                                                            |
| Endpoint inventory  | `process/features/cloudflare-stack-migration/references/worker-native-api-endpoint-inventory.md` |
| Django contracts    | `apps/api/plane/tests/contract/`                                                                 |

## Verification

```bash
pnpm --filter @manut/cloudflare test -- --run src/api-router.test.ts src/edge-routing.test.ts src/index.test.ts
pnpm --filter @manut/cloudflare smoke:worker -- https://manut-app.bettergogocash.workers.dev --json
```

## Rollback

Set `WORKER_NATIVE_API_ENABLED=false` (or unset). All registered native routes fall back to
`LEGACY_GKE_ORIGIN` proxy. GKE remains unchanged.
