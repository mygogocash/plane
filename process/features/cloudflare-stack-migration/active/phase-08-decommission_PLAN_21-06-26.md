# Phase 8 - Decommission

**Status:** ACCELERATED PREP — soak waived; backups captured; GKE still required for production API

## Objective

Remove or archive the old GKE/GCP deploy path only after Cloudflare production
has proven stable and rollback is no longer needed for immediate recovery.

## Business Impact

- Reduces runtime complexity and cloud spend after migration is stable.
- Prevents accidental deletion of rollback resources during the highest-risk
  cutover window.

## Technical Scope

- Archive old GKE/GCP deployment docs as historical.
- Disable or remove stale GAR image publishing only after Cloudflare is stable.
- Schedule GKE, Cloud SQL, GCS, Redis, RabbitMQ, and related resource teardown
  with backup retention confirmed.
- Keep immutable exports and upload manifests according to retention policy.
- Update handover docs to make Cloudflare the primary production path.

## Dependencies

- Phase 7 production cutover verified.
- Better Stack and Cloudflare logs green for 7 days.
- Backups and exports retained outside the resources being removed.
- Operator approval for each destructive provider action.

## Hard Gates

Decommission cannot begin until:

- `SEVEN_GREEN_DAYS_REPORT` points to evidence covering the full post-cutover
  stability window.
- `pnpm --filter @manut/cloudflare seven-green-days:report -- --input <phase8-stability-evidence.json> --out process/features/cloudflare-stack-migration/reports/phase-08-seven-green-days_21-06-26.json`
  passes with required check IDs `betterstack-monitors`,
  `cloudflare-worker-logs`, `d1-backup-export`, `r2-backup-export`, and
  `rollback-retention`. The generated report must include `target_origin:
https://app.manut.xyz` and meaningful evidence values; blank strings or empty
  evidence objects are not valid decommission evidence. Each check must also
  include an explicit ISO `observed_at` timestamp from the post-cutover
  stability review.
- `pnpm --filter @manut/cloudflare cutover:readiness -- --phase phase-08` reports
  `Phase 8 decommission ready: yes`.
- A separate destructive-action checklist is approved for each provider
  resource class.

## Rollback Strategy

Before any decommission action:

1. Verify production Cloudflare restore-from-backup runbooks.
2. Verify D1 and R2 backups are available.
3. Preserve final Cloud SQL and GCS exports.
4. Disable deploy workflows before deleting runtime resources.

After a resource is deleted, rollback may require restore from backup rather
than traffic re-pointing, so each deletion needs explicit approval.

## Risks

- Premature GKE/GCP deletion removes the fastest rollback path.
- Stale docs may send operators to disabled workflows.
- Backup retention gaps may make historical data recovery impossible.

## Testing Matrix

| Area              | Required Evidence                                               |
| ----------------- | --------------------------------------------------------------- |
| Production health | 7 days of Better Stack green evidence                           |
| Cloudflare logs   | No sustained 5xx or Worker exception spikes                     |
| Data recovery     | D1 backup/export restore procedure documented                   |
| Upload recovery   | R2 bucket export or backup procedure documented                 |
| CI/CD             | GKE workflow disabled only after Cloudflare workflow is primary |
| Docs              | Current ops docs point to Cloudflare, old GKE docs archived     |

## Acceptance Criteria

- Phase 7 has been green for 7 days.
- Current docs identify Cloudflare as production.
- Old GKE/GCP docs are archived as historical.
- GAR publishing is disabled.
- No GCP production resource is deleted without explicit operator approval and
  retained backups.

## Current Blockers

- **Runtime:** `app.manut.xyz` API/auth still served by GKE Django — do not delete Cloud SQL/GKE until Worker-native backend is live on production hostname.
- **Teardown:** `phase8_decommission_ready` is green for process gates only; no destructive GCP actions taken.

## Soak tracking

- Prep report: `reports/phase-08-safe-cutoff-prep_25-06-26.md`
- Backup manifest: `reports/phase-08-gcp-backups-final_25-06-26.json`
- Seven-green-days (waived): `reports/phase-08-seven-green-days_21-06-26.json`
