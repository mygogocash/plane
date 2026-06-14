# Executive Summary

Deploy a fresh Plane CE instance to Google Cloud project `affine-495114`
(`602860445793`) using GKE Autopilot in `asia-southeast1`. The first release is
a clean install of official Plane CE `v1.3.1` exposed over HTTP through a
temporary `sslip.io` host backed by a reserved regional IP.

# Business Goals

- Move the Plane production path from Railway instability to a managed Google
  Cloud baseline.
- Keep GoGoCash workspace setup reproducible and rollback-friendly within GCP.
- Preserve a clean path to later custom domain and TLS rollout.
- Keep invite email delivery enabled only after the previously exposed Resend
  key has been rotated.

# Technical Goals

- Provision GKE Autopilot cluster `plane-ce-gke` in `asia-southeast1`.
- Install Helm release `plane-app` in namespace `plane-ce`.
- Pin the Plane Helm chart deployment to official Plane CE images at `v1.3.1`.
- Use managed Cloud SQL PostgreSQL, Memorystore Redis, and Cloud Storage XML/S3
  interoperability.
- Use in-cluster RabbitMQ with GKE `standard-rwo` persistent storage.
- Install `ingress-nginx` with reserved regional IP `plane-ce-ip`.

# Requirements

- Enable required Google APIs for Kubernetes, Compute, Cloud SQL, Memorystore,
  Cloud Storage, IAM, Secret Manager, Service Networking, and Resource Manager.
- Configure private service access for managed database and Redis connectivity.
- Create Cloud SQL instance `plane-pg`, database `plane`, and user `plane`.
- Create Memorystore Redis instance `plane-redis`.
- Create Cloud Storage bucket `plane-affine-495114-uploads`.
- Create a dedicated storage service account and HMAC key for Plane document
  storage.
- Create Kubernetes secrets `plane-app-env`, `plane-live-env`,
  `plane-rabbitmq-env`, and `plane-doc-store`.
- Install `makeplane/plane-ce` with external Postgres, Redis, and object storage.
- Do not store or reuse the old Resend API key that was pasted in chat.

# Non-Goals

- No Railway data migration after the GKE instance is accepted as canonical.
- No patched fork image in the first GKE release.
- No custom domain, DNS cutover, or managed TLS in this release.
- No Railway rollback path after the Railway project is decommissioned.

# Architecture

- Public browser traffic terminates at a regional Google Cloud Load Balancer
  created by `ingress-nginx`.
- `sslip.io` resolves the temporary smoke host
  `plane.<reserved-ip>.sslip.io` to the reserved IP.
- Plane web, API, worker, beat, and live components run in GKE Autopilot.
- PostgreSQL runs in Cloud SQL over private IP.
- Redis runs in Memorystore over private service access.
- RabbitMQ runs in-cluster with a persistent volume.
- Uploads use Cloud Storage XML/S3-compatible access through dedicated HMAC
  credentials.

# Data Models

- Plane application schemas are created by the official Helm install jobs and
  application migrations.
- No custom application database schema changes are introduced by this rollout.
- Persistent data lives in Cloud SQL, Memorystore, Cloud Storage, and RabbitMQ
  PVCs.

# API Contracts

- `GET /api/instances/` must return HTTP `200`.
- Browser routes such as `/`, `/god-mode/`, and workspace routes must be served
  by the Plane web service.
- API routes `/api/*` and `/auth/*` must be served by the Plane API service.
- `/uploads` must not be handled by the Plane web catch-all. With external Cloud
  Storage it may return an object-storage style `403` or `404`, but not Plane
  HTML.

# Security

- Generated `SECRET_KEY`, `LIVE_SERVER_SECRET_KEY`, Cloud SQL password,
  RabbitMQ password, and Cloud Storage HMAC secret must never be committed.
- SMTP is configured through Secret Manager and has been verified with Plane's
  built-in test email. Do not print or commit the Resend key value.
- IAM scope for the storage service account is limited to object administration
  on `plane-affine-495114-uploads`.
- Use private IP for Cloud SQL and Memorystore.
- Keep the first endpoint HTTP-only only for smoke testing; do not move the
  production domain until TLS is configured.

