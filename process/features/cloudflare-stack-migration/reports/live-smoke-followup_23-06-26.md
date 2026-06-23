# Live Smoke Follow-up

Date: 2026-06-23
Target: `https://app.manut.xyz`

## Summary

Public TLS and public HTML routes are reachable. The first sampled public
instance config request was slow, but the latency did not reproduce on three
follow-up checks. Anonymous `/uploads/` listing returns HTTP 403, which matches
prior Cloudflare migration evidence that bare upload listing denial is expected;
authenticated upload/download still needs smoke evidence.

## Commands

```bash
curl -fsS -o /tmp/plane-root.headers -D - https://app.manut.xyz/
curl -fsS -o /tmp/plane-instances.json -w 'status=%{http_code}\ntime_total=%{time_total}\n' https://app.manut.xyz/api/instances/
curl -fsS -o /tmp/plane-uploads.txt -w 'status=%{http_code}\ntime_total=%{time_total}\n' https://app.manut.xyz/uploads/
curl -fsS -o /tmp/plane-godmode.headers -D - https://app.manut.xyz/god-mode/
for i in 1 2 3; do curl -fsS -o /tmp/plane-instances-$i.json -w "run=$i status=%{http_code} time_total=%{time_total}\n" --max-time 45 https://app.manut.xyz/api/instances/ || echo "run=$i failed"; done
```

## Results

| Check             | Result                           |
| ----------------- | -------------------------------- |
| `/`               | HTTP 200                         |
| `/god-mode/`      | HTTP 200                         |
| `/api/instances/` | HTTP 200, `time_total=35.772631` |
| `/uploads/`       | HTTP 403                         |

Follow-up `/api/instances/` checks:

| Run | Result                          |
| --- | ------------------------------- |
| 1   | HTTP 200, `time_total=0.973468` |
| 2   | HTTP 200, `time_total=0.125407` |
| 3   | HTTP 200, `time_total=0.126283` |

## Instance Config Signals

`/api/instances/` returned JSON containing:

- `current_version`: `1.3.1`
- `latest_version`: `v1.3.1`
- `edition`: `PLANE_COMMUNITY`
- `is_smtp_configured`: `true`
- `has_llm_configured`: `true`
- `is_email_password_enabled`: `true`
- `is_magic_login_enabled`: `true`
- `enable_signup`: `false`
- `is_self_managed`: `true`

## Follow-up Required

- Treat the initial slow `/api/instances/` response as a cold-cache/cold-path
  signal unless it reproduces in later monitoring.
- Run controlled authenticated smoke through
  `apps/cloudflare/tools/authenticated-smoke-report.mjs`.
- Required authenticated smoke check IDs:
  `login`, `session-refresh`, `workspace-sidebar`, `project-list`,
  `work-item-create`, `work-item-edit`, `work-item-delete`,
  `upload-attachment`, `live-update`, `admin-route`, `public-space-route`.
- The report tool can generate the input template with:
  `node apps/cloudflare/tools/authenticated-smoke-report.mjs --template --json`.
- Record the authenticated smoke evidence in this feature report folder.

## 2026-06-23 Authenticated Smoke Template Validation

- Confirmed `process/features/cloudflare-stack-migration/references/phase-07-authenticated-smoke-input-template_22-06-26.json`
  contains all required authenticated smoke check IDs:
  `login`, `session-refresh`, `workspace-sidebar`, `project-list`,
  `work-item-create`, `work-item-edit`, `work-item-delete`,
  `upload-attachment`, `live-update`, `admin-route`, and
  `public-space-route`.
- Ran `pnpm --filter @manut/cloudflare auth:smoke-report -- --input process/features/cloudflare-stack-migration/references/phase-07-authenticated-smoke-input-template_22-06-26.json --json`.
  The command correctly exited non-zero because the template is blank:
  `ok:false`, `total:11`, `passed:0`, `failed:11`, first validation error
  `Authenticated smoke check login is not passing.`
- Remaining blocker is operator-captured authenticated smoke evidence, not a
  missing report template or missing check IDs.

## 2026-06-23 Revalidation Note

Status: no new authenticated upload/download evidence was captured in this
session. The Cloudflare upload/download lane remains operator-gated; local
verification cannot replace the missing authenticated smoke report.

Evidence:

- `pnpm --filter @manut/cloudflare check` passed with `tsc --noEmit`.
- Active continuation checks also passed `git diff --check`.

Remaining blocker: run `apps/cloudflare/tools/authenticated-smoke-report.mjs`
with operator-filled credentials/evidence, then attach the produced report.

## 2026-06-23 Cloudflare Workers AI Live Smoke Update

