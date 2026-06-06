# GCP Plane Ops Handover

## Current State

- Production app: `https://app.manut.xyz`
- GCP project: `affine-495114`
- Region: `asia-southeast1`
- GKE context: `gke_affine-495114_asia-southeast1_plane-ce-gke`
- Namespace: `plane-ce`
- Helm release: `plane-app`
- Helm chart/app: `plane-ce-1.5.1` / `1.3.1`
- Static IP: `34.143.231.225`
- DNS: Cloudflare `A app 34.143.231.225`, DNS-only
- Feature rollout source commit: `0b80aadd9610d2446f835d06c872c4283b6ddd83`
- Feature rollout image tag: `preview-0b80aadd9610`
- Feature rollout CI/CD run: `Plane CI/CD` `27065884344`, success
- Feature rollout CodeQL run: `27065883913`, success

The live runtime is the GKE Helm deployment, not Railway. Railway project
`grateful-celebration` has been deleted and must not be used as rollback.

## Release Verification Evidence

- API, worker, beat-worker, web, admin, live, and space deployments are `1/1`
  verified ready on `preview-0b80aadd9610`.
- The CI/CD migration job `plane-app-api-migrate-0b80aadd9610` completed.
- `GET https://app.manut.xyz/api/instances/` returns `200`.
- `HEAD https://app.manut.xyz` returns `200` with the app served over HTTPS.
- The active workflow has no Railway deploy hook or Railway AIO image build.
- Docs-only commits may create newer immutable tags; use the verification
  commands below to confirm the currently running tag.

## Managed Services

- Cloud SQL Postgres: `plane-pg`
  - Private IP: `10.47.1.9`
  - Tier: `db-custom-1-3840`
  - Disk: `10 GB` `PD_SSD`, auto-resize enabled
  - Availability: `ZONAL`
  - Backups: enabled at `18:00 UTC`
  - Retention: `7` backups
  - PITR: enabled with `7` transaction-log days
  - Deletion protection: enabled
  - Retain backups on delete: enabled
- Memorystore Redis: `plane-redis`
  - Host: `10.47.0.11`
  - Port: `6379`
  - Tier: `BASIC`
  - Version: `REDIS_7_0`
- Cloud Storage uploads bucket: `plane-affine-495114-uploads`
  - Location: `ASIA-SOUTHEAST1`
  - Storage class: `STANDARD`
  - Uniform bucket-level access: enabled
  - Soft delete: enabled for `7` days
  - Lifecycle: abort incomplete multipart uploads after `7` days
  - No lifecycle rule deletes completed Plane uploads.

## Secrets

Secrets live in Secret Manager. Do not print or commit secret values.

- `plane-admin-password`
- `plane-db-password`
- `plane-gcs-hmac-access-key`
- `plane-gcs-hmac-secret-key`
- `plane-live-server-secret-key`
- `plane-rabbitmq-password`
- `plane-resend-api-key`
- `plane-secret-key`

Kubernetes secrets are generated from these values and live in namespace
`plane-ce`. Rotate in Secret Manager first, then patch the relevant Kubernetes
secret and restart affected Plane deployments.

## Tracked Artifacts

- `k8s/app-manut-xyz-ingress.yaml`: `app.manut.xyz` and `/uploads` ingress.
- `k8s/cert-manager-letsencrypt.yaml`: `letsencrypt-prod` issuer and app cert.
- `k8s/github-actions-deployer-rbac.yaml`: namespace-scoped Kubernetes deploy
  permissions for the GitHub Actions GCP deployer.
- `k8s/plane-uploads-cors.json`: Cloud Storage CORS policy.
- `docs/gcs-plane-uploads-lifecycle.json`: non-destructive bucket lifecycle.
- `docs/gke-plane-ce-spec-2026-06-05.md`: rollout evidence and remaining gaps.

## Access

```bash
gcloud config set project affine-495114
gcloud container clusters get-credentials plane-ce-gke \
  --region asia-southeast1 \
  --project affine-495114
kubectl config current-context
```

Expected context:

```txt
gke_affine-495114_asia-southeast1_plane-ce-gke
```

## Deploy And Reconcile

Apply tracked ingress and certificate resources:

```bash
kubectl apply -f k8s/cert-manager-letsencrypt.yaml
kubectl apply -f k8s/app-manut-xyz-ingress.yaml
kubectl get certificate,ingress -n plane-ce
```

Apply upload bucket CORS:

```bash
gcloud storage buckets update gs://plane-affine-495114-uploads \
  --cors-file=k8s/plane-uploads-cors.json
```

Apply upload bucket lifecycle:

```bash
gcloud storage buckets update gs://plane-affine-495114-uploads \
  --lifecycle-file=docs/gcs-plane-uploads-lifecycle.json
```

Restart Plane runtime after config or secret changes:

```bash
kubectl rollout restart deployment/plane-app-api-wl -n plane-ce
kubectl rollout restart deployment/plane-app-web-wl -n plane-ce
kubectl rollout restart deployment/plane-app-worker-wl -n plane-ce
kubectl rollout restart deployment/plane-app-beat-worker-wl -n plane-ce
kubectl rollout status deployment/plane-app-api-wl -n plane-ce
kubectl rollout status deployment/plane-app-web-wl -n plane-ce
```

