# Phase 3 - R2 Upload Migration

**Status:** IN PROGRESS for compatibility handler, data movement blocked

## Objective

Build the R2 upload compatibility path while preserving current GCS-backed
behavior until object counts and checksums are validated.

## Scope

- Add standalone `/uploads/*` R2 object read helpers.
- Preserve anonymous directory-list denial for bare `/uploads`.
- Prepare checksum/count validation for migration from
  `plane-affine-495114-uploads` to `manut-uploads-prod`.
- Do not backfill or delete objects during this phase without explicit operator
  approval.

## Implementation Tasks

- Add R2 GET/HEAD helper with safe response headers.
- Add fake-bucket tests for missing binding, missing object, and successful
  object reads.
- Document GCS-to-R2 validation requirements in the phase report after the first
  dry run.

## Tests

- `pnpm --filter @manut/cloudflare check`
- `pnpm --filter @manut/cloudflare test`
- Future: R2 object count and checksum comparison against exported GCS manifest.

## Rollback

Keep `/uploads/*` routed to GKE/GCS until R2 validation passes. If R2 handler
fails, leave the Worker route disabled and continue serving uploads from GCS.

## Done When

- Handler tests pass.
- R2 bucket names and CORS requirements are documented.
- GCS and R2 manifests match for a non-production dry-run sample.