# Edge Cases

- Existing GCP APIs or resources may already exist and should be treated
  idempotently.
- GCP auth may require interactive re-login before resource creation.
- Autopilot may mutate or reject chart resource requests.
- Cloud Storage XML/S3 compatibility may require CORS or signed URL adjustments
  after the first upload smoke test.
- Helm install jobs may fail if external secret keys are incomplete.
- The official Helm chart separates app, live, RabbitMQ, and document-store
  secrets.
- `sslip.io` smoke host changes if the reserved IP is deleted and recreated.
- Resend invite emails will fail until a rotated key and verified sender are set.

# Testing Strategy

- Verify tooling and auth with `gcloud projects describe affine-495114`.
- Verify cluster readiness with `kubectl get nodes`, `kubectl get pods -n
plane-ce`, and `kubectl get pvc -n plane-ce`.
- Verify Helm with `helm status plane-app -n plane-ce` and completed install
  jobs.
- Verify public smoke with:
  - `curl -i http://plane.<IP>.sslip.io/`
  - `curl -fsS http://plane.<IP>.sslip.io/api/instances/`
  - `curl -i http://plane.<IP>.sslip.io/uploads`
- Verify app smoke through `/god-mode/`, workspace creation, project creation,
  cover upload, attachment upload, and invite email delivery after SMTP is set.
- Verify persistence by restarting Plane pods and confirming workspace, project,
  and uploaded media still load.

# Rollback Plan

- Helm rollback: `helm rollback plane-app <revision> -n plane-ce`.
- Fresh install removal: `helm uninstall plane-app -n plane-ce`.
- Ingress rollback: remove or leave the temporary `sslip.io` host unused.
- DNS rollback after decommission: point `app.manut.xyz` only to a validated
  GCP rollback endpoint or maintenance page. Railway is no longer an available
  rollback target.
- Data rollback for this fresh install: delete test-only records through the app
  or retain Cloud SQL/Cloud Storage for investigation before teardown.

# Milestones

## Milestone 1 - Tooling And Auth

- Objective: confirm local tools and active GCP credentials.
- Business impact: prevents partial billable resource creation with a broken
  operator session.
- Technical scope: `gcloud`, `kubectl`, `helm`, project config, auth validation.
- Dependencies: Google account access to `affine-495114`.
- Risks: expired token blocks all live operations.
- Success metrics: `gcloud projects describe affine-495114` succeeds.
- Rollback strategy: no cloud resources created in this milestone.

## Milestone 2 - GCP Foundation

- Objective: enable APIs, private service access, and reserved IP.
- Business impact: creates the minimum foundation for managed services and
  public smoke testing.
- Technical scope: service APIs, VPC peering allocation, regional static IP.
- Dependencies: project IAM permissions.
- Risks: duplicate resource names, API enablement delay.
- Success metrics: APIs enabled and `plane-ce-ip` allocated.
- Rollback strategy: release unused IP and remove private service access only if
  no dependent resources exist.

## Milestone 3 - Managed Services

- Objective: provision Cloud SQL, Memorystore, and Cloud Storage credentials.
- Business impact: stores Plane data outside ephemeral app pods.
- Technical scope: PostgreSQL, Redis, upload bucket, storage service account,
  HMAC credentials.
- Dependencies: private service access and IAM permissions.
- Risks: secret leakage, private network mismatch, HMAC key only shown once.
- Success metrics: private SQL and Redis addresses available; bucket and HMAC
  key created.
- Rollback strategy: delete service account/HMAC key and managed services only
  after confirming no needed data remains.

## Milestone 4 - GKE And Ingress

- Objective: create Autopilot cluster and ingress controller.
- Business impact: provides the compute and public routing layer.
- Technical scope: `plane-ce-gke`, kube credentials, `ingress-nginx`.
- Dependencies: enabled GKE and Compute APIs.
- Risks: quota, regional capacity, load balancer provisioning delay.
- Success metrics: nodes are ready and ingress service has the reserved IP.
- Rollback strategy: uninstall ingress controller or delete the new cluster.

