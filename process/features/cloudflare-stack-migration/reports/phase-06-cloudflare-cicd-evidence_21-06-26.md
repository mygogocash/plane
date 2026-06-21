# Phase 6 Cloudflare CI/CD Evidence

Captured: 2026-06-21T09:08:00Z

## Scope Completed

- Promoted `.github/workflows/cloudflare-ci-cd.yml` beyond validation-only by
  adding manual deployment inputs.
- Kept push and pull request behavior validation-only.
- Added Worker dry-run bundling to validation.
- Added synthetic D1 row-count validation to validation.
- Added synthetic R2 manifest validation to validation.
- Added manual-gated deploy job for:
  - preview Worker deploy;
  - production Worker deploy;
  - optional preview/production D1 migration apply;
  - optional preview URL smoke checks.
- Added required Cloudflare credential checks:
  - `CLOUDFLARE_API_TOKEN`
  - `CLOUDFLARE_ACCOUNT_ID`
  - `CLOUDFLARE_ZONE_ID`

## Manual Gates

| Input                        | Purpose                                                 |
| ---------------------------- | ------------------------------------------------------- |
| `deploy_target`              | `none`, `preview`, or `production`                      |
| `apply_d1_migrations`        | Applies D1 migrations for selected target before deploy |
| `run_live_baseline`          | Runs live baseline against current public hosts         |
| `run_r2_manifest_validation` | Runs synthetic upload manifest validation               |
| `cloudflare_preview_url`     | Optional Worker URL smoke target                        |

Production deploy uses the `cloudflare-production` GitHub environment. Preview
deploy uses the `cloudflare-preview` environment. The workflow does not change
Cloudflare DNS records or GKE ingress.

## Verification Commands

```bash
ruby -e 'require "yaml"; YAML.load_file(".github/workflows/cloudflare-ci-cd.yml"); puts "yaml-ok"'
rg -n "deploy_target|apply_d1_migrations|Dry-run|Deploy Cloudflare|environment:" .github/workflows/cloudflare-ci-cd.yml
pnpm --filter @manut/cloudflare check
pnpm --filter @manut/cloudflare test
pnpm --filter @manut/cloudflare exec wrangler deploy --dry-run --env="" --outdir /tmp/manut-cloudflare-phase6-dry-run
pnpm --filter @manut/cloudflare baseline
```

Result:

- Workflow YAML parsed successfully.
- Manual inputs and deploy job are present.
- TypeScript check passed.
- Worker tests passed, 6 files and 46 tests.
- Wrangler dry-run passed, upload size `265.19 KiB`, gzip `55.04 KiB`.
- Baseline confirmed `app.manut.xyz` still resolves to GKE IP `34.143.231.225`;
  `/api/instances/` is HTTP `200`; `/uploads` remains the current GCS-backed
  HTTP `403` response.
- Local `actionlint` was unavailable in this environment, so syntax validation
  beyond YAML parsing is deferred to GitHub Actions.

## Cutover Status

Blocked. The workflow can deploy Workers only when manually dispatched with
Cloudflare credentials. It does not update `app.manut.xyz` DNS and does not
replace GKE as production origin.

## Current GitHub Cloudflare Configuration

Captured after preview provisioning:

- `CLOUDFLARE_ACCOUNT_ID`: configured.
- `CLOUDFLARE_APP_URL`: configured.
- `CLOUDFLARE_SITE_URL`: configured.
- `CLOUDFLARE_ZONE_ID`: missing.
- `CLOUDFLARE_API_TOKEN`: missing.

Manual GitHub deploy remains blocked until the zone ID variable and raw API
token secret are configured. Local Wrangler OAuth was used for the first
preview deploy.

## Rollback

Set `deploy_target=none` or leave the workflow on push/PR validation only.
Disable the deploy job by reverting this phase commit if manual Cloudflare
deploy behavior needs to be removed. GKE `Manut CI/CD` remains the active app
runtime path.
