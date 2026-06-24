# Phase 8 Seven Green Days Runbook

Canonical report:
`process/features/cloudflare-stack-migration/reports/phase-08-seven-green-days_21-06-26.json`

Input template:
`process/features/cloudflare-stack-migration/reports/phase-08-seven-green-days-input-template_24-06-26.json`

## Gate Rule

Keep `phase8-seven-green-days` blocked until both conditions are true:

1. Phase 7 cutover readiness is green.
2. Seven full elapsed days after cutover have stayed green for the production origin `https://app.manut.xyz`.

Do not set `phase7_readiness.ok` or any daily check `ok` to `true` from intent, a planned action, or partial public smoke. Use only captured production evidence.

## Daily Evidence Procedure

Run this once per post-cutover day until seven elapsed green days exist:

1. Confirm Phase 7 readiness remains green:
   `pnpm --silent --filter @manut/cloudflare cutover:readiness -- --phase phase-07 --json`
2. Capture Better Stack monitor evidence for the production origin.
3. Capture Cloudflare Worker logs and confirm there is no unresolved production 5xx/error trend.
4. Capture D1 backup/export evidence needed before GCP data-store decommission.
5. Capture R2 backup/export evidence needed before GCS decommission.
6. Confirm GKE/GCP rollback resources and final exports remain retained until explicit decommission approval.
7. Update the input template with `observed_at`, `evidence`, `url`, and `note` for each check.

Generate the canonical report only from the completed input:

```sh
pnpm --filter @manut/cloudflare run seven-green-days:report -- \
  --input process/features/cloudflare-stack-migration/reports/phase-08-seven-green-days-input-template_24-06-26.json \
  --out process/features/cloudflare-stack-migration/reports/phase-08-seven-green-days_21-06-26.json \
  --json
```

Verify the blocker state:

```sh
pnpm --silent --filter @manut/cloudflare cutover:readiness -- --json
```

## Remaining Operator Inputs

- `phase7_readiness.verified_at`: timestamp from a green Phase 7 readiness run.
- `phase7_readiness.evidence`: command output location or report link proving Phase 7 is ready with zero selected blockers.
- `checks[].observed_at`: production observation timestamp for every required Phase 8 check.
- `checks[].evidence`: concrete evidence text or link for every required Phase 8 check.
- `checks[].url`: monitor, log, backup/export, or decommission evidence URL when available.
- `checks[].note`: any operator note needed to explain the evidence.
