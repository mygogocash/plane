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

kubectl apply -f k8s/app-manut-xyz-ingress.yaml
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
4. Set GKE deployment images for `manut-app-*` workloads.
5. Wait for rollout status and smoke `https://app.manut.xyz/api/instances/`.

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
