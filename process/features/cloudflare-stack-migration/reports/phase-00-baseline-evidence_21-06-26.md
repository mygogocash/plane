# Phase 0 Baseline Evidence

Captured: 2026-06-21T07:06:44.484Z

Command:

```bash
pnpm --filter @manut/cloudflare baseline
```

## DNS

| Host            | A                                | AAAA                                                     | CNAME |
| --------------- | -------------------------------- | -------------------------------------------------------- | ----- |
| `manut.xyz`     | `172.67.222.66`, `104.21.38.110` | `2606:4700:3031::6815:266e`, `2606:4700:3037::ac43:de42` | none  |
| `app.manut.xyz` | `34.143.231.225`                 | none                                                     | none  |

## Endpoint Smoke

| Target       | URL                                    | Status | Content type                     | Server       | Cloudflare ray         | Notes                                                                                                                 |
| ------------ | -------------------------------------- | ------ | -------------------------------- | ------------ | ---------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Landing      | `https://manut.xyz/`                   | `200`  | `text/html; charset=utf-8`       | `cloudflare` | `a0f12c1debe787fc-SIN` | HTML contains `Manut`                                                                                                 |
| App instance | `https://app.manut.xyz/api/instances/` | `200`  | `application/json`               | none         | none                   | Current GKE app instance API remains reachable                                                                        |
| Uploads      | `https://app.manut.xyz/uploads`        | `403`  | `application/xml; charset=UTF-8` | none         | none                   | GCS anonymous caller denied response; preserve this route for authenticated/object-specific paths during R2 migration |

## Rollback Anchor

- App DNS rollback target: `34.143.231.225`
- GKE namespace: `manut-ce`
- Helm release: `manut-app`
- Current upload bucket: `plane-affine-495114-uploads`

## Interpretation

This confirms the parallel migration starting point:

- `manut.xyz` is already Cloudflare-fronted.
- `app.manut.xyz` is still on GKE and can remain the rollback target while Cloudflare Workers/Pages are built in parallel.
- `/api/instances/` currently returns HTTP `200`, so the Worker contract test uses that route as the first compatibility anchor.
- `/uploads` is backed by GCS and currently denies anonymous directory access; Phase 3 must preserve object-level compatibility instead of exposing bucket listing.
