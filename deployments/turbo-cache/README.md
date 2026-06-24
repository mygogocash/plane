# Turbo Remote Cache (self-hosted on Cloud Run)

Speeds up CI by letting `pnpm turbo run build` reuse prior build outputs across
runs instead of rebuilding every package from scratch inside each Docker image.

- **Server:** [`ducktors/turborepo-remote-cache`](https://github.com/ducktors/turborepo-remote-cache) on Cloud Run.
- **Storage:** a dedicated GCS bucket. Artifacts are keyed by a content hash of
  their inputs, so a stale cache can never produce a wrong build — worst case is
  a redundant rebuild.
- **Auth:** a single 256-bit bearer token (`TURBO_TOKEN`). The server fails
  closed — it refuses to boot without a token, returns `400` on a missing
  `Authorization` header and `401` on a wrong token.

## Resources (project `affine-495114`, region `asia-southeast1`)

| Resource | Name |
|---|---|
| Cloud Run service | `turbo-cache` |
| Service URL | `https://turbo-cache-idid7yszzq-as.a.run.app` |
| GCS bucket | `gs://plane-turbo-cache-affine-495114` (uniform access, public-access-prevention, 30-day object lifecycle) |
| Runtime service account | `turbo-cache@affine-495114.iam.gserviceaccount.com` |
| Secret (the token) | `turbo-cache-token` (Secret Manager) |
| Pinned image | `docker.io/ducktors/turborepo-remote-cache:2.11.2` |

### Security model

- Public ingress, **token-gated at the application layer** (same posture as
  Vercel's own hosted Turbo cache). CI runs on GitHub-hosted runners whose egress
  IPs are a large, rotating Azure pool, so IP-allowlisting was deliberately not
  used — the 256-bit token is the control.
- The runtime SA reaches GCS via **Application Default Credentials** (the Cloud
  Run metadata server) — there is **no exported service-account key** anywhere.
  The server's GCS adapter falls back to `new Storage()` (ADC) whenever the
  `GCS_*` credential envs are unset, so we leave them unset.
- Least privilege: the SA holds `roles/storage.objectAdmin` on **this bucket
  only** and `roles/secretmanager.secretAccessor` on **this secret only**.
- Cached artifacts are compiled JS build outputs, not secrets (app secrets are
  injected at runtime, never at build).

## How CI consumes it

Set once on the GitHub repo (`mygogocash/plane`):

- Variable `TURBO_API` = the Cloud Run service URL
- Variable `TURBO_TEAM` = `plane` (becomes the bucket path prefix `plane/<hash>`)
- Secret `TURBO_TOKEN` = the value of `turbo-cache-token`

`.github/workflows/ci-cd.yml` passes `TURBO_API`/`TURBO_TEAM` as build-args and
`TURBO_TOKEN` as a **BuildKit secret** (`secrets: turbo_token=...`, never a
build-arg — secrets must not land in image layers). The four JS Dockerfiles wrap
the build with:

```dockerfile
RUN --mount=type=secret,id=turbo_token \
  TURBO_API="$TURBO_API" TURBO_TEAM="$TURBO_TEAM" \
  TURBO_TOKEN="$(cat /run/secrets/turbo_token 2>/dev/null || true)" \
  pnpm turbo run build --filter=<app>
```

If the token/cache is absent or unreachable, turbo logs a warning and builds
locally — the `|| true` keeps the build correct, just uncached.

## Recreate from scratch

```bash
PROJECT=affine-495114; REGION=asia-southeast1
BUCKET=plane-turbo-cache-affine-495114
SA=turbo-cache@affine-495114.iam.gserviceaccount.com
SECRET=turbo-cache-token

gcloud services enable run.googleapis.com secretmanager.googleapis.com storage.googleapis.com --project=$PROJECT

gcloud storage buckets create gs://$BUCKET --project=$PROJECT --location=$REGION \
  --uniform-bucket-level-access --public-access-prevention
printf '{"rule":[{"action":{"type":"Delete"},"condition":{"age":30}}]}' > /tmp/turbo-lifecycle.json
gcloud storage buckets update gs://$BUCKET --lifecycle-file=/tmp/turbo-lifecycle.json --project=$PROJECT

gcloud iam service-accounts create turbo-cache --project=$PROJECT \
  --display-name="Turbo remote cache (Cloud Run runtime)"

# IMPORTANT: strip the trailing newline `openssl` emits, or clients (which send
# the token newline-stripped) will mismatch the stored value and get 401.
openssl rand -hex 32 | tr -d '\n' | gcloud secrets create $SECRET --project=$PROJECT \
  --replication-policy=automatic --data-file=-

gcloud storage buckets add-iam-policy-binding gs://$BUCKET \
  --member="serviceAccount:$SA" --role="roles/storage.objectAdmin" --project=$PROJECT
gcloud secrets add-iam-policy-binding $SECRET \
  --member="serviceAccount:$SA" --role="roles/secretmanager.secretAccessor" --project=$PROJECT

gcloud run deploy turbo-cache --project=$PROJECT --region=$REGION \
  --image=docker.io/ducktors/turborepo-remote-cache:2.11.2 \
  --service-account=$SA --port=3000 \
  --set-env-vars=STORAGE_PROVIDER=google-cloud-storage,STORAGE_PATH=$BUCKET \
  --set-secrets=TURBO_TOKEN=$SECRET:latest \
  --min-instances=0 --max-instances=3 --memory=512Mi --allow-unauthenticated

# Wire CI (token piped straight from Secret Manager — never printed):
URL=$(gcloud run services describe turbo-cache --project=$PROJECT --region=$REGION --format='value(status.url)')
gh variable set TURBO_API  --repo mygogocash/plane --body "$URL"
gh variable set TURBO_TEAM --repo mygogocash/plane --body "plane"
gcloud secrets versions access latest --secret=$SECRET --project=$PROJECT | gh secret set TURBO_TOKEN --repo mygogocash/plane
```

## Verify

```bash
URL=https://turbo-cache-idid7yszzq-as.a.run.app
TOKEN=$(gcloud secrets versions access latest --secret=turbo-cache-token --project=affine-495114)
curl -s -o /dev/null -w '%{http_code}\n' "$URL/v8/artifacts/status"                                   # 200
curl -s -o /dev/null -w '%{http_code}\n' "$URL/v8/artifacts/x?slug=plane"                              # 400 (no auth)
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer bad" "$URL/v8/artifacts/x?slug=plane"   # 401
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $TOKEN" "$URL/v8/artifacts/x?slug=plane" # 404 (auth ok, absent)
```

## Rotate the token

```bash
openssl rand -hex 32 | tr -d '\n' | gcloud secrets versions add turbo-cache-token --data-file=- --project=affine-495114
gcloud run services update turbo-cache --update-secrets=TURBO_TOKEN=turbo-cache-token:latest \
  --region=asia-southeast1 --project=affine-495114   # roll a revision so :latest re-resolves
gcloud secrets versions access latest --secret=turbo-cache-token --project=affine-495114 | gh secret set TURBO_TOKEN --repo mygogocash/plane
```

## Tear down (fully additive — removing it just disables caching)

```bash
gcloud run services delete turbo-cache --region=asia-southeast1 --project=affine-495114 --quiet
gcloud storage rm --recursive gs://plane-turbo-cache-affine-495114 --project=affine-495114
gcloud secrets delete turbo-cache-token --project=affine-495114 --quiet
gcloud iam service-accounts delete turbo-cache@affine-495114.iam.gserviceaccount.com --project=affine-495114 --quiet
# then remove TURBO_API / TURBO_TEAM / TURBO_TOKEN from the repo (gh variable/secret delete)
```
