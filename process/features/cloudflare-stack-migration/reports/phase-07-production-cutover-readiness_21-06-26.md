# Phase 7 Production Cutover Readiness

Captured: 2026-06-21T09:20:00Z

## Status

Blocked. The cutover plan now exists, but production cutover cannot safely run
until external data, smoke, observability, and approval evidence exists.

## Latest Known Runtime Baseline

Latest captured baseline during this report:

- `manut.xyz` served HTTP `200` through Cloudflare and contained Manut branding.
- `app.manut.xyz/` served HTTP `200` from the current app origin.
- `app.manut.xyz/api/instances/` returned HTTP `503` from the current GKE app
  path at `2026-06-21T09:19:16Z`, then returned HTTP `200` with JSON at
  `2026-06-21T09:26:47Z` and again at `2026-06-21T09:40:09Z`.
- `app.manut.xyz` DNS still resolved to GKE IP `34.143.231.225`.
- `/uploads` still returned the current GCS-backed HTTP `403` XML response.
- Latest post-production-Worker baseline at `2026-06-21T10:01:13Z` returned
  HTTP `200` for `https://app.manut.xyz/api/instances/`, HTTP `403` for
  `/uploads`, and still resolved `app.manut.xyz` to GKE IP `34.143.231.225`.

## Readiness Gate

Run:

```bash
pnpm --filter @manut/cloudflare cutover:readiness
```

Expected current result:

- `Cutover readiness: BLOCKED`
- `Phase 7 cutover ready: no`
- `Phase 8 decommission ready: no`
- `Selected checks passed: 13/17`

Latest local readiness audit at `2026-06-22T08:43:58Z`:

- Phase 7 selected checks: `13/17` passed; blocked on D1 import validation,
  authenticated smoke, Better Stack cutover green, and explicit operator
  approval.
- Phase 8 selected checks: `14/19` passed; the same Phase 7 blockers remain,
  plus seven-green-days evidence cannot exist until after cutover.
- The dry-run evidence bundle skipped all 6 remaining evidence tasks because
  the corresponding local input env vars were unset.
- Source-side GCP inventory is now recorded at
  `process/features/cloudflare-stack-migration/reports/phase-07-gcp-source-inventory_22-06-26.json`.
  The report was generated from read-only `gcloud` output and redacts GCS object
  names, Cloud SQL IP addresses, and Cloud SQL server certificates. It recorded
  the `plane-affine-495114-uploads` bucket with `2` objects and `4` likely
  Postgres source candidates for operator review. This is supporting evidence
  only; it does not replace final D1 import validation or final R2 manifest
  parity evidence.
- D1 validation query manifest is now recorded at
  `process/features/cloudflare-stack-migration/reports/phase-07-d1-validation-query-manifest_22-06-26.json`.
  It contains the current active `workspaces` / `projects` count SQL plus the
  `projects.workspace_id -> workspaces.id` orphan-check SQL. The count SQL uses
  `table_name` instead of the reserved `table` alias and was sanity-checked
  against local SQLite. The D1 validator and readiness gate now require exact
  coverage for both tables and the required relationship, and reject failed SQL
  runner envelopes even if they contain result rows. This is supporting evidence
  only; it does not replace the final D1 import validation report.
- R2 manifest validation is now recorded at
  `process/features/cloudflare-stack-migration/reports/phase-07-r2-manifest-validation_21-06-26.json`.
  The two production GCS upload objects were uploaded to `manut-uploads-prod`,
  read back from R2, and compared through strict shared-checksum validation with
  `matchedObjectCount: 2` and `mismatchedObjectCount: 0`. R2 upload parity is
  no longer a Phase 7 blocker, but production upload routing remains unchanged
  until the full cutover gate passes.

Phase 7/8 evidence bundle command:

```bash
pnpm --silent --filter @manut/cloudflare cutover:evidence -- --json --dry-run
```

Use the same command without `--dry-run` after the required local evidence
inputs are available. The bundle is non-destructive and writes the canonical
D1, R2, authenticated smoke, Better Stack, operator approval, and seven-green-
days JSON reports under `process/features/cloudflare-stack-migration/reports/`.
It skips missing evidence explicitly instead of fabricating green reports.

Required bundle inputs:

- `D1_POSTGRES_COUNTS`
- `D1_D1_COUNTS`
- `D1_RELATIONSHIPS`
- `R2_GCS_MANIFEST`
- `R2_R2_MANIFEST`
- `AUTHENTICATED_SMOKE_INPUT`
- `BETTERSTACK_API_TOKEN`
- `OPERATOR_APPROVAL_INPUT`
- `SEVEN_GREEN_DAYS_INPUT`

Better Stack cutover evidence command:

```bash
pnpm --filter @manut/cloudflare betterstack:cutover-report -- --out process/features/cloudflare-stack-migration/reports/phase-07-betterstack-cutover_21-06-26.json
```

That report requires `BETTERSTACK_API_TOKEN` and expects all three Better Stack
monitors to be `up`: `manut.xyz`, `app.manut.xyz`, and
`app.manut.xyz API instances`.
Direct endpoint probes in that report are required Phase 7 cutover evidence:
`manut.xyz`, `app.manut.xyz`, and `app.manut.xyz/api/instances/` must return
HTTP `200` with their expected keywords. Use `--soft-fail` only to capture a
blocked report for diagnosis.

