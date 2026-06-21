# Phase 5 Queues, Cache, and Live Evidence

Captured: 2026-06-21T09:01:00Z

## Scope Completed

- Added retry coverage for supported queue jobs when a handler fails.
- Added KV JSON cache primitives:
  - `getJsonCache`
  - `putJsonCache`
  - `deleteJsonCache`
- Added explicit cache miss/failure reasons:
  - `KV_BINDING_MISSING`
  - `CACHE_MISS`
  - `CACHE_PARSE_FAILED`
- Added Durable Object room lock acquire/release routes:
  - `POST /live/{room}/locks/{lockKey}/acquire`
  - `POST /live/{room}/locks/{lockKey}/release`
- Updated migration status to report `active_phase: queues-cron-cache-live`,
  `cache_target: kv`, and `lock_target: durable-objects`.

## Verification Commands

```bash
pnpm --filter @manut/cloudflare check
pnpm --filter @manut/cloudflare test
pnpm --filter @manut/cloudflare exec wrangler deploy --dry-run --env="" --outdir /tmp/manut-cloudflare-phase5-dry-run
pnpm --filter @manut/cloudflare baseline
```

Result:

- TypeScript check passed.
- 6 test files passed.
- 46 tests passed.
- Wrangler dry-run passed, upload size `265.16 KiB`, gzip `55.04 KiB`.
- Baseline confirmed `app.manut.xyz` still resolves to GKE IP `34.143.231.225`;
  `/api/instances/` is HTTP `200`; `/uploads` remains the current GCS-backed
  HTTP `403` response.

## Replacement Mapping

| Current dependency                | Cloudflare target             | Current status                                             |
| --------------------------------- | ----------------------------- | ---------------------------------------------------------- |
| RabbitMQ/Celery dispatch          | Cloudflare Queues             | Envelope validation and retry/failure behavior implemented |
| Celery beat                       | Scheduled Workers / Workflows | Planned                                                    |
| Redis cache                       | KV                            | JSON helper implemented                                    |
| Redis locks / strong coordination | Durable Objects               | Room lock primitive implemented                            |
| Node live WebSocket service       | Durable Objects WebSockets    | Planned, returns explicit not-implemented response         |

## Cutover Status

Blocked. Production Celery/RabbitMQ/Redis/live Node services remain active. No
production queue, cache, lock, or WebSocket traffic was moved to Cloudflare.

## Rollback

Do not route production async/cache/live traffic to the Cloudflare primitives.
If a preview Worker exposes incorrect behavior, revert this phase commit or stop
deploying the Cloudflare Worker package.