## Milestone 5 - Plane Install

- Objective: install official Plane CE with external services.
- Business impact: delivers the usable Plane instance for smoke setup.
- Technical scope: namespace, Kubernetes secrets, Helm values, Helm release.
- Dependencies: all managed services and ingress.
- Risks: chart secret mismatch, migrations failing, upload backend mismatch.
- Success metrics: all Plane pods ready and `/api/instances/` returns `200`.
- Rollback strategy: `helm rollback` or `helm uninstall`.

# Epics

## Epic 1 - Cloud Foundation

- User value: operators can deploy Plane on managed GCP primitives.
- Technical requirements: APIs, private networking, reserved IP, GKE.
- Security considerations: least-privilege IAM and private managed services.
- Edge cases: already-existing APIs/resources and regional quotas.
- Data flow: no app data until managed services are created.
- API contracts: GCP control plane calls must complete successfully.
- Testing strategy: `gcloud describe/list` checks after each resource group.

## Epic 2 - Plane Runtime

- User value: admins can configure and use a fresh Plane instance.
- Technical requirements: Helm release, secrets, ingress, migrations, pods.
- Security considerations: no committed secrets; SMTP key must be rotated.
- Edge cases: upload CORS, RabbitMQ PVC scheduling, app route catch-all.
- Data flow: app pods to Cloud SQL, Memorystore, RabbitMQ, and Cloud Storage.
- API contracts: `/`, `/api/instances/`, `/god-mode/`, and uploads smoke.
- Testing strategy: command smoke plus browser app smoke.

# User Stories

- As a GoGoCash admin, I want a fresh Plane instance on GKE so Railway startup
  instability does not block workspace setup.
- As an operator, I want managed database, cache, and storage services so pod
  restarts do not delete application data.
- As an operator, I want a temporary `sslip.io` smoke host so I can verify GKE
  before moving production DNS.
- As a teammate invite recipient, I want email invites sent from a rotated
  Resend key so invitation delivery is reliable and secure.

# Tasks

## Task 1 - Validate Tooling

- Objective: ensure local command-line tools and auth are ready.
- Scope: local machine only.
- Files: `spec.md`.
- Dependencies: Google account login.
- Risk Tier: R2.
- Acceptance Criteria: `gcloud`, `kubectl`, and `helm` are available.
- Tests: `gcloud projects describe affine-495114`.
- Rollback: no-op.
- Assigned Model: GPT-5.5 xhigh.
- Assigned Agent: primary.

## Task 2 - Provision GCP Foundation

- Objective: enable services and reserve networking primitives.
- Scope: `affine-495114` project.
- Files: none.
- Dependencies: Task 1.
- Risk Tier: R1.
- Acceptance Criteria: required APIs enabled, private service access configured,
  and `plane-ce-ip` allocated.
- Tests: `gcloud services list`, `gcloud compute addresses describe`.
- Rollback: delete unused address and dependent resources if needed.
- Assigned Model: GPT-5.5 xhigh.
- Assigned Agent: primary.

## Task 3 - Provision Managed Data Services

- Objective: create Cloud SQL, Redis, and Cloud Storage upload backend.
- Scope: `asia-southeast1`.
- Files: none.
- Dependencies: Task 2.
- Risk Tier: R1.
- Acceptance Criteria: SQL private IP, Redis host, bucket, service account, and
  HMAC credentials available.
- Tests: `gcloud sql instances describe`, `gcloud redis instances describe`,
  `gcloud storage buckets describe`.
- Rollback: delete test-only services after preserving evidence if install
  fails.
- Assigned Model: GPT-5.5 xhigh.
- Assigned Agent: primary.

## Task 4 - Install GKE Runtime

- Objective: create cluster and ingress.
- Scope: GKE Autopilot and `ingress-nginx`.
- Files: temporary untracked Helm values only.
- Dependencies: Tasks 2 and 3.
- Risk Tier: R1.
- Acceptance Criteria: cluster ready and ingress service uses reserved IP.
- Tests: `kubectl get nodes`, `helm status ingress-nginx -n ingress-nginx`.
- Rollback: uninstall ingress or delete cluster.
- Assigned Model: GPT-5.5 xhigh.
- Assigned Agent: primary.