Pushes to `preview` now deploy through `.github/workflows/ci-cd.yml`:

1. Run web and API checks.
2. Publish fork-built component images to Artifact Registry:
   `asia-southeast1-docker.pkg.dev/affine-495114/affine`.
3. Run the backend migrator image as a Kubernetes Job.
4. Set GKE deployment images for API, worker, beat-worker, web, admin, live,
   and space.
5. Wait for rollout status and smoke `https://app.manut.xyz/api/instances/`.

GitHub Actions authenticates with Workload Identity Federation. Required
repository variables:

- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_SERVICE_ACCOUNT`

Defaulted repository variables may be overridden when the GCP topology changes:

- `GCP_APP_URL`
- `GCP_ARTIFACT_REPOSITORY`
- `GCP_PROJECT_ID`
- `GCP_REGION`
- `GKE_CLUSTER`
- `GKE_NAMESPACE`

The deployer Kubernetes permissions are tracked in
`k8s/github-actions-deployer-rbac.yaml`.

## Smoke Checks

Public unauthenticated checks:

```bash
curl -fsS https://app.manut.xyz/api/instances/ >/tmp/plane-instance.json
curl -i https://app.manut.xyz/uploads
kubectl get pods,ingress,certificate -n plane-ce
helm list -n plane-ce
```

Expected:

- `/api/instances/` returns `200`.
- `/uploads` returns Cloud Storage XML, usually `403`, not Plane HTML.
- All Plane pods are `Running`.
- Certificate `app-manut-xyz-tls` is `Ready=True`.
- Helm release `plane-app` is `deployed`.

Authenticated smoke:

- Sign in at `https://app.manut.xyz/gogocash/`.
- Verify workspace sidebar, projects, recents, and logo render.
- Create/edit/delete a work item in a non-critical project.
- Upload a workspace logo, project cover, and work-item attachment.
- Resend a teammate invite and confirm delivery.
- Restart API/web pods and confirm workspace data and uploads persist.

## Backup And Recovery

List Cloud SQL backups:

```bash
gcloud sql backups list \
  --instance=plane-pg \
  --project=affine-495114
```

Restore a backup to an existing instance:

```bash
gcloud sql backups restore BACKUP_ID \
  --restore-instance=plane-pg \
  --backup-instance=plane-pg \
  --project=affine-495114
```

For safer recovery, clone to a new instance from a point in time:

```bash
gcloud sql instances clone plane-pg plane-pg-restore-YYYYMMDDHHMM \
  --point-in-time 'YYYY-MM-DDTHH:MM:SSZ' \
  --project=affine-495114
```

Restore a soft-deleted upload object within the 7-day soft-delete window:

```bash
gcloud storage restore gs://plane-affine-495114-uploads/PATH/TO/OBJECT
```

## Rollback

Application rollback:

```bash
helm history plane-app -n plane-ce
helm rollback plane-app REVISION -n plane-ce
kubectl rollout status deployment/plane-app-api-wl -n plane-ce
kubectl rollout status deployment/plane-app-web-wl -n plane-ce
```

Image-level rollback:

```bash
kubectl set image deployment/plane-app-api-wl \
  plane-app-api=asia-southeast1-docker.pkg.dev/affine-495114/affine/plane-backend:preview-OLD_SHA \
  -n plane-ce
kubectl rollout status deployment/plane-app-api-wl -n plane-ce
```

Repeat for `plane-app-worker-wl`, `plane-app-beat-worker-wl`,
`plane-app-web-wl`, `plane-app-admin-wl`, `plane-app-live-wl`, and
`plane-app-space-wl` with the matching component image.

Ingress rollback:

```bash
kubectl rollout undo deployment/ingress-nginx-controller -n ingress-nginx
kubectl delete -f k8s/app-manut-xyz-ingress.yaml
```

DNS rollback:

- Keep Cloudflare DNS-only unless the GKE ingress is intentionally replaced.
- Point `app.manut.xyz` only to a validated GCP rollback endpoint or maintenance
  page.
- Do not point back to Railway; that project has been deleted.

Database rollback:

- Prefer PITR clone first.
- Restore over `plane-pg` only after taking a fresh backup and confirming the
  app is in maintenance mode.

## Verification Commands

```bash
gcloud sql instances describe plane-pg \
  --project=affine-495114 \
  --format='yaml(name,state,settings.backupConfiguration.enabled,settings.backupConfiguration.pointInTimeRecoveryEnabled,settings.deletionProtectionEnabled,settings.retainBackupsOnDelete)'

gcloud storage buckets describe gs://plane-affine-495114-uploads \
  --format='yaml(name,soft_delete_policy,lifecycle_config,cors_config)'

gcloud redis instances describe plane-redis \
  --region=asia-southeast1 \
  --project=affine-495114 \
  --format='yaml(name,state,host,port,tier,memorySizeGb,redisVersion)'
```
