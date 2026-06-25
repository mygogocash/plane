# Phase 8 GCP Decommission — Executed

**Date:** 2026-06-25  
**Operator:** Kunanon Jarat (via agent)  
**Project:** `affine-495114`  
**Decision:** Full GCP cutoff; Cloudflare is the only production runtime.

## Cloudflare Worker changes

| Action                                                                                       | Status                                                |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Removed `LEGACY_GKE_RESOLVE_OVERRIDE` from `wrangler.toml` + `apps/cloudflare/wrangler.toml` | done                                                  |
| Deleted production secret `LEGACY_GKE_ORIGIN`                                                | done                                                  |
| Set `R2_UPLOADS_READ_ENABLED=true` on production Worker                                      | done                                                  |
| Deployed `manut-app` production Worker                                                       | done (version `848ad8b7-5c80-4ddc-9fc0-aa5541616135`) |

Post-cutover probes (`app.manut.xyz`):

| Route                              | HTTP | Notes                                                               |
| ---------------------------------- | ---- | ------------------------------------------------------------------- |
| `/api/instances/`                  | 200  | D1-backed Worker                                                    |
| `/api/cloudflare/migration-status` | 200  | `legacy_proxy_configured: false`, `worker_native_api_enabled: true` |
| `/auth/`                           | 502  | No native auth handlers yet; legacy proxy removed                   |
| `/` (app shell)                    | 502  | Frontend not yet served from Workers Assets/Pages                   |

## GCP resources deleted

| Resource          | Name                                                                                                                                             | Status                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| GKE cluster       | `plane-ce-gke`                                                                                                                                   | deleted (prior session)                                                      |
| Cloud Run         | `manut`, `manut-staging`, `manut-pg18-rehearsal`, `turbo-cache`                                                                                  | deleted                                                                      |
| Compute VM        | `affine-vm`                                                                                                                                      | deleted                                                                      |
| Memorystore Redis | `plane-redis`, `affine-redis`                                                                                                                    | deleted                                                                      |
| Static IPs        | `plane-ce-ip`, `affine-ip`                                                                                                                       | released                                                                     |
| Cloud SQL         | `affine-pg`, `manut-pg18-rehearsal-20260527001726`, `plane-pg`, `manut-pg18-prod`                                                                | deleted (`plane-pg` / `manut-pg18-prod` required `--no-deletion-protection`) |
| GCS buckets       | `plane-affine-495114-uploads`, `gogocash-affine-blobs`, `plane-turbo-cache-affine-495114`, `affine-495114_cloudbuild`, `gogocash-affine-backups` | deleted                                                                      |
| Artifact Registry | `affine` (asia-southeast1)                                                                                                                       | deleted                                                                      |

Final inventory (`gcloud sql instances list`, `gcloud storage buckets list`, `gcloud run services list`, `gcloud redis instances list`, `gcloud compute instances list`, `gcloud container clusters list`): **0 items** each.

## Repo / CI updates

- `.github/workflows/ci-cd.yml` — GCP image publish no longer runs on `preview` push; Better Stack sync runs after web/api CI instead of GKE deploy
- `README.md` — deployment section points to Cloudflare

## Retained backups (off-GCP)

Per `phase-08-safe-cutoff-prep_25-06-26.md`:

- D1 export: `reports/backups/d1-manut-prod-final-25-06-26.sql`
- GCS mirror (local): `reports/backups/gcs-plane-affine-495114-uploads-25-06-26/`

## What still blocks a fully working app

1. **Web UI** — deploy `apps/web` static client to Workers Assets or Cloudflare Pages and route app-shell through the Worker
2. **Auth** — implement Worker-native `/auth/*` (magic login) without legacy session bridge to GKE
3. **API parity** — expand `WORKER_NATIVE_API_ENABLED` route registry beyond current read/write slice
4. **GitHub** — remove obsolete `GCP_*` / WIF repository variables and secrets when convenient

## Rollback

GCP runtime rollback is **not** available without full reprovision from backups and a new Cloudflare → GKE cutover. D1/R2 on Cloudflare remain the canonical production data plane.
