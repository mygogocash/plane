# Worker-Native API Slices 1–5 — Start Report

**Date:** 2026-06-25  
**Plan:** `active/worker-native-api-migration_PLAN_25-06-26.md`

## Summary

Slices 1–4 are implemented in code; Slice 5 operator runbook is ready. Production D1 now has identity schema + imported rows.

## Slice 1 — Identity import ✅

- Extended `d1-import-validation-queries.mjs` for `users`, `profiles`, `workspace_members`, `issues`
- Added `d1-identity-import.mjs` + `d1-identity-sql.mjs` (`pnpm d1:identity-import`)
- Applied migrations `0003_identity_core` + `0004_issues_core` to `manut-prod`
- Imported from GKE Postgres via kubectl: **3 users**, **3 profiles**, **4 workspace_members**
- Evidence: `reports/worker-native-slice1-identity-import_25-06-26.json`

## Slice 2 — Authenticated reads ✅ (code)

- `session-bridge.ts` validates Django session via legacy `GET /api/users/me/`
- Native handlers: `GET /api/users/me/`, `/api/users/me/settings/`, `/api/users/me/workspaces/`
- Auth routes (`/auth/magic-*`) remain legacy-proxied until native magic-login ships

## Slice 3 — Workspace/project reads ✅ (code)

- `GET /api/workspaces/:slug/`
- `GET /api/workspaces/:slug/projects/`

## Slice 4 — Writes + uploads ✅ (code)

- Issue list/create/patch/delete on D1
- `POST /api/assets/v2/workspaces/:slug/` presign stub (R2 PUT URL + `file_assets` row)

## Slice 5 — Production routing cutover ✅ (deployed)

Operator runbook: `references/worker-native-routing-cutover-runbook.md`  
Evidence: `reports/worker-native-slice5-routing-cutover_25-06-26.json`

**Executed:**

1. Deployed Worker `manut-app` v `63d03532-d1f2-4c8b-a81b-871941ae1321`
2. `WORKER_NATIVE_API_ENABLED=true` on production
3. Route `app.manut.xyz/*` → Worker (live)
4. `LEGACY_GKE_RESOLVE_OVERRIDE=34.143.231.225` fixes legacy proxy loop (was 403/1003)
5. Public smoke: **6/7** pass on `app.manut.xyz` (diagnostic D1 shadow needs `MANUT_DIAGNOSTIC_TOKEN`)

**Still operator-owned:**

- Authenticated smoke on production hostname (`auth:smoke-report`)
- Phase 8 GCP teardown after authenticated smoke passes

## Verification (local)

```text
pnpm --filter @manut/cloudflare test -- --run   # 261/261 passed
pnpm --filter @manut/cloudflare check           # tsc clean
```

## Rollback

Unset `WORKER_NATIVE_API_ENABLED` or remove Worker route; legacy GKE proxy remains configured via `LEGACY_GKE_ORIGIN`.
