# GitHub Actions Retirement And Cloudflare CI/CD Plan

Date: 2026-06-24
Status: Active plan
Feature: Cloudflare stack migration
Risk: R1 for CI/CD ownership changes; R0 stop if any production deploy, DNS, database import, or GCP decommission action is attempted without explicit operator approval.

## Objective

Move deployment ownership from GitHub Actions to Cloudflare-native CI/CD for the Cloudflare Worker runtime while preserving merge safety, rollback readiness, and truthful cutover evidence.

The end state is:

- Cloudflare Workers Builds owns Worker build and deploy execution for the production branch.
- GitHub Actions no longer owns production deployment to GCP/GKE or Cloudflare.
- GitHub Actions quality and security checks are either retained or replaced with equivalent Cloudflare-visible gates before removal.
- GCP deploy permissions and secrets are removed only after Phase 7 cutover and Phase 8 stability gates are genuinely green.

## Current Evidence

- Current readiness command:

```bash
pnpm --silent --filter @manut/cloudflare cutover:readiness -- --json
```

- Current result on 2026-06-24: blocked, 14/19.
- Current blocked gates:
  - `d1-import-validation`
  - `authenticated-smoke`
  - `betterstack-cutover-green`
  - `operator-cutover-approval`
  - `phase8-seven-green-days`
- Existing Cloudflare CI/CD evidence: `process/features/cloudflare-stack-migration/reports/phase-06-cloudflare-cicd-evidence_21-06-26.md`
- Existing cutoff readiness report: `process/features/cloudflare-stack-migration/reports/gcp-cutoff-readiness_24-06-26.md`
- Current branch with cutoff tooling work: `codex/cloudflare-cutoff-gates`
- Related PR at plan creation time: `https://github.com/mygogocash/plane/pull/31`

## Non-Goals

- Do not shut down GCP, GKE, Cloud SQL/Postgres, GCS, static IPs, load balancers, DNS rollback paths, service accounts, or deployer credentials in this plan.
- Do not perform final D1 import.
- Do not mutate DNS or Cloudflare routing.
- Do not mark Phase 7 or Phase 8 green from public probes or assumptions.
- Do not remove CodeQL or security checks unless an equivalent reviewed replacement is active.

## Primary Sources

- Cloudflare Workers Builds: `https://developers.cloudflare.com/workers/ci-cd/builds/`
- Cloudflare Workers Builds configuration: `https://developers.cloudflare.com/workers/ci-cd/builds/configuration/`
- Cloudflare Workers GitHub integration: `https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/`
- Cloudflare Workers versions and deployments: `https://developers.cloudflare.com/workers/configuration/versions-and-deployments/`
- Cloudflare Workers rollbacks: `https://developers.cloudflare.com/workers/configuration/versions-and-deployments/rollbacks/`

## Workflow Inventory

