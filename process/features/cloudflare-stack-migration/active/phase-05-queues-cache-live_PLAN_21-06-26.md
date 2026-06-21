# Phase 5 - Queues, Cron, Cache, and Live

**Status:** IN PROGRESS for primitives, production replacement blocked

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
