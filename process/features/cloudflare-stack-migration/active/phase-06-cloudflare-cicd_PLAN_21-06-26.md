# Phase 6 - Cloudflare CI/CD

**Status:** CODE DONE for manual-gated workflow; provider-backed deploy unrun

## Objective

Promote the validation-only Cloudflare workflow into controlled preview and
production Cloudflare deployment lanes after resources and smoke tests exist.

## Scope

- Keep the existing GKE `Manut CI/CD` workflow as rollback until cutover.
- Add explicit Cloudflare deploy gates for Worker, D1 migrations, R2 checks, and
  Better Stack monitor sync.
- Avoid automatic production deploy from generic `preview` pushes until the GKE
  workflow side effect is removed or intentionally accepted.

## Implementation Tasks

- Add workflow inputs for preview deploy, production deploy, and migration apply.
- Require `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`,
  and `BETTERSTACK_API_TOKEN` for deploy/smoke tasks. Document
  `CLOUDFLARE_ZONE_ID` as required for future DNS/cutover automation only.
- Add summaries for Worker URL, D1 migration status, R2 validation, and smoke
  endpoints.
- Add actionlint validation when available in CI.

## Tests

- `pnpm --filter @manut/cloudflare check`
- `pnpm --filter @manut/cloudflare test`
- `wrangler deploy --dry-run --env=""`
- `actionlint .github/workflows/cloudflare-ci-cd.yml`

## Rollback

Disable the Cloudflare deploy jobs and keep GKE deploy active. No data movement
is performed by CI until migration jobs are explicitly enabled.

## Done When

- Preview Cloudflare deploy can run without touching production DNS.
- Production deploy is manual-gated.
- Better Stack checks report both current GKE and Cloudflare preview health.

## Phase 6 Evidence

- Report: `process/features/cloudflare-stack-migration/reports/phase-06-cloudflare-cicd-evidence_21-06-26.md`
- Workflow: `.github/workflows/cloudflare-ci-cd.yml`
- Manual inputs:
  - `deploy_target`: `none`, `preview`, or `production`
  - `apply_d1_migrations`
  - `run_live_baseline`
  - `run_r2_manifest_validation`
  - `cloudflare_preview_url`
- Production cutover status: blocked; workflow deploy does not change DNS.
