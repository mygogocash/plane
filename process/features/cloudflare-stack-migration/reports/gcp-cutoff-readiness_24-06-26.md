# GCP Cutoff Readiness - 2026-06-24

## Verdict

GCP production is **not ready to cut off**.

Cloudflare production deployment is present and public endpoints respond, but the cutover gates still block decommission. Keep GCP/GKE, Cloud SQL/Postgres, GCS uploads, Artifact Registry, static IP, DNS/load-balancer rollback paths, and service accounts available as rollback.

## Completed In This Pass

- Rechecked Phase 7 readiness with `pnpm --silent --filter @manut/cloudflare cutover:readiness -- --json`.
- Confirmed readiness is still blocked: `14/19` checks passed, `5` blocked.
- Confirmed latest Cloudflare production Worker deployment exists:
  - deployment `24a6f95f-6668-4319-9031-cf8495c953f1`
  - source `wrangler`
  - created `2026-06-24T07:02:23.326235Z`
- Generated authenticated-smoke input template:
  - `process/features/cloudflare-stack-migration/reports/phase-07-authenticated-smoke-input-template_24-06-26.json`
- Generated operator-approval input template:
  - `process/features/cloudflare-stack-migration/reports/phase-07-operator-cutover-approval-input-template_24-06-26.json`
- Generated seven-green-days input template:
  - `process/features/cloudflare-stack-migration/reports/phase-08-seven-green-days-input-template_24-06-26.json`
- Captured non-authenticated Worker smoke evidence:
  - `process/features/cloudflare-stack-migration/reports/phase-07-worker-smoke_24-06-26.json`
- Captured Better Stack cutover report attempt:
  - `process/features/cloudflare-stack-migration/reports/phase-07-betterstack-cutover_21-06-26.json`
- Captured D1 target evidence attempt:
  - `process/features/cloudflare-stack-migration/reports/phase-07-d1-target-evidence_24-06-26.json`

## Current Evidence

### Public Endpoint Checks

Public endpoint probes from this pass:

| Endpoint                                                      | HTTP | Result                          |
| ------------------------------------------------------------- | ---: | ------------------------------- |
| `https://app.manut.xyz/healthz`                               |  200 | HTML app shell, not Worker JSON |
| `https://app.manut.xyz/api/instances/`                        |  200 | JSON instance contract          |
| `https://manut-app.bettergogocash.workers.dev/healthz`        |  200 | Worker health JSON              |
| `https://manut-app.bettergogocash.workers.dev/api/instances/` |  200 | Worker instance contract        |
| `https://manut.xyz/`                                          |  200 | Landing page                    |

### Worker Smoke

`phase-07-worker-smoke_24-06-26.json` is **not green**:

- Passed: `2/7`
- Failing checks:
  - `migration-status`
  - `route-map`
  - `d1-workspaces-shadow`
  - `legacy-api-proxy`
  - `legacy-uploads-proxy`

This means the production Worker is reachable, but not enough legacy/shadow behavior is proven for GCP cutoff.

### D1

`phase-07-d1-target-evidence_24-06-26.json` blocks final import readiness:

- `final_import_ready=false`
- `final_import_blocked=true`
- required target rows: `0`
- reason: `D1 target required tables are empty; final import validation requires non-empty imported rows.`

Do not cut Cloud SQL/Postgres or the GKE data path until D1 has a real imported dataset and final source-to-target validation passes.

### Better Stack

`phase-07-betterstack-cutover_21-06-26.json` is **blocked**:

- Endpoint probes: `3/3`
- Monitor checks: `0/3`
- Missing monitors:
  - `manut.xyz`
  - `app.manut.xyz`
  - `app.manut.xyz API instances`

Better Stack must be configured and green before cutover approval.

### GCP Inventory

Configured GCP context:

- project: `affine-495114`
- active account: `fronk.kunanon@gogocash.co`

Read-only GCP inventory could not be completed because `gcloud` requires interactive reauthentication:

```text
Reauthentication failed. cannot prompt during non-interactive execution.
```

`kubectl` is not installed in this shell, so live GKE workload inventory could not be collected here.

Repo evidence identifies the current GCP production surface:

