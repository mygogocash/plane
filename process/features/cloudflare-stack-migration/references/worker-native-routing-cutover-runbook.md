# Worker-Native API Slice 5 Routing Cutover Runbook

**Status:** READY FOR OPERATOR EXECUTION  
**Plan:** `active/worker-native-api-migration_PLAN_25-06-26.md`  
**Prerequisite:** Slices 1–4 code deployed; D1 identity import validated; `WORKER_NATIVE_API_ENABLED` tested on workers.dev

## Goal

Route production `app.manut.xyz` `/api/*` and `/auth/*` through the Cloudflare Worker instead of direct GKE ingress, while keeping `/auth/*` legacy-proxied until native magic-login ships.

## Preconditions

1. D1 migrations `0003_identity_core` and `0004_issues_core` applied to `manut-prod`
2. Identity import validation report passes (`users`, `profiles`, `workspace_members`)
3. Worker deploy includes native handlers for smoke routes
4. `LEGACY_GKE_ORIGIN` secret points at GKE internal/public origin (not `APP_ORIGIN`)
5. Session bridge verified: logged-in cookie on workers.dev returns D1-backed `/api/users/me/workspaces/`

## Step 1 — Enable native routes on production Worker (no DNS change yet)

```bash
cd apps/cloudflare
wrangler secret put WORKER_NATIVE_API_ENABLED --env production
# value: true
pnpm deploy:production
```

Validate on workers.dev with session cookie:

```bash
curl -sS -b "$SESSION_COOKIE" \
  "https://manut-app.bettergogocash.workers.dev/api/users/me/workspaces/" \
  -H 'accept: application/json' | jq .
```

Expect `x-manut-edge-route: worker-native-api` and no Django `allow:` header.

## Step 2 — Route `app.manut.xyz` through Cloudflare Worker

Current state: API traffic bypasses Worker and hits GKE directly.

Operator actions in Cloudflare dashboard:

1. Confirm `app.manut.xyz` DNS is proxied (orange cloud)
2. Add/adjust route: `app.manut.xyz/*` → `manut-app` production Worker
3. Ensure GKE ingress is reachable only as `LEGACY_GKE_ORIGIN` (not public default for `/api/*`)

Rollback: remove Worker route or set `WORKER_NATIVE_API_ENABLED=false`.

## Step 3 — Re-run authenticated smoke on production hostname

```bash
pnpm --filter @manut/cloudflare auth:smoke-report -- \
  --input process/features/cloudflare-stack-migration/reports/phase-07-authenticated-smoke-input_24-06-26.json \
  --out process/features/cloudflare-stack-migration/reports/phase-09-worker-native-smoke_25-06-26.json
```

Required checks: login, workspace sidebar, project list, work-item CRUD, upload path.

## Step 4 — Capture cutover evidence

```bash
CUTOVER_APPROVED=true pnpm --filter @manut/cloudflare cutover:readiness --phase phase-08 --json
pnpm --filter @manut/cloudflare smoke:worker -- https://app.manut.xyz --json
```

## Step 5 — GCP teardown gate

Only after Slice 5 smoke passes on `app.manut.xyz`:

- Execute Phase 8 destructive checklist (`phase-08-decommission_PLAN_21-06-26.md`)
- Keep backups (`phase-08-gcp-backups-final_25-06-26.json`) until operator sign-off

## Known gaps (post–Slice 5 follow-up)

| Area                    | Behavior during Slice 5                                                           |
| ----------------------- | --------------------------------------------------------------------------------- |
| `/auth/magic-*`         | Legacy-proxied to GKE (session bridge depends on Django cookies)                  |
| Non-registered `/api/*` | Legacy-proxied to GKE                                                             |
| Issue parity            | D1 CRUD covers smoke paths; full Django issue graph not migrated                  |
| Uploads                 | Native presign returns R2 PUT URL; confirm frontend contract before disabling GCS |

## Verification signals

| Signal                           | Worker-native                           | Legacy GKE                     |
| -------------------------------- | --------------------------------------- | ------------------------------ |
| Response header                  | `x-manut-edge-route: worker-native-api` | `allow: GET, PATCH, ...` (DRF) |
| `/api/instances/` `app_base_url` | non-null on Worker                      | null on direct GKE today       |
| Data source                      | D1 `MANUT_DB`                           | Cloud SQL                      |
