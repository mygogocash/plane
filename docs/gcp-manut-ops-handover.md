# GCP Manut Ops Handover

## Current State

- Production app: `https://app.manut.xyz`
- GCP project: `affine-495114`
- Region: `asia-southeast1`
- Target GKE cluster variable: `GKE_CLUSTER=manut-ce-gke`
- Target namespace: `manut-ce`
- Target Helm release: `manut-app`
- Static IP: `34.143.231.225`
- DNS: Cloudflare `A app 34.143.231.225`, DNS-only
- Active workflow: `Manut CI/CD`

The previous live release was `plane-app` in `plane-ce`. Keep it running until the
`manut-app` public and authenticated smoke checks pass.

## Managed Services

Physical GCP data resources are intentionally not renamed in this pass:

- Cloud SQL Postgres: `plane-pg`
- Memorystore Redis: `plane-redis`
- Cloud Storage uploads bucket: `plane-affine-495114-uploads`
- Turbo cache Cloud Run service: `turbo-cache`

## Secrets

Secrets live in Secret Manager. Do not print or commit secret values.

Clone the required runtime secrets into Kubernetes names used by
`k8s/manut-helm-values.yaml` before installing `manut-app`:

- `manut-app-env`
- `manut-doc-store`
- `manut-live-env`
- `manut-pgdb`

GitHub Actions deploys with the Manut deployer identity:

- Kubernetes Role/RoleBinding: `github-actions-manut-deployer`
- GCP IAM principal: `github-manut-deployer@affine-495114.iam.gserviceaccount.com`

## Tracked Artifacts

- `k8s/manut-helm-values.yaml`: Helm values for the `manut-app` release.
- `k8s/app-manut-xyz-ingress.yaml`: `app.manut.xyz` and `/uploads` ingress.
- `k8s/cert-manager-letsencrypt.yaml`: `letsencrypt-prod` issuer and app cert.
- `k8s/github-actions-deployer-rbac.yaml`: namespace-scoped deploy permissions.
- `k8s/manut-pod-disruption-budgets.yaml`: disruption budgets for the Manut
  HTTP-facing workloads.
- `k8s/plane-fallback-pod-disruption-budgets.yaml`: disruption budgets for the
  current `plane-ce` fallback while it remains live.
- `k8s/manut-uploads-cors.json`: Cloud Storage CORS policy.
- `docs/gcs-plane-uploads-lifecycle.json`: non-destructive bucket lifecycle.

## Install Or Reconcile

```bash
gcloud config set project affine-495114
gcloud container clusters get-credentials manut-ce-gke \
  --region asia-southeast1 \
  --project affine-495114

kubectl create namespace manut-ce --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -f k8s/github-actions-deployer-rbac.yaml
kubectl apply -f k8s/cert-manager-letsencrypt.yaml

helm upgrade --install manut-app makeplane/plane-ce \
  --version 1.5.1 \
  --namespace manut-ce \
  --values k8s/manut-helm-values.yaml

kubectl apply -f k8s/manut-pod-disruption-budgets.yaml
kubectl apply -f k8s/app-manut-xyz-ingress.yaml
```

While `plane-ce` remains the production fallback, keep its HTTP-facing
deployments at two replicas and apply the fallback disruption budgets:

```bash
kubectl -n plane-ce scale \
  deployment/plane-app-api-wl \
  deployment/plane-app-web-wl \
  deployment/plane-app-admin-wl \
  deployment/plane-app-space-wl \
  deployment/plane-app-live-wl \
  --replicas=2

kubectl apply -f k8s/plane-fallback-pod-disruption-budgets.yaml
```

Apply upload bucket CORS:

```bash
gcloud storage buckets update gs://plane-affine-495114-uploads \
  --cors-file=k8s/manut-uploads-cors.json
```

Apply upload bucket lifecycle:

```bash
gcloud storage buckets update gs://plane-affine-495114-uploads \
  --lifecycle-file=docs/gcs-plane-uploads-lifecycle.json
```

## CI/CD

Pushes to `preview` deploy through `.github/workflows/ci-cd.yml`:

1. Run web and API checks.
2. Publish `manut-*` component images to Artifact Registry.
3. Run the backend migrator image as `manut-app-api-migrate-*`.
4. Reconcile HTTP-facing replica counts and PodDisruptionBudgets.
5. Set GKE deployment images for `manut-app-*` workloads.
6. Wait for rollout status and smoke `https://app.manut.xyz/api/instances/`.
7. Sync Better Stack uptime monitors when `BETTERSTACK_API_TOKEN` is configured.

Required repository variables:

- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_SERVICE_ACCOUNT`

Defaulted repository variables:

- `GCP_APP_URL`
- `GCP_ARTIFACT_REPOSITORY`
- `GCP_PROJECT_ID`
- `GCP_REGION`
- `GKE_CLUSTER`
- `GKE_NAMESPACE`
- `GKE_MIN_HTTP_REPLICAS`, default `2`

## Better Stack Monitoring

Better Stack monitor provisioning is tracked in:

- `.github/ops/betterstack/sync-manut-monitors.sh`
- `.github/workflows/betterstack-monitoring.yml`

The script is aligned with the current Better Stack `Manut XYZ` setup shown in the
dashboard. It creates or updates three visible uptime monitors by default:

- `app.manut.xyz`: `https://app.manut.xyz`, expects `200` and keyword `Manut`.
- `manut.xyz`: `https://manut.xyz`, expects `200` and keyword `Manut`.
- `app.manut.xyz API instances`: `https://app.manut.xyz/api/instances/`, expects `200`
  and keyword `current_version`.

