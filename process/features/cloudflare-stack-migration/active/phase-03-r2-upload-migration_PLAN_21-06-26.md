# Phase 3 - R2 Upload Migration

**Status:** CODE DONE for opt-in compatibility handler and manifest comparator; data movement blocked

## Objective

Build the R2 upload compatibility path while preserving current GCS-backed
behavior until object counts and checksums are validated.

## Scope

- Add standalone `/uploads/*` R2 object read helpers.
- Preserve anonymous directory-list denial for bare `/uploads`.
- Keep R2 upload reads behind `R2_UPLOADS_READ_ENABLED=true`; default routing
  remains legacy GKE/GCS.
- Prepare checksum/count validation for migration from
  `plane-affine-495114-uploads` to `manut-uploads-prod`.
- Do not backfill or delete objects during this phase without explicit operator
  approval.

## Implementation Tasks

- Add R2 GET/HEAD helper with safe response headers.
- Add fake-bucket tests for missing binding, missing object, and successful
  object reads.
- Add a file-based GCS/R2 upload manifest comparator for dry-run validation.
- Document GCS-to-R2 validation requirements in the phase report after the first
  dry run.

## Tests

- `pnpm --filter @manut/cloudflare check`
- `pnpm --filter @manut/cloudflare test`
- `pnpm --filter @manut/cloudflare uploads:compare -- <gcs-manifest.json> <r2-manifest.json>`
- Future: R2 object count and checksum comparison against exported GCS manifest.

## Rollback

Keep `/uploads/*` routed to GKE/GCS until R2 validation passes. If R2 handler
fails, leave the Worker route disabled and continue serving uploads from GCS.

## Done When

- Handler tests pass.
- R2 bucket names and CORS requirements are documented.
- GCS and R2 manifests match for a non-production dry-run sample.

## Phase 3 Evidence

- Report: `process/features/cloudflare-stack-migration/reports/phase-03-r2-upload-migration-evidence_21-06-26.md`
- Opt-in flag: `R2_UPLOADS_READ_ENABLED=true`
- Production cutover status: blocked until real GCS and R2 manifests match.
