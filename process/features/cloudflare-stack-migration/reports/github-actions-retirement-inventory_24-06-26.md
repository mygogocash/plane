# GitHub Actions Retirement Inventory

Generated: 2026-06-24T12:08:28Z
Feature: Cloudflare stack migration
Plan: `process/features/cloudflare-stack-migration/active/github-actions-retirement-cloudflare-cicd_PLAN_24-06-26.md`
Scope: M1 CI/CD ownership audit

## Summary

This inventory starts the GitHub Actions retirement work without disabling any workflow or changing production settings.

Current cutoff readiness remains blocked:

```json
{
  "status": "blocked",
  "summary": {
    "total": 19,
    "passed": 14,
    "blocked": 5
  },
  "blocked_checks": [
    "d1-import-validation",
    "authenticated-smoke",
    "betterstack-cutover-green",
    "phase8-seven-green-days",
    "operator-cutover-approval"
  ]
}
```

Do not retire rollback-capable GCP/GKE paths until the missing Phase 7 and Phase 8 evidence is captured and operator approval is recorded.

## Branch Protection And Rulesets

Read-only checks run on 2026-06-24:

```bash
gh api repos/mygogocash/plane/branches/preview/protection/required_status_checks
gh api repos/mygogocash/plane/branches/main/protection/required_status_checks
gh api repos/mygogocash/plane/rulesets
gh api repos/mygogocash/plane/environments
```

Observed state:

| Surface                                            | Result                                                                                                                                                |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `preview` branch protection required status checks | `404 Branch not protected`                                                                                                                            |
| `main` branch protection required status checks    | `404 Branch not protected`                                                                                                                            |
| Repository rulesets                                | Empty list                                                                                                                                            |
| Environments                                       | `cloudflare-production`, `grateful-celebration / production`, `preview`, `production`, `profound-optimism / production`; no protection rules returned |

Action required before removing any GitHub checks:

- Decide the target required-check set for `preview` and `main`.
- Add branch protection or rulesets that require the Cloudflare Builds check before disabling GitHub deploy workflows.
- Keep CodeQL or an equivalent security gate in the target protection set if the repository remains public or production-facing.

## Visible Actions Secrets

Read-only check:

```bash
gh api repos/mygogocash/plane/actions/secrets --jq '[.secrets[].name]'
```

Visible repository-level result:

```json
["TURBO_TOKEN"]
```

Important limitation: workflows reference additional secret names that are not visible through the repo-level secrets endpoint in this session. Treat those as missing, org-scoped, environment-scoped, or already removed until verified by an operator with sufficient GitHub permissions.

## Workflow Inventory

