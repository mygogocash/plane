# Phase 8 GCP Decommission Checklist

**Status:** EXECUTED — GCP runtime deleted 2026-06-25; Cloudflare is primary  
**Rule:** No further GCP production resources remain in `affine-495114` (see executed report).

## Preconditions

- [x] `pnpm --filter @manut/cloudflare cutover:readiness --phase phase-07 --json` → `phase7_cutover_ready: true`
- [x] `app.manut.xyz` routes to Cloudflare production stack
- [x] Authenticated smoke report `ok: true` on production origin
- [x] Seven green days report `ok: true` — operator soak waiver + accelerated prep (`phase-08-safe-cutoff-prep_25-06-26.md`)
- [x] `pnpm --filter @manut/cloudflare cutover:readiness --phase phase-08 --json` → `phase8_decommission_ready: true` (process gates; no teardown yet)

## Daily soak (days 1–7 post-cutover)

Run once per day; do not backdate evidence.

- [x] Day 1 (2026-06-25) — see `phase-08-soak-daily-log_25-06-26.md`
- [ ] Phase 7 readiness still green
- [ ] Better Stack monitors green (`manut.xyz`, `app.manut.xyz`, `/api/instances/`)
- [ ] Cloudflare Worker logs — no sustained 5xx spike
- [ ] D1 backup/export captured
- [ ] R2 backup/export captured
- [ ] GKE/GCP rollback resources still retained

Canonicalize after day 7:

```bash
pnpm --filter @manut/cloudflare seven-green-days:report \
  --input process/features/cloudflare-stack-migration/reports/phase-08-seven-green-days-input-template_24-06-26.json \
  --out process/features/cloudflare-stack-migration/reports/phase-08-seven-green-days_21-06-26.json \
  --json
```

## Pre-teardown verification (each resource class)

### Data exports (before any datastore deletion)

| Resource             | Action                                          | Evidence                                              |
| -------------------- | ----------------------------------------------- | ----------------------------------------------------- |
| Cloud SQL / Postgres | Final logical export + verify restore procedure | Path or ticket in seven-green-days `d1-backup-export` |
| GCS uploads bucket   | Final manifest + object export                  | Path in `r2-backup-export` / R2 parity report         |
| D1 (Cloudflare)      | Remote backup export                            | Wrangler / dashboard export path                      |
| R2 (Cloudflare)      | Bucket export or lifecycle snapshot             | Documented restore runbook                            |

### CI/CD retirement (before runtime teardown)

| Step | Action                                                                             | Verify                                          |
| ---- | ---------------------------------------------------------------------------------- | ----------------------------------------------- |
| 1    | Cloudflare Builds is primary production deploy path                                | `phase-06-cloudflare-cicd-evidence_21-06-26.md` |
| 2    | `pnpm --filter @manut/cloudflare github-actions:retirement-readiness --json` green | No forbidden retirement actions                 |
| 3    | Disable GKE deploy path in `.github/workflows/ci-cd.yml`                           | Manual dispatch only or removed deploy job      |
| 4    | Remove GCP-only GitHub secrets (deployer, WIF)                                     | Secret inventory updated                        |

### Runtime teardown order (operator approval per step)

Execute only after Phase 8 readiness is green. **Order matters** — fastest rollback path goes last.

| Order | Resource class                                    | Approval required | Rollback if deleted    |
| ----- | ------------------------------------------------- | ----------------- | ---------------------- | ------------------------------------------------------------------------------ |
| 1     | Stale GAR image publishing / unused tags          | Yes               | Rebuild from source    |
| 2     | GKE deploy workflows / unused CI secrets          | Yes               | Re-enable workflow     | **Auto deploy disabled** — manual `workflow_dispatch` + `deploy_gcp=true` only |
| 3     | GKE ingress / LB fronting old app path (if split) | Yes               | DNS to GKE             |
| 4     | GKE `manut-ce` / `manut-app` workloads            | Yes               | Helm reinstall + image |
| 5     | Redis / RabbitMQ (if GCP-hosted)                  | Yes               | Restore from export    |
| 6     | GCS uploads bucket                                | Yes               | Restore from export    |
| 7     | Cloud SQL instance                                | Yes               | Restore from backup    |
| 8     | Static IP / forwarding rules                      | Yes               | Re-provision           |
| 9     | Service accounts / WIF bindings                   | Yes               | Re-create IAM          |

## Documentation updates (same PR window as CI retirement)

- [ ] Archive GKE/GCP deploy docs under `docs/archive/gcp/` or equivalent
- [ ] Update `docs/gcp-manut-ops-handover.md` → Cloudflare primary
- [ ] Update `process/context/` routing if ops procedures moved
- [ ] Mark `phase-08-decommission_PLAN_21-06-26.md` complete in feature reports

## Explicit non-goals (do not do early)

- Do not delete Cloud SQL while D1 final import validation is missing or stale
- Do not remove `LEGACY_GKE_ORIGIN` from Worker until Phase 8 soak completes (if still used for shadow)
- Do not set `CUTOVER_APPROVED=false` retroactively to bypass gates
- Do not fabricate seven-green-days evidence — calendar time is required

## Verification commands

```bash
pnpm --filter @manut/cloudflare cutover:prep --phase phase-08 --json
pnpm --silent --filter @manut/cloudflare cutover:readiness --phase phase-08 --json
pnpm --filter @manut/cloudflare github-actions:retirement-readiness --json
```

## Related docs

- Plan: `active/phase-08-decommission_PLAN_21-06-26.md`
- Seven green days: `reports/phase-08-seven-green-days-runbook_24-06-26.md`
- GHA retirement: `active/github-actions-retirement-cloudflare-cicd_PLAN_24-06-26.md`
- GCP cutoff status: `reports/gcp-cutoff-readiness_24-06-26.md`
