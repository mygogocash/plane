# Test Context

Use this file after `process/context/all-context.md` when selecting verification
for a change.

## Scope

This group covers test and verification commands for the monorepo, Cloudflare
migration package, i18n generation, and Django API tests.

It does not replace feature-specific acceptance criteria in `process/features/*/active/`.

## Quick Commands

| Area                               | Command                                                                                                     |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Full pnpm workspace quality gate   | `pnpm check`                                                                                                |
| Workspace lint only                | `pnpm check:lint`                                                                                           |
| Workspace format check             | `pnpm check:format`                                                                                         |
| Workspace typecheck                | `pnpm check:types`                                                                                          |
| Cloudflare Worker tests            | `pnpm --filter @manut/cloudflare test`                                                                      |
| Cloudflare Worker typecheck        | `pnpm --filter @manut/cloudflare check`                                                                     |
| Cloudflare cutover readiness       | `pnpm --silent --filter @manut/cloudflare cutover:readiness -- --json`                                      |
| i18n type generation and typecheck | `pnpm --filter @plane/i18n check:types`                                                                     |
| i18n format check                  | `pnpm --filter @plane/i18n check:format`                                                                    |
| Django API Docker suite            | `docker compose -f docker-compose-test.yml up --build --abort-on-container-exit --exit-code-from api-tests` |

## Runner Selection

- For changes under `apps/cloudflare/`, run Cloudflare package tests and typecheck first, then root `pnpm check`.
- For i18n generator changes, run `@plane/i18n` type and format checks, then root `pnpm check`.
- For frontend package/app changes, run the affected app/package checks through Turborepo and finish with `pnpm check` when practical.
- For Django API changes, use `apps/api/tests/RUNNING_TESTS.md`; `apps/api` is outside the pnpm workspace.
- For production cutover/deploy readiness, never accept local tests alone; collect real evidence reports under `process/features/cloudflare-stack-migration/reports/`.

## Known Baseline

`pnpm check` can pass while still printing tolerated warnings from upstream Plane code.
Treat new warnings in touched files as defects, but do not broaden a narrow production fix
into wholesale lint cleanup without a separate plan.

## Source Paths

- `apps/cloudflare/src/*.test.ts`
- `apps/cloudflare/tools/*.mjs`
- `apps/api/tests/RUNNING_TESTS.md`
- `.github/workflows/*.yml`
- root `package.json`
- `apps/cloudflare/package.json`

## Update Triggers

Update this file when scripts change, new test runners are added, CI gates change,
or Cloudflare migration evidence requirements change.