The Cloudflare Workers AI GLM smoke is no longer blocked on credentials. A live
call to `@cf/zai-org/glm-5.2` returned HTTP 200.

Evidence:

```bash
node apps/cloudflare/tools/workers-ai-smoke.mjs --json \
  --out process/general-plans/reports/cloudflare-workers-ai-smoke-2026-06-23.json
```

- `WORKERS_AI_SMOKE_EXIT:0`
- Report: `process/general-plans/reports/cloudflare-workers-ai-smoke-2026-06-23.json`
- Report summary: `ok:true`, `checks[1].id:"workers-ai-run"`,
  `checks[1].status:200`

The Cloudflare authenticated upload/download smoke remains operator-gated and
separate from this Workers AI model smoke.

## 2026-06-23 `app.manut.xyz` Legacy Proxy Loop

Status: open external Cloudflare/GKE origin action. The production Worker is
reachable, but browser app routes are falling into the legacy proxy path with a
self-origin guard:

```json
{
  "error": "LEGACY_GKE_ORIGIN_MATCHES_WORKER_ORIGIN",
  "message": "Refusing to proxy to the same origin as the Worker request."
}
```

Evidence:

```bash
curl https://app.manut.xyz/
curl https://app.manut.xyz/api/instances/
curl --resolve app.manut.xyz:443:34.143.231.225 https://app.manut.xyz/
```

- `https://app.manut.xyz/` returns the self-origin legacy proxy error.
- `https://app.manut.xyz/api/instances/` returns HTTP 200 from the Cloudflare
  Worker path.
- The previous GKE/load-balancer IP `34.143.231.225` still returns the app
  shell when reached as `app.manut.xyz`.
- The GKE certificate currently has SAN `DNS:app.manut.xyz` only, so a new
  legacy-origin hostname must also be configured on the GKE ingress/certificate
  before it can be used as `LEGACY_GKE_ORIGIN`.
- The provided Cloudflare API token cannot read Worker secrets/settings, so the
  live variable was not changed programmatically.

Immediate restore option:

- Disable the Worker/custom-domain route for `app.manut.xyz` and point the DNS
  `app` record back to `34.143.231.225` while keeping it proxied. This restores
  the existing GKE app route until cutover is ready.

Cutover-safe option:

- Add a distinct legacy origin hostname, for example `legacy-gke.manut.xyz`,
  to GKE ingress and certificate.
- Add a Cloudflare DNS record for that hostname to `34.143.231.225`.
- Set Worker variable `LEGACY_GKE_ORIGIN=https://legacy-gke.manut.xyz`.
- Do not set `LEGACY_GKE_ORIGIN=https://app.manut.xyz`; that creates the
  self-proxy loop shown above.

## 2026-06-23 `www.manut.xyz` DNS Follow-Up

Status: open external DNS action. The apex domain `manut.xyz` resolves and
returns HTTP 200, but `www.manut.xyz` has no public DNS record.

Evidence:

```bash
dig +short www.manut.xyz A
dig +short www.manut.xyz CNAME
curl --max-time 10 https://www.manut.xyz/
```

- `dig` returned no `A` record.
- `dig` returned no `CNAME` record.
- `curl` failed with `Could not resolve host: www.manut.xyz`.
- Cloudflare API token check returned no accessible `manut.xyz` zone for this
  token, so the record was not created programmatically.

Required dashboard action:

- Add DNS record: `CNAME`, name `www`, target `manut.pages.dev`, proxy enabled,
  TTL auto.
- Optional canonicalization: add a Redirect Rule from `www.manut.xyz/*` to
  `https://manut.xyz/$1` if production should use apex-only URLs.

## 2026-06-23 Cloudflare Observability Config Update

Status: handled. The Cloudflare dashboard warning to persist observability
settings across deployments is now reflected in `apps/cloudflare/wrangler.toml`.

Changes:

- Added explicit `[observability]` sampling.
- Added persistent `[observability.logs]` with `invocation_logs = true`.
- Added persistent `[observability.traces]`.
- Added coverage in `apps/cloudflare/src/wrangler-config.test.ts`.

Evidence:

```bash
pnpm --filter @manut/cloudflare test -- src/wrangler-config.test.ts
pnpm --filter @manut/cloudflare exec wrangler deploy --dry-run --env="" \
  --outdir /tmp/manut-cloudflare-worker-observability-dry-run
```

- Cloudflare package test suite: `26` files, `221` tests passed,
  `WRANGLER_CONFIG_TEST_EXIT:0`.
- Wrangler dry-run accepted the config and exited with `--dry-run: exiting now`.