| Workflow                                                 | Triggers                                    | Primary jobs                                                                                | Secret references                                                                                                                                   | Deploy ownership                                                                   | Retirement decision                                                                                                 |
| -------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/betterstack-monitoring.yml`           | `push`, `workflow_dispatch`                 | Better Stack monitor sync and report artifact                                               | `BETTERSTACK_API_TOKEN`                                                                                                                             | No app deploy; external monitor mutation/evidence                                  | Keep until Better Stack monitor sync and cutover evidence has Cloudflare-native or operator-run replacement         |
| `.github/workflows/build-branch.yml`                     | `workflow_dispatch`                         | Manual upstream DockerHub CE image build/release                                            | `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`, `GITHUB_TOKEN`                                                                                             | DockerHub image publishing only                                                    | Retire after GCP/GKE rollback no longer depends on Docker image rebuilds                                            |
| `.github/workflows/check-version.yml`                    | `pull_request`                              | Version-change release guard                                                                | None                                                                                                                                                | None                                                                               | Keep unless release process is redesigned                                                                           |
| `.github/workflows/ci-cd.yml`                            | `workflow_dispatch`, `pull_request`, `push` | Metadata, change detection, web CI, API CI, image build, GKE rollout, Better Stack evidence | `TURBO_TOKEN`, `BETTERSTACK_API_TOKEN`                                                                                                              | GCP/GKE production deploy, Kubernetes rollout, image deploy, Better Stack evidence | Disable deploy path only after Cloudflare Builds shadow mode passes; delete after rollback no longer depends on GCP |
| `.github/workflows/cloudflare-ci-cd.yml`                 | `workflow_dispatch`, `pull_request`, `push` | Cloudflare foundation validation, D1/R2 validation fixtures, Worker deploy/smoke evidence   | `CLOUDFLARE_API_TOKEN`, `MANUT_DIAGNOSTIC_TOKEN`                                                                                                    | GitHub-driven Cloudflare Worker deploy and smoke                                   | Keep as validation/fallback during shadow mode; retire deploy path after Cloudflare Builds owns Worker deploy       |
| `.github/workflows/copyright-check.yml`                  | `workflow_dispatch`, `pull_request`         | Copyright/license checks                                                                    | None                                                                                                                                                | None                                                                               | Keep or fold into canonical `ci:cloudflare` only if output remains clear                                            |
| `.github/workflows/feature-deployment.yml`               | `workflow_dispatch`, `push`                 | Feature preview image build and Kubernetes deployment                                       | `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`, `DOCKERHUB_TOKEN_RO`, `FEATURE_PREVIEW_KUBE_CONFIG`, `TAILSCALE_OAUTH_CLIENT_ID`, `TAILSCALE_OAUTH_SECRET` | GKE feature preview deployment                                                     | Retire after Cloudflare preview/version flow is accepted and GKE preview rollback is no longer needed               |
| `.github/workflows/i18n-sync-check.yml`                  | `workflow_dispatch`, `pull_request`, `push` | i18n sync check                                                                             | None                                                                                                                                                | None                                                                               | Keep or fold into canonical `ci:cloudflare` only if it stays reliable                                               |
| `.github/workflows/pull-request-build-lint-api.yml`      | `workflow_dispatch`, `pull_request`         | API lint/check surface                                                                      | None                                                                                                                                                | None                                                                               | Keep until API check replacement is active                                                                          |
| `.github/workflows/pull-request-build-lint-web-apps.yml` | `workflow_dispatch`, `pull_request`         | Web format, build, lint, type checks                                                        | None                                                                                                                                                | None                                                                               | Keep until web check replacement is active                                                                          |

## Secret Classification

| Secret name                   | Referenced by                                                                    | Current classification                                                                     | Retirement guidance                                                                                  |
| ----------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `TURBO_TOKEN`                 | `.github/workflows/ci-cd.yml`                                                    | Visible repo-level secret; quality/build acceleration                                      | Keep if GitHub web/API checks remain; remove only after those checks move or no longer use Turbo     |
| `BETTERSTACK_API_TOKEN`       | `.github/workflows/betterstack-monitoring.yml`, `.github/workflows/ci-cd.yml`    | External monitor mutation/evidence token; not visible as repo-level secret in this session | Keep until Better Stack sync/reporting has replacement                                               |
| `CLOUDFLARE_API_TOKEN`        | `.github/workflows/cloudflare-ci-cd.yml`                                         | Cloudflare deploy token; not visible as repo-level secret in this session                  | Move deploy authority to Cloudflare Builds; remove from GitHub after fallback deploy path is retired |
| `MANUT_DIAGNOSTIC_TOKEN`      | `.github/workflows/cloudflare-ci-cd.yml`                                         | Worker smoke/diagnostic token; not visible as repo-level secret in this session            | Move to Cloudflare secret storage or operator smoke input before removing from GitHub                |
| `DOCKERHUB_USERNAME`          | `.github/workflows/build-branch.yml`, `.github/workflows/feature-deployment.yml` | DockerHub publish/pull credential; not visible as repo-level secret in this session        | Remove only after DockerHub image build/preview rollback workflows are retired                       |
| `DOCKERHUB_TOKEN`             | `.github/workflows/build-branch.yml`, `.github/workflows/feature-deployment.yml` | DockerHub publish credential; not visible as repo-level secret in this session             | Remove only after DockerHub image build/preview rollback workflows are retired                       |
| `DOCKERHUB_TOKEN_RO`          | `.github/workflows/feature-deployment.yml`                                       | DockerHub read-only credential; not visible as repo-level secret in this session           | Remove only after feature preview workflow is retired                                                |
| `FEATURE_PREVIEW_KUBE_CONFIG` | `.github/workflows/feature-deployment.yml`                                       | Kubernetes preview deploy credential; not visible as repo-level secret in this session     | Remove after GKE feature previews are retired                                                        |
| `TAILSCALE_OAUTH_CLIENT_ID`   | `.github/workflows/feature-deployment.yml`                                       | Tailscale preview networking credential; not visible as repo-level secret in this session  | Remove after GKE feature previews are retired                                                        |
| `TAILSCALE_OAUTH_SECRET`      | `.github/workflows/feature-deployment.yml`                                       | Tailscale preview networking credential; not visible as repo-level secret in this session  | Remove after GKE feature previews are retired                                                        |
| `GITHUB_TOKEN`                | GitHub-provided token in `.github/workflows/build-branch.yml`                    | Runtime-provided by GitHub Actions                                                         | Goes away naturally when the workflow is removed                                                     |

## Retirement Order

1. Add Cloudflare Builds shadow mode for `manut-app`.
2. Add a repo-owned `pnpm --filter @manut/cloudflare ci:cloudflare` command.
3. Require the Cloudflare Builds check on the target branch through branch protection or rulesets.
4. Disable GitHub deploy execution in `.github/workflows/cloudflare-ci-cd.yml`, keeping validation if useful.
5. Disable GCP/GKE deploy execution in `.github/workflows/ci-cd.yml`, keeping rollback/manual fallback until Phase 8 is complete.
6. Replace or retain Better Stack, API, web, copyright, i18n, version, and CodeQL gates.
7. Delete retired workflows and secrets only after Phase 7 and Phase 8 are green.

## Blockers Before Disabling GitHub Deploys

- Cloudflare Builds has not been captured in shadow mode as the required deployment owner.
- Branch protection/rulesets are not configured for `preview` or `main`.
- The Better Stack gate is still blocked.
- Authenticated smoke evidence is still missing.
- Final D1 import validation is still missing.
- Explicit operator cutover approval is still missing.
- Phase 8 seven-green-days evidence cannot be complete until after real cutover.

## Recommended Next PR

Create the first implementation PR with only low-risk repository changes:

- Add `ci:cloudflare` to `apps/cloudflare/package.json`.
- Add tests for any readiness wrapper behavior.
- Add Cloudflare Builds shadow-mode runbook notes.
- Do not disable or delete any workflow.
- Do not remove any GitHub secret.
- Do not mutate Cloudflare, DNS, Better Stack, D1, R2, or GCP.
