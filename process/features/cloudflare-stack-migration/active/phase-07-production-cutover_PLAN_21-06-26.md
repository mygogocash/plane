# Phase 7 - Production Cutover

**Status:** BLOCKED pending final D1 import validation, authenticated smoke, Better Stack green, and explicit operator approval

## Objective

Move `app.manut.xyz` from the current GKE/GCP runtime to the Cloudflare runtime
without losing rollback to `manut-ce` / `manut-app`.

## Business Impact

- Users continue to reach the same `app.manut.xyz` product origin.
- Manut begins serving production app traffic through Cloudflare after proven
  parity.
- GKE/GCP remains available as rollback until Phase 8.

## Technical Scope

- Announce and execute a maintenance window.
- Freeze writes on the GKE app runtime.
- Run final Postgres-to-D1 delta export/import.
- Validate D1 row counts, relationships, and representative API contracts.
- Validate GCS-to-R2 upload object count, size, and checksum parity.
- Deploy the production Worker/Page stack through the manual Cloudflare CI/CD
  workflow.
- Switch `app.manut.xyz` routing to Cloudflare only after all hard gates pass.
- Run public and authenticated smoke tests after routing changes.

## Dependencies

- Phase 2 frontend and edge routing report.
- Phase 3 R2 manifest validation against production object exports.
- Phase 4 D1 import and API contract evidence.
- Phase 5 Queue/KV/Durable Object shadow evidence.
- Phase 6 manual Cloudflare deployment workflow.
- Better Stack monitors for `manut.xyz`, `app.manut.xyz`, and
  `app.manut.xyz/api/instances/`.
- Operator approval for the maintenance window and DNS/routing update.

## Hard Gates

Run the readiness checker before any cutover action:

```bash
pnpm --filter @manut/cloudflare cutover:readiness
```

The command must report `Cutover readiness: READY` before routing is changed.
At the current phase-program state it is expected to report `BLOCKED`.

Use the evidence bundle to generate the remaining canonical evidence reports
when the required operator-captured inputs are available:

```bash
pnpm --silent --filter @manut/cloudflare cutover:evidence -- --json --dry-run
```

The bundle is non-destructive. It reports missing inputs as skipped and writes
canonical D1, R2, authenticated smoke, Better Stack, operator approval, and
seven-green-days JSON reports only when real inputs are supplied.

Required evidence variables:

- `CLOUDFLARE_PREVIEW_SMOKE_REPORT`
- `CLOUDFLARE_PRODUCTION_DEPLOY_REPORT`
- `CLOUDFLARE_PRODUCTION_SMOKE_REPORT`
- `D1_IMPORT_VALIDATION_REPORT`
- `R2_MANIFEST_VALIDATION_REPORT`
- `LIVE_SHADOW_TEST_REPORT`
- `AUTHENTICATED_SMOKE_REPORT`
- `BETTERSTACK_CUTOVER_REPORT`
- `OPERATOR_CUTOVER_APPROVAL_REPORT`
- `CUTOVER_APPROVED=true`

`OPERATOR_CUTOVER_APPROVAL_REPORT` must be generated with:

```bash
pnpm --filter @manut/cloudflare operator:approval-report -- \
  --input operator-approval-evidence.json \
  --out process/features/cloudflare-stack-migration/reports/phase-07-operator-cutover-approval_21-06-26.json
```

The report must include `approved_by`, `approved_at`, a valid
`maintenance_window`, and passing evidence for maintenance-window announcement,
rollback checkpoint, DNS change approval, write freeze, and smoke-plan
readiness. `CUTOVER_APPROVED=true` is only valid after that report exists.

`AUTHENTICATED_SMOKE_REPORT` must also be canonicalized with
`auth:smoke-report` and include `actor`, `target_origin:
https://app.manut.xyz`, every required authenticated workflow, and meaningful
evidence for each check. Blank strings or empty evidence objects are not valid
Phase 7 smoke evidence.

A non-passing operator input template is available at
`process/features/cloudflare-stack-migration/references/phase-07-authenticated-smoke-input-template_22-06-26.json`.
Regenerate it with:

```bash
pnpm --filter @manut/cloudflare auth:smoke-report -- --template --out <path>
```

Fill it from a real authenticated production smoke run, then pass the filled
file to `auth:smoke-report`.

`BETTERSTACK_CUTOVER_REPORT` must be generated with
`betterstack:cutover-report` or an equivalent canonical shape where every
required monitor is `up` and has `url_matches: true` for the expected Manut
production URL.

## Rollback Strategy

Rollback remains DNS/routing based until Phase 8:

1. Point `app.manut.xyz` back to the GKE origin or previous Cloudflare route
   that proxies GKE.
2. Keep `manut-ce` namespace and `manut-app` Helm release running.
3. Keep Cloud SQL, GCS uploads, Redis, RabbitMQ, and live service available.
4. Capture failing Cloudflare Worker logs, D1 validation output, R2 manifest
   mismatch details, and Better Stack incident evidence before cleanup.

## Risks

- D1 SQLite semantics diverge from existing Postgres behavior.
- R2 upload compatibility may miss private object ACL behavior or signed URL
  edge cases.
- Durable Object live behavior may diverge from the current Node live service.
- DNS/routing changes can partially propagate and create mixed-runtime traffic.
- Authenticated smoke cannot be assumed from public `/api/instances/` health.

## Testing Matrix

| Area          | Required Evidence                                      |
| ------------- | ------------------------------------------------------ |
| Landing       | `https://manut.xyz` remains HTTP 200 and branded Manut |
| App shell     | `https://app.manut.xyz` loads Cloudflare-served shell  |
| Instance API  | `/api/instances/` returns HTTP 200 with Manut metadata |
| Auth          | login and session refresh work                         |
| Workspace     | sidebar, workspace list, and project list work         |
| Work item     | create, edit, and delete a non-critical item           |
| Uploads       | attachment/logo upload resolves through `/uploads/*`   |
| Live          | representative room update propagates                  |
| Admin         | `/god-mode` loads for authorized user                  |
| Space         | public space route loads                               |
| Observability | Better Stack green and no Cloudflare 5xx spike         |

## Acceptance Criteria

- Readiness checker passes.
- Production Cloudflare deploy evidence is recorded.
- D1 and R2 validation reports are recorded.
- `app.manut.xyz` routes to Cloudflare.
- Public and authenticated smoke passes.
- Rollback path to GKE is still documented and tested.

## Current Blockers

- No final D1 import validation report exists.
- No authenticated smoke report exists.
- No Better Stack cutover-green report exists.
- No explicit cutover approval is recorded.
- `app.manut.xyz` still routes to the GKE/GCP app runtime until all hard gates
  pass.