| Workflow                                                 | Current purpose                                                                         | Retirement decision                                                                                                 |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/ci-cd.yml`                            | Manut CI/CD with GCP/GKE deploy, image build, Kubernetes rollout, Better Stack evidence | Disable deploy path after Cloudflare Builds shadow mode passes; delete only after rollback no longer depends on GCP |
| `.github/workflows/cloudflare-ci-cd.yml`                 | GitHub-driven Cloudflare validation and optional deploy                                 | Keep as fallback during shadow mode; retire deploy path after Cloudflare Builds owns Worker deploy                  |
| `.github/workflows/betterstack-monitoring.yml`           | Better Stack monitor sync and cutover evidence                                          | Keep until monitor sync/evidence has Cloudflare-native or operator-run replacement                                  |
| `.github/workflows/feature-deployment.yml`               | GKE feature preview deployment                                                          | Retire after Cloudflare preview/version flow is accepted                                                            |
| `.github/workflows/build-branch.yml`                     | Manual upstream DockerHub build                                                         | Retire after GCP/GKE rollback no longer needs Docker image rebuilds                                                 |
| `.github/workflows/pull-request-build-lint-web-apps.yml` | PR web lint/build/type checks                                                           | Keep or fold into replacement gate; do not remove until required branch checks are updated                          |
| `.github/workflows/pull-request-build-lint-api.yml`      | PR API checks                                                                           | Keep until equivalent API check path exists                                                                         |
| `.github/workflows/check-version.yml`                    | Version-change release guard                                                            | Keep unless release process is redesigned                                                                           |
| `.github/workflows/copyright-check.yml`                  | Copyright guard                                                                         | Keep or fold into canonical CI command                                                                              |
| `.github/workflows/i18n-sync-check.yml`                  | i18n synchronization guard                                                              | Keep or fold into canonical CI command                                                                              |

## Target Cloudflare CI/CD Shape

### Cloudflare Worker

- Worker: `manut-app`
- Production branch: `preview` until the branch strategy moves to `main`.
- Runtime package: `apps/cloudflare`
- Wrangler config: `apps/cloudflare/wrangler.toml`
- Production deploy command:

```bash
pnpm --filter @manut/cloudflare deploy:production
```

- Non-production validation command, preferred:

```bash
pnpm --filter @manut/cloudflare exec wrangler versions upload --env production
```

If Cloudflare Builds requires the Worker root directory to be `apps/cloudflare`, use workspace-aware commands from that directory, for example:

```bash
pnpm --dir ../.. --filter @manut/cloudflare test
pnpm --dir ../.. --filter @manut/cloudflare deploy:production
```

Validate this in shadow mode before retiring any GitHub workflow.

### Canonical CI Command

Add a single repo-owned command before moving branch protection:

```bash
pnpm --filter @manut/cloudflare ci:cloudflare
```

Expected command contents:

```bash
pnpm exec oxfmt --check apps/cloudflare .github/workflows/cloudflare-ci-cd.yml process/features/cloudflare-stack-migration
pnpm exec oxlint apps/cloudflare
pnpm --filter @manut/cloudflare check
pnpm --filter @manut/cloudflare test
pnpm --silent --filter @manut/cloudflare cutover:readiness -- --json
```

The readiness command is allowed to return blocked while Phase 7 and Phase 8 evidence is missing. The CI script must fail only when the command crashes, produces malformed JSON, or reports an impossible false-green state.

## Milestones

### M1 - CI/CD Ownership Audit

Tasks:

- Generate a workflow inventory report under `process/features/cloudflare-stack-migration/reports/`.
- Record all required branch protection checks for `preview` and `main`.
- Identify all GitHub secrets used only by GCP/GKE deploy paths.
- Identify all GitHub secrets still needed for quality/security checks.
- Record current rollback dependencies on GCP images, GKE manifests, Cloud SQL/Postgres, GCS, and DNS/LB paths.

Acceptance:

- Report names every workflow, trigger, job class, secret class, and retirement decision.
- No workflow is disabled in this milestone.

### M2 - Cloudflare Builds Shadow Configuration

Operator tasks:

- Connect the existing Cloudflare Worker to the GitHub repository in Cloudflare Workers Builds.
- Configure production branch as `preview` unless branch strategy has moved to `main`.
- Configure build/deploy commands from this plan.
- Configure non-production branch builds to upload a Worker version without promoting traffic.
- Set Cloudflare-side variables and secrets needed for Worker deploy.

Repository tasks:

- Add `ci:cloudflare` script to `apps/cloudflare/package.json`.
- Add a small JSON validator for Cloudflare readiness output if the existing readiness command does not already provide a strict enough contract.
- Add or update tests proving the CI wrapper fails closed on malformed readiness output.

Acceptance:

- Cloudflare Builds produces GitHub-visible check runs.
- A non-production branch produces an uploaded Worker version without live traffic promotion.
- `preview` branch produces the intended Cloudflare deployment only when operator-approved branch settings are active.

### M3 - Shadow Mode Parity

Tasks:

- Run Cloudflare Builds and GitHub Actions side by side for at least three PRs or controlled pushes.
- Compare failure behavior for lint, type, tests, malformed readiness JSON, and missing evidence.
- Confirm Cloudflare logs contain enough evidence for audit and rollback.
- Capture a shadow-mode report under `process/features/cloudflare-stack-migration/reports/`.

Acceptance:

- Cloudflare Builds detects the same Cloudflare package failures currently caught by GitHub Actions.
- GitHub branch checks show the Cloudflare status clearly.
- No production deploy is performed from a pull request.

### M4 - Retire GitHub Deploy Ownership

Tasks:

- Disable deploy execution in `.github/workflows/ci-cd.yml` for Cloudflare-only paths.
- Disable deploy execution in `.github/workflows/cloudflare-ci-cd.yml`, keeping validation-only fallback if useful.
- Update branch protection to require Cloudflare Builds checks instead of GitHub deploy jobs.
- Keep manual GitHub rollback or validation workflows until Phase 8 is complete.
- Record the retirement report under `process/features/cloudflare-stack-migration/reports/`.

Acceptance:

- GitHub Actions cannot deploy production through GCP/GKE or Cloudflare on normal push.
- Cloudflare Builds is the only automatic production Worker deployment path.
- Manual rollback path is documented and tested.

### M5 - Replace Or Retain Non-Deploy Actions

Tasks:

- Keep CodeQL unless another reviewed security scanner is active.
- Keep API checks until Cloudflare or another runner covers the API test surface.
- Keep web checks until the front-end build/lint/type surface is represented in required checks.
- Keep Better Stack workflow until monitor sync and cutover evidence has a replacement.
- Fold copyright/i18n/version checks into the canonical CI command only if runtime and output remain reliable.

Acceptance:

- Every removed GitHub check has a named replacement or a documented decision that it is no longer required.
- Branch protection reflects the new gate set.

### M6 - Post-Cutover GitHub Actions Deletion

Prerequisites:

- Phase 7 readiness green.
- Phase 8 seven green days complete.
- Operator approval recorded.
- Rollback no longer depends on GCP/GKE deploy workflows.

Tasks:

- Delete retired workflow files.
- Remove unused GitHub secrets.
- Remove unused GCP Workload Identity/deployer access.
- Archive or replace `docs/cicd-spec-2026-06-06.md`.
- Update `docs/cloudflare-stack-migration.md` with the final Cloudflare CI/CD runbook.

Acceptance:

- No GitHub Action can deploy to GCP/GKE or Cloudflare.
- Cloudflare build/deploy runbook is the canonical production path.
- GCP deploy credentials are absent or explicitly retained only for documented rollback.

## Verification Commands

Run before opening implementation PRs:

```bash
pnpm exec oxfmt --check apps/cloudflare .github/workflows process/features/cloudflare-stack-migration
pnpm exec oxlint apps/cloudflare
pnpm --filter @manut/cloudflare check
pnpm --filter @manut/cloudflare test
pnpm --silent --filter @manut/cloudflare cutover:readiness -- --json
```

Run after Cloudflare Builds shadow mode is configured:

```bash
pnpm --silent --filter @manut/cloudflare cutover:readiness -- --json | jq .
```

Expected before production cutoff: readiness may still be blocked. The key is that the blocked result is truthful and visible.

## Rollback Plan

- Before M4: re-run the existing GitHub workflow paths if Cloudflare Builds fails.
- After M4 but before Phase 8: keep a manual GitHub fallback workflow or documented GCP/GKE rollback path.
- After Phase 8: rollback should use Cloudflare Worker versions/deployments and documented Cloudflare rollback procedures.
- Never delete GCP rollback credentials until rollback ownership has been explicitly moved and verified.

## Stop Conditions

Stop and return to planning if any of these occur:

- Cloudflare Builds cannot produce a required GitHub-visible check.
- Cloudflare Builds deploys from an unintended branch.
- Pull request builds can promote production traffic.
- The readiness command reports green without the five operator/live evidence gates.
- Better Stack, authenticated smoke, or D1 evidence is missing but treated as pass.
- GCP rollback dependency remains undocumented.

## Open Questions

- Should final production branch remain `preview`, or move to `main` before retiring GitHub Actions?
- Should API/web checks remain GitHub-owned long term, or move to a separate Cloudflare-compatible runner?
- Should Better Stack monitor sync be an operator command, a Cloudflare scheduled Worker, or retained as GitHub Actions?
- Which branch protection checks are currently required on `preview` and `main`?

## Next Implementation PR

Recommended first PR:

- Add `ci:cloudflare`.
- Add a workflow inventory report.
- Add Cloudflare Builds shadow-mode validation notes.
- Do not disable any GitHub workflows yet.