The sync matches existing monitors by name or by URL after removing trailing slashes, so it
does not create a duplicate when Better Stack stores `https://app.manut.xyz` and the script
uses `https://app.manut.xyz/`.

The workflow also uploads `phase-07-betterstack-cutover`, a JSON evidence report generated
by `apps/cloudflare/tools/betterstack-cutover-report.mjs`. Download that artifact and commit
it as `process/features/cloudflare-stack-migration/reports/phase-07-betterstack-cutover_21-06-26.json`
when all three monitors are `up` and the live endpoint probes pass.
The report records direct endpoint probes as supplemental evidence by default;
set `BETTERSTACK_REQUIRE_ENDPOINT_PROBES=true` only from a runner/network allowed
through Cloudflare bot protection.

Required GitHub secret:

- `BETTERSTACK_API_TOKEN`: Better Stack Uptime API token with monitor read/write access.

Optional repository variables:

- `BETTERSTACK_API_BASE`, default `https://uptime.betterstack.com/api/v2`
- `BETTERSTACK_APP_URL`, default `GCP_APP_URL` or `https://app.manut.xyz`
- `BETTERSTACK_SITE_URL`, default `https://manut.xyz`
- `BETTERSTACK_CHECK_FREQUENCY`, default `180`
- `BETTERSTACK_REQUEST_TIMEOUT`, default `30`
- `BETTERSTACK_APP_MONITOR_NAME`, default `app.manut.xyz`
- `BETTERSTACK_SITE_MONITOR_NAME`, default `manut.xyz`
- `BETTERSTACK_API_MONITOR_NAME`, default `app.manut.xyz API instances`
- `BETTERSTACK_APP_KEYWORD`, default `Manut`
- `BETTERSTACK_SITE_KEYWORD`, default `Manut`
- `BETTERSTACK_API_KEYWORD`, default `current_version`
- `BETTERSTACK_INCLUDE_API_MONITOR`, default `true`
- `BETTERSTACK_REQUIRE_ENDPOINT_PROBES`, default `false`
- `BETTERSTACK_POLICY_ID`
- `BETTERSTACK_MONITOR_GROUP_ID`

Provision or refresh monitors manually:

```bash
gh secret set BETTERSTACK_API_TOKEN -R mygogocash/plane
gh workflow run "Better Stack Monitoring" \
  -R mygogocash/plane \
  -f dry_run=false
```

Validate the payload without calling Better Stack:

```bash
gh workflow run "Better Stack Monitoring" \
  -R mygogocash/plane \
  -f dry_run=true
```

If `BETTERSTACK_API_TOKEN` is missing, the workflow exits successfully with a warning and
does not create monitors. This keeps production deploys from failing because an external
monitoring token has not been installed yet.

## Smoke Checks

Public unauthenticated checks:

```bash
curl -fsS https://app.manut.xyz/api/instances/ >/tmp/manut-instance.json
curl -i https://app.manut.xyz/uploads
kubectl get pods,deploy,svc,ingress,certificate -n manut-ce
helm status manut-app -n manut-ce
```

Expected:

- `/api/instances/` returns `200`.
- `/uploads` returns Cloud Storage XML, usually `403`, not app HTML.
- `manut-app-*` pods are `Running`.
- Certificate `app-manut-xyz-tls` is `Ready=True`.
- Helm release `manut-app` is `deployed`.

Authenticated smoke:

- Sign in at `https://app.manut.xyz/gogocash/`.
- Verify workspace sidebar, project list, recents, and logo render.
- Create/edit/delete a non-critical work item.
- Upload a workspace logo, project cover, and work-item attachment.
- Verify loading states no longer show Plane assets.

## Rollback

Keep `plane-ce` / `plane-app` online until the Manut cutover is proven.

Ingress rollback:

If ingress was already moved to `manut-app-*`, point `app.manut.xyz` back to the
old `plane-app-*` services or re-apply the last known-good Plane ingress manifest from
git history. Do not apply the new `k8s/app-manut-xyz-ingress.yaml` into `plane-ce`;
it targets the Manut namespace and service names.

Helm rollback for the old release:

```bash
helm history plane-app -n plane-ce
helm rollback plane-app REVISION -n plane-ce
kubectl rollout status deployment/plane-app-api-wl -n plane-ce
kubectl rollout status deployment/plane-app-web-wl -n plane-ce
```

Image-level rollback for old workloads:

```bash
kubectl set image deployment/plane-app-api-wl \
  plane-app-api=asia-southeast1-docker.pkg.dev/affine-495114/affine/plane-backend:preview-OLD_SHA \
  -n plane-ce
kubectl rollout status deployment/plane-app-api-wl -n plane-ce
```

Do not delete failed `manut-ce` resources until evidence is captured and rollback smoke
passes.
