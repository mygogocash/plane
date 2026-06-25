# Phase 8 Soak Daily Log

**Soak started:** 2026-06-25T01:17:32.485Z (Phase 7 authenticated smoke gate closed)  
**Target decommission earliest:** 2026-07-02T01:17:32.485Z (7 full elapsed days)  
**Production origin:** https://app.manut.xyz

## Day 1 — 2026-06-25

| Check                    | Result           | Evidence                                            |
| ------------------------ | ---------------- | --------------------------------------------------- |
| Phase 7 readiness        | green            | `phase7_cutover_ready: true` @ 2026-06-25T01:19:23Z |
| Better Stack / endpoints | 3/3 probes green | `phase-08-day01-betterstack_25-06-26.json`          |
| Worker logs (manut-app)  | 0 × 5xx          | Cloudflare Observability 2026-06-25T00:00–02:00Z    |
| D1 backup                | exported         | `reports/backups/d1-manut-prod-day01-25-06-26.sql`  |
| R2 retention             | manifest green   | `phase-07-r2-manifest-validation_21-06-26.json`     |
| GKE rollback             | retained         | `plane-ce-gke` RUNNING, LB `34.143.231.225`         |

**Operator:** Kunanon Jarat  
**Next action:** Repeat daily procedure on 2026-06-26; update `phase-08-seven-green-days-input_25-06-26.json` `verified_through` and check `observed_at` values.

## Daily command block

```bash
CUTOVER_APPROVED=true pnpm --silent --filter @manut/cloudflare cutover:readiness --phase phase-07 --json
pnpm --filter @manut/cloudflare betterstack:cutover-report --json --require-endpoint-probes \
  --out process/features/cloudflare-stack-migration/reports/phase-08-dayNN-betterstack_<dd-mm-yy>.json
# Update phase-08-seven-green-days-input_25-06-26.json verified_through + checks
pnpm --filter @manut/cloudflare seven-green-days:report \
  --input process/features/cloudflare-stack-migration/reports/phase-08-seven-green-days-input_25-06-26.json \
  --out process/features/cloudflare-stack-migration/reports/phase-08-seven-green-days_21-06-26.json \
  --json
CUTOVER_APPROVED=true pnpm --silent --filter @manut/cloudflare cutover:readiness --phase phase-08 --json
```
