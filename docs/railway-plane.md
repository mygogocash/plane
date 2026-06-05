# Railway Plane Deployment Notes

These notes cover the Railway all-in-one Plane deployment used for GoGoCash.

## Services

The Railway template runs:

- Plane (`makeplane/plane-aio-community:stable`)
- Postgres
- Redis
- RabbitMQ
- MinIO

## Required Public URLs

Set these on the `Plane` service:

```bash
WEB_URL=https://<your-plane-domain>
CORS_ALLOWED_ORIGINS=https://<your-plane-domain>
```

## Browser Uploads With MinIO

Plane signs upload URLs from `AWS_S3_ENDPOINT_URL`. On Railway, browser clients cannot reach Railway private service hostnames, so `AWS_S3_ENDPOINT_URL` must be a public URL and the proxy must route `/uploads*` to MinIO.

For the current Railway deployment:

```bash
AWS_S3_ENDPOINT_URL=https://<your-plane-domain>
USE_MINIO=1
MINIO_ENDPOINT_SSL=0
MINIO_PROXY_ENDPOINT=minio.railway.internal:9000
```

The Plane service image must include a Caddy/proxy rule equivalent to:

```caddyfile
handle_path /uploads* {
  reverse_proxy {$MINIO_PROXY_ENDPOINT:minio:9000}
}
```

This repository's Railway AIO Dockerfile uses `apps/proxy/Caddyfile.aio.ce`, which includes that `/uploads` route.

## GitHub to Railway Source Deploy

The `preview` branch includes:

- `railway.json`, which tells Railway to build `deployments/aio/community/Dockerfile.railway`.
- `.github/workflows/railway-aio-ghcr.yml`, which builds patched component images and a patched AIO image in GitHub Container Registry.

Recommended Railway flow:

1. Keep the service connected to `mygogocash/plane` branch `preview`.
2. Turn on `Wait for CI`.
3. Wait until the `Railway AIO GHCR Image` workflow succeeds.
4. Redeploy the latest `preview` commit in Railway.

If GHCR packages are private, either make the generated packages public or configure Railway registry credentials for `ghcr.io`.

### Upload Verification

```bash
curl -i https://<your-plane-domain>/uploads
```

Expected result: MinIO XML response, usually `403`. If the response is Plane HTML, uploads are routed to the web catch-all and cover uploads will fail.

## SMTP Invites With Resend

Workspace invites are stored in Plane even when outbound email is not configured. For invites to reach inboxes, configure SMTP.

Invites created before SMTP was configured remain pending, but Plane does not automatically send them later. After SMTP is fixed, resend the pending invitation from workspace member settings, or remove and recreate the invite if running an older image without the resend action.

When SMTP is managed through Railway environment variables, set:

```bash
SKIP_ENV_VAR=0
ENABLE_SMTP=1
EMAIL_HOST=smtp.resend.com
EMAIL_PORT=587
EMAIL_USE_TLS=1
EMAIL_USE_SSL=0
EMAIL_HOST_USER=resend
EMAIL_HOST_PASSWORD=<resend-api-key>
EMAIL_FROM="GoGoCash <no-reply@verified-domain.example>"
```

Security notes:

- Store `EMAIL_HOST_PASSWORD` as a Railway secret.
- Do not commit API keys.
- `EMAIL_FROM` must use a sender/domain verified in Resend.
- Rotate any API key pasted into chat or logs after delivery is confirmed.

### SMTP Verification

```bash
curl -fsS https://<your-plane-domain>/api/instances/ | jq '.config.is_smtp_configured'
```

Expected result after redeploy: `true`.

Then send Plane's built-in credential test from God Mode or the instance API:

```bash
POST /api/instances/email-credentials-check/
{"receiver_email":"recipient@example.com"}
```

Expected result: `200` with `Email successfully sent.`

## Rollback

SMTP rollback through Railway UI:

1. Open the `Plane` service.
2. Go to `Variables`.
3. Delete or restore:
   - `SKIP_ENV_VAR`
   - `ENABLE_SMTP`
   - `EMAIL_HOST`
   - `EMAIL_PORT`
   - `EMAIL_USE_TLS`
   - `EMAIL_USE_SSL`
   - `EMAIL_HOST_USER`
   - `EMAIL_HOST_PASSWORD`
   - `EMAIL_FROM`
4. Redeploy the service.

Upload proxy rollback:

1. Restore the previous Plane service start command or image.
2. Redeploy.
3. Re-run `curl -i https://<your-plane-domain>/uploads`.

Rolling back the upload proxy can reintroduce failed cover uploads if `/uploads` no longer reaches MinIO.