## Task 5 - Install Plane

- Objective: deploy Plane CE release `plane-app`.
- Scope: namespace `plane-ce`.
- Files: temporary untracked Helm values only.
- Dependencies: Tasks 3 and 4.
- Risk Tier: R1.
- Acceptance Criteria: Plane pods ready, Helm status deployed, HTTP/API smoke
  passes, and generated credentials are not present in Helm values.
- Tests: Helm, kubectl, curl, and browser smoke checks.
- Rollback: `helm rollback` or `helm uninstall`.
- Assigned Model: GPT-5.5 xhigh.
- Assigned Agent: primary.

# Acceptance Criteria

- `plane-ce-gke` exists and is reachable by `kubectl`.
- `plane-app` Helm release is deployed in namespace `plane-ce`.
- Plane CE image version is pinned to `v1.3.1`.
- `GET /api/instances/` returns `200` on the `sslip.io` host.
- `/uploads` does not return Plane web HTML.
- A fresh instance can complete `/god-mode/` setup.
- Workspace `GoGoCash` and project `GCP-SMOKE-PROJECT` can be created.
- Cover image and attachment uploads persist through pod restarts.
- Invite delivery is verified only after a rotated Resend key is stored.
- Railway project `grateful-celebration` is deleted after GCP smoke passes.

# Execution Evidence

- Date: 2026-06-05.
- GCP project: `affine-495114` / `602860445793`.
- Region: `asia-southeast1`.
- Cluster: `plane-ce-gke`.
- Namespace and Helm release: `plane-ce` / `plane-app`.
- Plane chart: `makeplane/plane-ce` chart `1.5.1`, app version `v1.3.1`.
- Smoke host: `http://plane.34.143.231.225.sslip.io/`.
- Reserved IP: `34.143.231.225`.
- Helm status: `deployed`, revision `1`.
- Pod status after API/web restart: admin, API, beat worker, live, RabbitMQ,
  space, web, and worker all `Running` with zero restarts.
- RabbitMQ PVC: `pvc-plane-app-rabbitmq-vol-plane-app-rabbitmq-wl-0`, `Bound`,
  storage class `standard-rwo`.
- Initial `GET /api/instances/` after GKE setup: `setup=true`,
  `instance_name=GoGoCash`, `version=1.3.1`, `smtp=false` before the Resend
  SMTP update below.
- `/uploads`: `403 application/xml; charset=UTF-8`, confirming Cloud Storage is
  reached instead of the Plane web catch-all.
- Admin password is stored in Secret Manager as `plane-admin-password`; do not
  print or commit it.
- Workspace created: `GoGoCash`, slug `gogocash`, id
  `c0c5b239-912f-4397-966d-7d6c5b40f415`.
- Project name validation finding: exact name `GCP-SMOKE-PROJECT` returned
  `400 PROJECT_NAME_CANNOT_CONTAIN_SPECIAL_CHARACTERS`; Plane rejected the
  hyphenated project name.
- Project smoke fallback created: `GCP SMOKE PROJECT`, identifier `GCPSMOKE`,
  id `a4854c94-4008-4e98-8e0c-48e8b001068e`.
- Cover upload: asset `52e04fb9-0615-42a6-a532-691067c01398`, fetch check
  returned `200 image/jpeg`.
- Work item smoke: `GCP SMOKE WORK ITEM`, id
  `e164d295-3e64-4726-b85d-767d4a549865`, sequence `1`.
- Attachment upload: asset `91726d8f-3e78-4ee3-a073-4813c8bc6193`,
  `is_uploaded=true`, fetch check returned `200 image/jpeg`.
- Persistence smoke: after restarting `plane-app-api-wl` and
  `plane-app-web-wl`, the workspace, project, cover image, work item, and
  attachment were still readable.
- Resend SMTP update: stored the rotated Resend key in Secret Manager as
  `plane-resend-api-key`, patched Kubernetes secret `plane-app-env`, and
  restarted `plane-app-api-wl`, `plane-app-worker-wl`, and
  `plane-app-beat-worker-wl`.
