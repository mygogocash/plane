# Phase 8 Safe Cutoff Prep — Option A

**Completed:** 2026-06-25  
**Operator:** Kunanon Jarat  
**Production:** GKE remains online (Django API still serves `app.manut.xyz`)

## Actions taken

| Action                     | Status       | Evidence                                                                 |
| -------------------------- | ------------ | ------------------------------------------------------------------------ |
| Soak waiver (process gate) | done         | `phase-08-seven-green-days_21-06-26.json` `soak_waived: true`            |
| D1 export                  | done         | `reports/backups/d1-manut-prod-final-25-06-26.sql`                       |
| GCS uploads mirror         | done         | `reports/backups/gcs-plane-affine-495114-uploads-25-06-26/` (19 objects) |
| Cloud SQL backup           | done         | backup id `1782350623415` on `plane-pg`                                  |
| Auto GKE deploy disabled   | done         | `.github/workflows/ci-cd.yml` — `deploy-gcp` manual-only                 |
| GKE runtime teardown       | **not done** | Production still requires GKE                                            |

## Manifest

`phase-08-gcp-backups-final_25-06-26.json`

## Next step before real GCP deletion

Migrate production API off GKE per `active/worker-native-api-migration_PLAN_25-06-26.md` (Slice 1: identity import next).
