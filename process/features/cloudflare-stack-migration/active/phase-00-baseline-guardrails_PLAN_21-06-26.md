# Phase 0 - Baseline and Guardrails

**Status:** CODE DONE for local tooling, verification pending

## Objective

Capture current production truth and lock rollback requirements before any
Cloudflare runtime cutover work touches production traffic.

## Scope

- Add baseline capture tooling.
- Record expected production endpoints and DNS.
- Define rollback gates for app, uploads, and database.

## Implementation Tasks

- Add `apps/cloudflare/scripts/capture-baseline.mjs`.
- Capture `manut.xyz`, `app.manut.xyz/api/instances/`, `app.manut.xyz/uploads`,
  and DNS resolution.
- Store future baseline reports under
  `process/features/cloudflare-stack-migration/reports/`.

## Tests

- Run `pnpm --filter @manut/cloudflare baseline`.
- Verify JSON contains endpoint status, response server headers, and DNS records.

## Rollback

No runtime change is made in this phase. If evidence capture fails, keep GKE/GCP
state unchanged and mark the phase BLOCKED.

## Done When

- Baseline command runs successfully.
- Report includes current GKE/GCP and Cloudflare landing state.
- User approves moving to Phase 1 provisioning.
