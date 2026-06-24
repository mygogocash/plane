# Cloudflare Builds Command Observation Blocker

Generated: 2026-06-24T13:29:23Z
Feature: Cloudflare stack migration
Plan: `process/features/cloudflare-stack-migration/active/github-actions-retirement-cloudflare-cicd_PLAN_24-06-26.md`
Evidence report: `process/features/cloudflare-stack-migration/reports/cloudflare-builds-shadow-evidence_24-06-26.json`
Status: blocked on Cloudflare Builds command observation

## Current Evidence

The current PR head has a successful Cloudflare Workers Builds check:

| Field                                 | Value                                                                                                                                                 |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub check                          | `https://github.com/mygogocash/plane/runs/83199924061`                                                                                                |
| Cloudflare build                      | `https://dash.cloudflare.com/187ab61ed9dbc6e616cb23e6b95aa8f1/workers/services/view/manut-app/production/builds/4a54064d-7fba-437b-aa19-d2b7d28bb5cc` |
| Build UUID                            | `4a54064d-7fba-437b-aa19-d2b7d28bb5cc`                                                                                                                |
| Worker script                         | `manut-app`                                                                                                                                           |
| Uploaded Worker version               | `703b72f7-d075-4dc2-96aa-95d42fea5d0c`                                                                                                                |
| Active production version after check | `f9aff236-d7b8-44a2-8d1f-d51bc67ad82b`                                                                                                                |

This proves the Workers Builds check succeeded and uploaded a Worker version, while active production traffic stayed on a different version.

## Remaining Blockers

The evidence report is still intentionally blocked:

```text
build_command_not_observed
deploy_command_not_observed
```

These fields must not be inferred from the repo scripts alone. They must be observed from Cloudflare Builds trigger configuration, build details, or the Builds API.

## Attempts Made

- GitHub check-run metadata was inspected. It exposes the Build ID, script name, and version ID, but not build/deploy commands.
- Wrangler read-only commands were inspected. Wrangler can read deployments and Worker versions, but it does not expose Workers Builds trigger command configuration.
- The Cloudflare dashboard build URL was opened in browser automation. The session redirected to Cloudflare login, so dashboard command details were not available.
- Local environment variables were checked by name only. No `CLOUDFLARE_BUILDS_API_TOKEN` or equivalent Builds API token was present.

## Official API Path

Cloudflare documents that Workers Builds trigger configuration is available through the Workers Builds REST API, but it requires a user-scoped API token. Account-scoped tokens are not supported for the Builds API.

Required token permissions from Cloudflare docs:

- `Workers Builds Configuration` access
- `Workers Scripts` read access

Reference:

```text
https://developers.cloudflare.com/workers/ci-cd/builds/api-reference/
```

## Closure Option A - Dashboard Confirmation

An operator with Cloudflare dashboard access can close this blocker without creating an API token:

1. Open the Cloudflare build URL above.
2. Confirm the configured build command is one of:
   - `pnpm --filter @manut/cloudflare ci:cloudflare`
   - `pnpm --dir ../.. --filter @manut/cloudflare ci:cloudflare`
3. Confirm the configured non-production deploy command is one of:
   - `pnpm --filter @manut/cloudflare exec wrangler versions upload --env production`
   - `pnpm --dir ../.. --filter @manut/cloudflare exec wrangler versions upload --env production`
4. Confirm the branch was `codex/cloudflare-cutoff-gates` and did not promote active production traffic.
5. Set these fields to `true` in the shadow evidence input:
   - `run.build_command_observed`
   - `run.deploy_command_observed`
6. Regenerate evidence:

```bash
pnpm --silent --filter @manut/cloudflare cloudflare-builds:shadow-report \
  --input process/features/cloudflare-stack-migration/reports/cloudflare-builds-shadow-input-template_24-06-26.json \
  --out process/features/cloudflare-stack-migration/reports/cloudflare-builds-shadow-evidence_24-06-26.json
```

## Closure Option B - Builds API Token

An operator can provide a user-scoped Builds API token in a local environment variable:

```bash
export CLOUDFLARE_BUILDS_API_TOKEN=...
```

Then use the official API sequence:

```bash
curl -s "https://api.cloudflare.com/client/v4/accounts/187ab61ed9dbc6e616cb23e6b95aa8f1/workers/scripts" \
  --header "Authorization: Bearer ${CLOUDFLARE_BUILDS_API_TOKEN}" \
  | jq '.result[] | select(.id == "manut-app") | {name: .id, tag: .tag}'
```

Use the returned Worker tag:

```bash
curl -s "https://api.cloudflare.com/client/v4/accounts/187ab61ed9dbc6e616cb23e6b95aa8f1/builds/workers/<worker_tag>/triggers" \
  --header "Authorization: Bearer ${CLOUDFLARE_BUILDS_API_TOKEN}" \
  | jq '.result[] | {trigger_name, build_command, deploy_command, root_directory, branch_includes, branch_excludes}'
```

Only mark the evidence `ok:true` if the observed trigger commands match the accepted command set and the build remains non-production traffic.

## Stop Conditions

Stop and return to planning if:

- The observed build command is not `ci:cloudflare`.
- The observed non-production deploy command can promote active production traffic.
- The trigger uses a production branch unexpectedly.
- The Cloudflare Builds API token is account-scoped instead of user-scoped.
- The evidence report becomes green while Phase 7 readiness remains blocked for live/operator evidence.

## Current Conclusion

M2 is not complete yet. The current state is stronger than before because the Workers Builds check and no-production-traffic condition are verified, but the two command-observation blockers require Cloudflare dashboard access or a user-scoped Builds API token.