- SMTP verification: `GET /api/instances/` now reports `smtp=true`; the live API
  pod has `EMAIL_HOST=smtp.resend.com`, `EMAIL_HOST_USER=resend`,
  `EMAIL_PORT=587`, `EMAIL_USE_TLS=1`, `EMAIL_USE_SSL=0`, and
  `EMAIL_FROM=GoGoCash <no-reply@gogocash.co>`.
- Email smoke: `python manage.py test_email fronk.kunanon@gogocash.co`
  completed with `Email successfully sent`.
- Custom app subdomain preparation: added
  `k8s/app-manut-xyz-ingress.yaml` with supplemental nginx ingresses for
  `app.manut.xyz`, preserving the existing `sslip.io` Helm-managed ingresses.
- Custom app subdomain smoke: forced-host checks against
  `34.143.231.225` returned `200` for `http://app.manut.xyz/` and
  `http://app.manut.xyz/api/instances/`; `/uploads` returned
  `403 application/xml`, confirming the Cloud Storage upload route is matched
  instead of Plane web HTML.
- Runtime URL update: patched `plane-app-app-vars` to
  `WEB_URL=http://app.manut.xyz` and added both `http://app.manut.xyz` and
  `https://app.manut.xyz` to `CORS_ALLOWED_ORIGINS`, then restarted the API,
  worker, and beat worker deployments successfully.
- DNS update: added Cloudflare DNS record `A app 34.143.231.225` for
  `app.manut.xyz` with proxy status `DNS only` and TTL `Auto`; existing apex
  `manut.xyz` records were left unchanged.
- DNS verification: Cloudflare authoritative nameservers, `1.1.1.1`,
  `8.8.8.8`, and Cloudflare DNS-over-HTTPS all resolved `app.manut.xyz` to
  `34.143.231.225`. This Mac's system resolver still had a temporary cached
  pre-change miss immediately after creation.
- Auth verification on `app.manut.xyz`: the admin account
  `fronk.kunanon@gogocash.co` exists, is active, has a usable password, and the
  generated password stored in Secret Manager as `plane-admin-password` matches
  the account. Chrome was signed in successfully on `app.manut.xyz`; API logs
  showed `POST /auth/sign-in/ 302` followed by authenticated
  `GET /api/users/me/ 200` responses. The profile name was corrected to
  `first_name=Fronk`, `last_name=Jarat` after onboarding.
- Workspace logo upload fix on `app.manut.xyz`: root cause was Cloud Storage
  bucket CORS only allowing `http://plane.34.143.231.225.sslip.io`; browser
  uploads from `http://app.manut.xyz` could create Plane file-asset rows but
  could not complete the direct GCS upload, so the final
  `PATCH /api/assets/v2/workspaces/gogocash/<asset_id>/` never ran.
- Upload bucket remediation: added `k8s/plane-uploads-cors.json` and applied it
  with `gcloud storage buckets update gs://plane-affine-495114-uploads
--cors-file=k8s/plane-uploads-cors.json`. Allowed origins now include both
  HTTP and HTTPS forms of the `sslip.io` smoke host and `app.manut.xyz`.
- CORS verification: `OPTIONS https://storage.googleapis.com/plane-affine-495114-uploads/`
  with `Origin: http://app.manut.xyz` returned `200` and
  `access-control-allow-origin: http://app.manut.xyz`.
- Logo upload verification: authenticated smoke completed CSRF login, created a
  `WORKSPACE_LOGO` asset, direct-uploaded the GoGoCash avatar to Cloud Storage
  with `Origin: http://app.manut.xyz`, finalized the asset with
  `PATCH .../api/assets/v2/workspaces/gogocash/<asset_id>/ 204`, and confirmed
  `GET /api/users/me/workspaces/` returns a `logo_url`.
- Logo read verification: `GET /api/assets/v2/static/<asset_id>/` redirects to
  Cloud Storage and the followed request returned `200 image/png`; Chrome reload
  now shows the GoGoCash logo and the settings action changed from
  `Upload logo` to `Edit logo`.
