# Cloudflare Builds Shadow Mode Runbook

Generated: 2026-06-24T12:27:17Z
Feature: Cloudflare stack migration
Plan: `process/features/cloudflare-stack-migration/active/github-actions-retirement-cloudflare-cicd_PLAN_24-06-26.md`
Milestone: M2 - Cloudflare Builds shadow configuration
Status: repo support added; Cloudflare dashboard configuration remains operator-owned

## Purpose

Prepare Cloudflare Workers Builds to run beside GitHub Actions before any GitHub deploy workflow is disabled.

This runbook is shadow-mode only. It does not authorize production DNS changes, final D1 import, Better Stack mutation, GCP shutdown, or removal of GitHub rollback paths.

## Repo-Owned Command

The Cloudflare package now exposes one command for Cloudflare CI/CD parity:

```bash
pnpm --filter @manut/cloudflare ci:cloudflare
```

The command runs:

```bash
pnpm exec oxfmt --check apps/cloudflare .github/workflows/cloudflare-ci-cd.yml process/features/cloudflare-stack-migration
pnpm exec oxlint apps/cloudflare
pnpm --filter @manut/cloudflare check
pnpm --filter @manut/cloudflare test
pnpm --silent --filter @manut/cloudflare cutover:readiness -- --json
```

The readiness step is parsed as JSON. A `blocked` readiness result is allowed while Phase 7 and Phase 8 operator/live evidence is incomplete. Malformed JSON, inconsistent summary counts, unsupported check statuses, or a false-green readiness report must fail the command.

## Cloudflare Builds Configuration

Operator-only setup in Cloudflare dashboard:

| Setting                              | Value                                                                 |
| ------------------------------------ | --------------------------------------------------------------------- |
| Project / Worker                     | `manut-app`                                                           |
| Repository                           | `mygogocash/plane`                                                    |
| Production branch                    | `preview` until branch strategy is explicitly moved to `main`         |
| Root directory                       | Repository root                                                       |
| Package manager                      | `pnpm`                                                                |
| Build command                        | `pnpm --filter @manut/cloudflare ci:cloudflare`                       |
| Deploy command for production branch | `pnpm --filter @manut/cloudflare deploy:production`                   |
| Non-production behavior              | Upload/validate a Worker version without production traffic promotion |

If Cloudflare Builds executes from `apps/cloudflare` instead of the repository root, use workspace-aware equivalents:

```bash
pnpm --dir ../.. --filter @manut/cloudflare ci:cloudflare
pnpm --dir ../.. --filter @manut/cloudflare deploy:production
```

Validate the actual dashboard working directory before marking shadow mode complete.

## Required Cloudflare-Side Inputs

- GitHub repository connection for `mygogocash/plane`.
- Cloudflare build permissions for the `manut-app` Worker.
- Cloudflare-side secrets and variables needed by Wrangler and runtime smoke checks.
- Confirmation that pull request or non-production builds cannot deploy active production traffic.
- Confirmation that production deploy is restricted to the intended branch.

Do not copy GitHub-only GCP/GKE secrets into Cloudflare Builds.

## Shadow-Mode Evidence To Capture

Create a follow-up evidence report after the first real Cloudflare Builds run with:

- Cloudflare build URL.
- GitHub check-run name and URL.
- Commit SHA.
- Branch name.
- Build command observed by Cloudflare.
- Deploy command observed by Cloudflare.
- Whether the run was production branch or non-production branch.
- Whether a Worker version was uploaded.
- Whether active production traffic changed.
- Full `ci:cloudflare` readiness summary.
- Confirmation that blocked cutover gates remained blocked when evidence was missing.

Recommended report path:

```text
process/features/cloudflare-stack-migration/reports/cloudflare-builds-shadow-evidence_24-06-26.md
```

Operator input template:

```text
process/features/cloudflare-stack-migration/reports/cloudflare-builds-shadow-input-template_24-06-26.json
```

Generate or refresh the input template:

```bash
pnpm --silent --filter @manut/cloudflare cloudflare-builds:shadow-report --template --out process/features/cloudflare-stack-migration/reports/cloudflare-builds-shadow-input-template_24-06-26.json
```

Validate filled operator evidence:

```bash
pnpm --silent --filter @manut/cloudflare cloudflare-builds:shadow-report \
  --input process/features/cloudflare-stack-migration/reports/cloudflare-builds-shadow-input-template_24-06-26.json \
  --out process/features/cloudflare-stack-migration/reports/cloudflare-builds-shadow-evidence_24-06-26.json
```

## Acceptance Criteria

Shadow mode is complete only when:

- `pnpm --filter @manut/cloudflare ci:cloudflare` passes locally.
- Cloudflare Builds produces a visible GitHub check for a non-production branch or PR.
- The Cloudflare check fails on a controlled malformed readiness-output test or documented dry-run equivalent.
- A non-production build does not promote production traffic.
- A production-branch build behavior is explicitly reviewed before enabling automatic deployment authority.
- GitHub Actions deploy workflows remain enabled as fallback until M4.

## Stop Conditions

Stop and return to planning if:

- Cloudflare Builds cannot run from the monorepo root or a verified workspace-aware command.
- Pull request builds can deploy active production traffic.
- The Cloudflare check passes with malformed readiness JSON.
- The Cloudflare check passes with Phase 7 or Phase 8 false-green evidence.
- Cloudflare-side secrets require copying GCP/GKE deploy credentials.
- Branch protection or rulesets remain undefined when GitHub deploy checks are about to be disabled.

## Current Cutoff State

At runbook creation, cutover readiness remains blocked at 14/19 with:

- `d1-import-validation`
- `authenticated-smoke`
- `betterstack-cutover-green`
- `operator-cutover-approval`
- `phase8-seven-green-days`

This is expected. Shadow-mode CI/CD support does not make production cutover or GCP cutoff safe by itself.

## References

- Cloudflare Workers Builds: `https://developers.cloudflare.com/workers/ci-cd/builds/`
- Cloudflare Workers Builds configuration: `https://developers.cloudflare.com/workers/ci-cd/builds/configuration/`
- Cloudflare Workers GitHub integration: `https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/`
- Cloudflare Workers versions and deployments: `https://developers.cloudflare.com/workers/configuration/versions-and-deployments/`
