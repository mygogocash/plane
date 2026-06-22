# Manut / Plane Repository Context

This file is the root context entrypoint for substantial planning, debugging,
review, and implementation work in this repository.

Start here, then load only the smallest relevant group file below.

## Current Root Entry Points

| File                                       | Read when                                                          |
| ------------------------------------------ | ------------------------------------------------------------------ |
| `process/context/all-context.md`           | Any substantial planning, research, review, or implementation task |
| `process/context/tests/all-tests.md`       | Testing, verification, debugging test failures, execution planning |
| `process/context/planning/all-planning.md` | Plan-shape calibration, phase-program work, active-plan routing    |

## Current Context Groups

| Group       | Entry point                                | Scope                                                                 |
| ----------- | ------------------------------------------ | --------------------------------------------------------------------- |
| `tests/`    | `process/context/tests/all-tests.md`       | Frontend/package checks, Cloudflare Worker tests, Django API tests    |
| `planning/` | `process/context/planning/all-planning.md` | RIPER-5 planning, Cloudflare migration phase plans, process artifacts |

## Task Routing Table

| If the task involves...                         | Start with                                                                                                                                    |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Cloudflare stack migration                      | `process/features/cloudflare-stack-migration/active/spec.md`, then the phase plan under `process/features/cloudflare-stack-migration/active/` |
| Cutover/decommission readiness                  | `apps/cloudflare/tools/cutover-readiness.mjs` and `process/features/cloudflare-stack-migration/reports/`                                      |
| Worker API, D1, R2, Queues, KV, Durable Objects | `apps/cloudflare/`                                                                                                                            |
| CI/CD or deploy labels                          | `.github/workflows/ci-cd.yml`, `.github/workflows/cloudflare-ci-cd.yml`, `.github/workflows/i18n-sync-check.yml`                              |
| frontend web/admin/space work                   | `apps/web/`, `apps/admin/`, `apps/space/`, plus shared packages under `packages/`                                                             |
| Django API work                                 | `apps/api/`; tests run through Docker as documented in `apps/api/tests/RUNNING_TESTS.md`                                                      |
| i18n key generation                             | `packages/i18n/scripts/generate-types.ts` and `packages/i18n/src/types/keys.generated.ts`                                                     |
| testing or verification                         | `process/context/tests/all-tests.md`                                                                                                          |
| plan or process maintenance                     | `process/context/planning/all-planning.md`                                                                                                    |

## Repository Structure

```txt
apps/
  admin/        React Router admin app
  api/          Django API; not part of the pnpm workspace
  cloudflare/   Worker-native Manut migration package and validation tools
  live/         Node live service
  space/        Public space frontend
  web/          Main product frontend
packages/       Shared TypeScript packages
process/
  context/      Durable repo context routers
  development-protocols/  Shared RIPER-5/process rules
  features/cloudflare-stack-migration/  Active migration plans, reports, references
.github/workflows/ CI/CD and validation workflows
```

## Technology Stack

- Package manager: `pnpm` with Turborepo.
- Frontend apps: TypeScript React apps under `apps/web`, `apps/admin`, and `apps/space`.
- Main API: Django/Python under `apps/api`.
- Cloudflare migration package: TypeScript Worker code using Hono, Drizzle, D1, R2, Queues, KV, Durable Objects, Vitest, Wrangler.
- CI: GitHub Actions workflows branded for Manut plus Cloudflare migration workflows.

## Current High-Risk Migration Gates

Production cutover remains blocked until real evidence exists for:

- D1 final import validation.
- R2 final manifest/checksum validation.
- Authenticated production smoke.
- Better Stack cutover monitors.
- Explicit operator cutover approval.
- Seven green days before Phase 8 decommission.

Use `pnpm --silent --filter @manut/cloudflare cutover:readiness -- --json` to inspect the current gate state.

## Update Triggers

Update this file when app layout, primary commands, feature folders, CI workflow ownership,
or active migration gate ownership changes.