- GKE cluster: `manut-ce-gke`
- namespace: `manut-ce`
- static IP: `34.143.231.225`
- upload bucket: `plane-affine-495114-uploads`
- Artifact Registry: `asia-southeast1-docker.pkg.dev/affine-495114/affine`
- deployer service account: `github-manut-deployer@affine-495114.iam.gserviceaccount.com`
- GKE workloads from repo manifests include `manut-app-web`, `manut-app-api`, `manut-app-space`, `manut-app-admin`, live/worker/beat services, ingress, TLS, GCS upload route, and backing data services.

## Remaining Required Gates

1. Final D1 import validation
   - Import real production data into D1.
   - Generate source Postgres counts, D1 target counts, and relationship reports.
   - Run `pnpm --filter @manut/cloudflare d1:validate-import`.

2. Authenticated production smoke
   - Fill `phase-07-authenticated-smoke-input-template_24-06-26.json`.
   - Run:

```bash
AUTHENTICATED_SMOKE_INPUT=process/features/cloudflare-stack-migration/reports/phase-07-authenticated-smoke-input-template_24-06-26.json \
pnpm --filter @manut/cloudflare auth:smoke-report -- \
  --out process/features/cloudflare-stack-migration/reports/phase-07-authenticated-smoke_21-06-26.json
```

3. Better Stack monitors green
   - Configure or sync the three missing monitors.
   - Run:

```bash
pnpm --filter @manut/cloudflare betterstack:cutover-report -- \
  --require-endpoint-probes \
  --out process/features/cloudflare-stack-migration/reports/phase-07-betterstack-cutover_21-06-26.json
```

4. Explicit operator approval
   - Fill `phase-07-operator-cutover-approval-input-template_24-06-26.json`.
   - Run:

```bash
OPERATOR_APPROVAL_INPUT=process/features/cloudflare-stack-migration/reports/phase-07-operator-cutover-approval-input-template_24-06-26.json \
pnpm --filter @manut/cloudflare operator:approval-report -- \
  --out process/features/cloudflare-stack-migration/reports/phase-07-operator-cutover-approval_21-06-26.json
```

5. Seven green production days
   - Start only after Phase 7 cutover is genuinely complete.
   - Fill `phase-08-seven-green-days-input-template_24-06-26.json`.
   - Run:

```bash
pnpm --filter @manut/cloudflare seven-green-days:report -- \
  --input process/features/cloudflare-stack-migration/reports/phase-08-seven-green-days-input-template_24-06-26.json \
  --out process/features/cloudflare-stack-migration/reports/phase-08-seven-green-days_21-06-26.json
```

## Safe GCP Actions Now

Allowed before final cutoff:

- Pause or delete unused non-production GKE workloads.
- Disable stale non-production CI deploy paths.
- Stop non-production compute resources after confirming they are not serving production.
- Export/backup Cloud SQL/Postgres and GCS upload data.
- Generate a fresh live GCP inventory after interactive reauth.
- Lower min replicas only where a verified rollback capacity remains.

Not allowed yet:

- Do not delete or disable production GKE workloads.
- Do not delete Cloud SQL/Postgres.
- Do not delete the GCS uploads bucket.
- Do not delete Artifact Registry images used for rollback.
- Do not release static IP `34.143.231.225`.
- Do not remove DNS/load-balancer rollback paths.
- Do not delete deployer/service accounts or secrets needed for rollback.

## Manual GCP Inventory Commands After Reauth

Run these after `gcloud auth login` / reauth:

```bash
gcloud config set project affine-495114
gcloud container clusters list --format=json
gcloud compute instances list --format=json
gcloud sql instances list --format=json
gcloud storage buckets list --format=json
gcloud compute forwarding-rules list --format=json
gcloud compute addresses list --format=json
gcloud dns managed-zones list --format=json
gcloud iam service-accounts list --format=json
gcloud run services list --platform=managed --format=json
```

If `kubectl` is installed after reauth:

```bash
gcloud container clusters get-credentials manut-ce-gke --region asia-southeast1 --project affine-495114
kubectl get deploy,statefulset,svc,ingress,pvc -n manut-ce -o wide
kubectl get pods -n manut-ce -o wide
```

## Cutoff Decision

Current status: **prepare-only**.

GCP production cutoff should wait until the missing Phase 7 reports exist, readiness returns green, and Phase 8 records seven green days after cutover.