The committed report must include at least the three required monitor checks,
all of them must be `up`, and all required endpoint probes must pass. Readiness
also validates high-risk evidence report shape for D1 import, R2 manifest
parity, authenticated smoke, Better Stack monitor and endpoint status, and
Phase 8 seven-green-days evidence so generic `ok: true` stubs cannot unblock
cutover.

High-risk evidence validation is bound to the readiness gate, not to the report
filename. Environment overrides with arbitrary file names still require the
proper D1, R2, authenticated smoke, Better Stack, or Phase 8 JSON shape. The
final D1 report must include a passing `count_report`; the Better Stack gate
specifically requires `public-site`, `app-root`, and `api-instances` monitor
checks.

## Preview Cloudflare Smoke

Report:
`process/features/cloudflare-stack-migration/reports/phase-07-cloudflare-preview-smoke_21-06-26.json`

Result:

- `https://manut-app-preview.bettergogocash.workers.dev/healthz` returned HTTP
  `200`.
- `/api/instances/` returned HTTP `200` with Manut instance metadata.
- `/api/cloudflare/migration-status` returned HTTP `200` and confirmed the
  legacy proxy is configured.
- `/api/cloudflare/routes` returned HTTP `200` and `cutover_ready: false`.
- `/api/cloudflare/d1/workspaces` returned HTTP `200` from D1 shadow reads.
- `/api/workspaces/` proxied to legacy GKE and returned HTTP `401` with
  `x-manut-edge-route: legacy-gke`.
- `/uploads` proxied to legacy GKE/GCS and returned HTTP `403` with
  `x-manut-edge-route: legacy-gke`.

Preview deploy evidence:

- Worker: `manut-app-preview`
- URL: `https://manut-app-preview.bettergogocash.workers.dev`
- Version ID: `2856b18f-2e3d-4a0b-94f9-f9276bd1c2b0`
- Queue producer: `manut-jobs-preview`
- Queue consumer: `manut-jobs-preview`

## Production Cloudflare Worker Evidence

Reports:

- `process/features/cloudflare-stack-migration/reports/phase-07-cloudflare-production-deploy_21-06-26.json`
- `process/features/cloudflare-stack-migration/reports/phase-07-cloudflare-production-smoke_21-06-26.json`

Deploy result:

- Worker: `manut-app`
- URL: `https://manut-app.bettergogocash.workers.dev`
- Version ID: `053b5b6c-4a64-41ed-ab68-9c2eabe9f924`
- D1: `manut-prod` (`a29a2712-f899-45ee-8ab9-f64afded7e1c`)
- R2: `manut-uploads-prod`
- KV: `manut-config-prod` (`e3fdd6cf29dc4f03a9a240830814c629`)
- Queue producer and consumer: `manut-jobs-prod`
- DNS changed: `false`

Smoke result:

- `https://manut-app.bettergogocash.workers.dev/healthz` returned HTTP `200`.
- `/api/instances/` returned HTTP `200` with Manut instance metadata.
- `/api/cloudflare/migration-status` returned HTTP `200` and confirmed the
  legacy proxy is configured.
- `/api/cloudflare/routes` returned HTTP `200` and `cutover_ready: false`.
- `/api/cloudflare/d1/workspaces` returned HTTP `200` from D1 shadow reads
  with an empty production D1 dataset.
- `/api/workspaces/` proxied to legacy GKE and returned HTTP `401` with
  `x-manut-edge-route: legacy-gke`.
- `/uploads` proxied to legacy GKE/GCS and returned HTTP `403` with
  `x-manut-edge-route: legacy-gke`.
- Live shadow validation passed against
  `https://manut-app.bettergogocash.workers.dev/api/cloudflare/live/rooms/*`
  with HTTP health/metadata/planned-response, lock acquire/conflict/release,
  and WebSocket echo checks.

## Blocking Evidence Gaps

- No final D1 import validation report is recorded.
- No authenticated app smoke report is recorded.
- No Better Stack cutover-green report is recorded.
- No explicit `CUTOVER_APPROVED=true` operator approval is recorded.
- No Phase 8 seven-green-days report can be recorded until Phase 7 cutover has
  completed and the full stability window has elapsed.

## Operator Decision

Do not change `app.manut.xyz` routing yet. Keep GKE/GCP as active production
runtime and rollback anchor.

## Production Health Note

The current app API had a transient non-green probe during this phase:
`/api/instances/` returned HTTP `503` once and later returned HTTP `200`.
Continue monitoring before using the GKE API as a parity source for Cloudflare
contract tests or a rollback target.

Follow-up live investigation at `2026-06-21T14:35:24Z` confirmed the endpoint
had recovered with two HTTP `200` JSON samples, but Kubernetes events showed the
earlier failure aligned with GKE Autopilot node scale-down deleting the only API
pod. The live fallback deployment was running with a single API replica, and the
new pod reported readiness failures while gunicorn started. The tracked
`k8s/manut-helm-values.yaml` now sets two replicas for HTTP-facing Manut
workloads so the planned `manut-ce` release does not repeat this node
scale-down outage pattern. The GKE deploy smoke should also fail when any
post-rollout sample fails instead of treating recovered samples as green.
The current `plane-ce` fallback was scaled to two replicas for API, web, admin,
space, and live workloads, and fallback disruption budgets were added so
voluntary node disruption must preserve at least one HTTP-serving pod.

The latest baseline in this report returned HTTP `200` for
`https://app.manut.xyz/api/instances/`, while DNS still pointed
`app.manut.xyz` at GKE IP `34.143.231.225`.