- Cleanup: marked the three pre-fix unuploaded `WORKSPACE_LOGO` asset rows as
  deleted; they were created during the failed CORS attempts and had
  `is_uploaded=false`.
- Temporary local DNS remediation: this Mac's router DNS continued returning
  NXDOMAIN after public resolvers had propagated the new Cloudflare record, so
  `Ethernet` and `Wi-Fi` were temporarily set to `1.1.1.1 8.8.8.8`. Rollback
  commands are `networksetup -setdnsservers Ethernet Empty` and
  `networksetup -setdnsservers Wi-Fi Empty`.
- TLS rollout: `https://app.manut.xyz/api/instances/` returned `200`,
  `https://app.manut.xyz/uploads` returned `403 application/xml; charset=UTF-8`,
  and Kubernetes certificate `app-manut-xyz-tls` was `Ready=True`.
- Railway decommission: project `grateful-celebration`
  (`3656b0db-526d-4a75-980b-6296c1f7eb1d`) was deleted after GCP smoke passed.
  The deleted project contained Plane, Postgres, Redis, MinIO, and RabbitMQ in
  the `production` environment. Railway reported deletion marker
  `2026-06-08T08:54:40.379Z`; this workspace was then unlinked from Railway.
- Source cleanup: removed Railway-only deploy artifacts from the `preview`
  branch working tree: `railway.json`,
  `.github/workflows/railway-aio-ghcr.yml`,
  `deployments/aio/community/Dockerfile.railway`, and
  `docs/railway-plane.md`.
- CI/CD cleanup follow-up: `.github/workflows/ci-cd.yml` is now the GCP release
  path. Pushes to `preview` build split component images in Artifact Registry,
  run the backend migrator as a Kubernetes Job, roll API/worker/beat/web/admin/
  live/space deployments in namespace `plane-ce`, and smoke
  `https://app.manut.xyz/api/instances/`. No Railway deploy hook or Railway AIO
  image build remains in the active workflow.
- GCP CI/CD feature rollout verification: commit
  `0b80aadd9610d2446f835d06c872c4283b6ddd83` deployed through `Plane CI/CD` run
  `27065884344`. CodeQL run `27065883913` also passed. The live GKE workloads
  API, worker, beat-worker, web, admin, live, and space were verified `1/1`
  ready on Artifact Registry tag `preview-0b80aadd9610`, and
  `GET https://app.manut.xyz/api/instances/` returns `200`.
- CI cleanup: removed `.github/workflows/codeql.yml` because GitHub default
  CodeQL setup is already enabled for this repository. Keeping both the advanced
  workflow and default setup caused the push-triggered CodeQL run to fail with
  `CodeQL analyses from advanced configurations cannot be processed when the
default setup is enabled`, while the dynamic default CodeQL run succeeded.
- Ops hardening: enabled Cloud SQL PITR for `plane-pg`, kept
  `transactionLogRetentionDays=7`, enabled Cloud SQL deletion protection, and
  enabled backup retention after delete. The patch completed successfully and
  triggered a successful backup-volume operation.
- Upload bucket hardening: added `docs/gcs-plane-uploads-lifecycle.json` and
  applied it to `plane-affine-495114-uploads`. The lifecycle policy aborts
  incomplete multipart uploads after 7 days and does not delete completed Plane
  uploads. The bucket still has 7-day soft delete and the app/GCS CORS policy.
- Ops handover: added `docs/gcp-plane-ops-handover.md` with current state,
  deploy/reconcile commands, smoke checks, rollback, recovery, DNS, and secret
  handling guidance. Tracked live-supporting Kubernetes/GCS artifacts were added
  under `k8s/`.

# Remaining Gaps

- Teammate invite delivery has not been resent from the GKE workspace yet; SMTP
  itself is configured and verified with Plane's built-in test email.
- The hyphenated project-name criterion is not met by Plane `v1.3.1` validation;
  either adjust the test naming convention or patch/verify project-name
  validation before requiring names like `GCP-SMOKE-PROJECT`.
