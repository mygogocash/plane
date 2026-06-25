# Phase 7 Production Cutover — Execution Runbook

**Status:** BLOCKED until all hard gates pass  
**Origin:** `https://app.manut.xyz`  
**Rollback:** GKE/GCP remains live until Phase 8 decommission is approved

## Quick prep

```bash
cd /Users/kunanonjarat/Developer/mygogocash-plane
pnpm --filter @manut/cloudflare cutover:prep --json
```

This runs readiness, prints blocker commands, regenerates input templates, and dry-runs the evidence bundle. It does **not** change production.

## Gate summary

| Gate                    | Owner                              | Canonical artifact                                                                   |
| ----------------------- | ---------------------------------- | ------------------------------------------------------------------------------------ |
| D1 import validation    | DBA / operator                     | `reports/phase-07-d1-import-validation_21-06-26.json`                                |
| Production Worker smoke | Operator / CI                      | `reports/phase-07-cloudflare-production-smoke_21-06-26.json`                         |
| Authenticated smoke     | Operator (prod creds)              | `reports/phase-07-authenticated-smoke_21-06-26.json`                                 |
| Better Stack monitors   | Operator (`BETTERSTACK_API_TOKEN`) | `reports/phase-07-betterstack-cutover_21-06-26.json`                                 |
| Operator approval       | Product / ops approver             | `reports/phase-07-operator-cutover-approval_21-06-26.json` + `CUTOVER_APPROVED=true` |

Readiness must report `phase7_cutover_ready: true` before DNS/routing changes.

## Maintenance window sequence

### T-7 days — prep (non-destructive)

1. Run `cutover:prep` and resolve any **stale production smoke** (reports older than 72h fail readiness).
2. Restore production Worker secrets if shadow/legacy checks fail:
   - `LEGACY_GKE_ORIGIN` — distinct GKE origin for rollback proxy
   - `MANUT_DIAGNOSTIC_TOKEN` — diagnostics auth for D1 shadow routes
3. Re-run production Worker smoke:
   ```bash
   export MANUT_DIAGNOSTIC_TOKEN=<token>
   pnpm --filter @manut/cloudflare smoke:worker -- https://manut-app.bettergogocash.workers.dev --json \
     --out process/features/cloudflare-stack-migration/reports/phase-07-cloudflare-production-smoke_21-06-26.json
   ```
4. Configure Better Stack monitors (3 required) and capture cutover report.
5. Complete operator approval input template (maintenance window, rollback, DNS, write freeze, smoke plan).

### T-0 — cutover window (destructive / operator-only)

**Stop if readiness is not green.**

1. **Announce** maintenance window (record in operator approval artifact).
2. **Freeze writes** on GKE app runtime.
3. **Final Postgres → D1 delta import** (operator action outside repo tools).
4. **Validate D1** — see `references/phase-07-d1-import-validation-runbook_24-06-26.md`.
5. **Validate R2** — GCS vs R2 manifest parity (`uploads:validate`).
6. **Deploy production Worker** via Cloudflare Builds / manual workflow if needed.
7. **Authenticated smoke** on `https://app.manut.xyz` — see `reports/phase-07-authenticated-smoke-runbook_24-06-26.md`.
8. **Operator approval** — canonicalize and set `CUTOVER_APPROVED=true`.
9. **DNS / routing switch** — point `app.manut.xyz` to Cloudflare only after step 8.
10. **Post-cutover smoke** — public + authenticated on production origin.

### T+0 verification

```bash
pnpm --silent --filter @manut/cloudflare cutover:readiness --phase phase-07 --json
pnpm --silent --filter @manut/cloudflare cutover:evidence --json --dry-run
```

## Environment variables

```bash
export D1_POSTGRES_COUNTS=<postgres-source-counts.json>
export D1_D1_COUNTS=<d1-target-counts.json>
export D1_RELATIONSHIPS=<d1-target-relationships.json>
export AUTHENTICATED_SMOKE_INPUT=process/features/cloudflare-stack-migration/reports/phase-07-authenticated-smoke-input_24-06-26.json
export OPERATOR_APPROVAL_INPUT=process/features/cloudflare-stack-migration/reports/phase-07-operator-cutover-approval-input_24-06-26.json
export BETTERSTACK_API_TOKEN=<token>
export CUTOVER_APPROVED=true   # only after approval report ok: true
```

## Rollback (during Phase 7 / before Phase 8)

1. Re-point `app.manut.xyz` to GKE origin.
2. Keep `manut-ce` / `manut-app` Helm release running.
3. Preserve Cloud SQL, GCS, Redis, RabbitMQ.
4. Capture failing Worker logs, D1 validation output, and Better Stack incidents.

## Related docs

- Plan: `active/phase-07-production-cutover_PLAN_21-06-26.md`
- D1 validation: `references/phase-07-d1-import-validation-runbook_24-06-26.md`
- Authenticated smoke: `reports/phase-07-authenticated-smoke-runbook_24-06-26.md`
- Operator gates: `process/general-plans/reports/pending-operator-gates_24-06-26.md`
