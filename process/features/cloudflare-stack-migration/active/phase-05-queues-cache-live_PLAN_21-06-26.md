# Phase 5 - Queues, Cron, Cache, and Live

**Status:** CODE DONE for primitives; production replacement blocked

## Objective

Create Cloudflare-native primitives for async jobs, scheduled work, cache/locks,
and live room state before replacing Celery/RabbitMQ/Redis/Node live services.

## Scope

- Define Queue message envelopes for migration audit, upload audit, email
  dispatch, and import/export jobs.
- Add explicit failure behavior for unsupported or invalid job messages.
- Improve Durable Object live-room health/planned responses.
- Defer real collaboration WebSocket replacement until contract tests exist.

## Implementation Tasks

- Add job envelope validation and queue consumer helpers.
- Add tests for valid and invalid queue messages.
- Add Durable Object room metadata behavior tests.
- Add KV JSON cache helpers with explicit missing-binding and parse-failure
  behavior.
- Add Durable Object room lock acquire/release behavior for serialized
  coordination.
- Document Redis replacement decisions: KV for cache, Durable Objects for locks
  and strongly consistent room/session coordination.

## Tests

- `pnpm --filter @manut/cloudflare check`
- `pnpm --filter @manut/cloudflare test`
- Future: Queue retry/dead-letter tests and live WebSocket shadow tests.

## Rollback

Keep Celery/RabbitMQ/Redis/live Node service active until queue and Durable
Object behavior pass shadow tests.

## Done When

- Queue/live primitive tests pass.
- Failure modes are observable and not silent.
- Replacement mapping for each current async/cache/live use case is documented.

## Phase 5 Evidence

- Report: `process/features/cloudflare-stack-migration/reports/phase-05-queues-cache-live-evidence_21-06-26.md`
- Cache primitive: `apps/cloudflare/src/cache.ts`
- Lock primitive: `LiveRoomDurableObject` lock routes under `/locks/:key/acquire`
  and `/locks/:key/release`
- Production replacement status: blocked until shadow tests cover real Celery,
  Redis, RabbitMQ, and live WebSocket workloads.
