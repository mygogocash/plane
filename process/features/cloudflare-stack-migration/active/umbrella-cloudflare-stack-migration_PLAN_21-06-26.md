# Manut Cloudflare Stack Migration - Umbrella Plan

**Date:** 21-06-26  
**Complexity:** Complex phase program  
**Status:** Phases 0-6 code guardrails in place; Phase 7 production Worker deploy/smoke/live-shadow evidence recorded; Phase 7/8 still blocked by final cutover evidence gates

## Program Goal Charter

North star:

- Move Manut to a Cloudflare-native runtime while preserving app contracts and
  keeping GKE/GCP as rollback until the Cloudflare stack is proven.

Hard stop conditions:

- Do not point `app.manut.xyz` to Cloudflare until Worker API, frontend routing,
  R2 uploads, D1 data checks, live service, and authenticated smoke all pass.
- Do not delete or mutate production GCP data resources until a backup/export and
  Cloudflare validation report exist.
- Do not run destructive D1/R2/GCP migration commands without an explicit
  rollback checkpoint.

Definition of done:

- Cloudflare serves `manut.xyz` and `app.manut.xyz`.
- `/api/instances/`, auth, workspaces, projects, work items, pages, uploads,
  live updates, admin, and public space paths pass smoke.
- Better Stack monitors are green for 7 days.
- Old GKE/GAR/GCS deploy path is archived after evidence capture.

## Phase Completion Rules

A phase is NOT complete until:

1. Integration test passes with adjacent systems.
2. Manual smoke path is documented.
3. Data/state verification evidence is captured.
4. Failure behavior and rollback are documented.
5. User confirmation is received for outward-facing changes.

Status meanings:

- PLANNED - Not started.
- CODE DONE - Written but not E2E tested.
- TESTING - Currently being tested.
- VERIFIED - Tested and confirmed working.
- BLOCKED - Has issues.

## Phase Sequence

1. Phase 0: Baseline and guardrails.
2. Phase 1: Cloudflare foundation.
3. Phase 2: Frontend and edge routing.
4. Phase 3: R2 upload migration.
5. Phase 4: D1 backend rewrite.
6. Phase 5: Queue, cron, cache, and live.
7. Phase 6: Cloudflare CI/CD.
8. Phase 7: Production cutover.
9. Phase 8: Decommission.

## Current Implementation Boundary

The current implementation adds:

- durable phase-program docs;
- a parallel Cloudflare Worker package;
- D1/R2/Queue/Durable Object binding scaffolding;
- non-destructive baseline, CI validation, and cutover readiness checks;
- deployed preview and production Workers on `workers.dev` with smoke evidence;
- live shadow validation against the production Worker diagnostic Durable
  Object routes.

It does not:

- move `app.manut.xyz`;
- migrate production data;
- disable GKE/GCP CI.

Phase 7 must not change production routing until
`pnpm --filter @manut/cloudflare cutover:readiness` reports ready with external
evidence for final D1 import validation, R2 manifest validation,
authenticated smoke, Better Stack green, and explicit operator approval.

## Touchpoints

- `apps/cloudflare`
- `.github/workflows/cloudflare-ci-cd.yml`
- `process/features/cloudflare-stack-migration`
- `docs/cloudflare-stack-migration.md`

## Public Contracts

- `manut.xyz` remains the landing page.
- `app.manut.xyz` remains the product origin.
- `/api/instances/` returns Manut instance metadata.
- Existing GKE deploy remains rollback during the migration.

## Verification Evidence

Each phase report must include:

- commands run;
- endpoint status;
- row/object counts where applicable;
- screenshots or logs for manual smoke;
- rollback status.

## Resume and Execution Handoff

Start each future phase by reading:

- this umbrella plan;
- the selected phase plan;
- `docs/gcp-manut-ops-handover.md`;
- `docs/cloudflare-stack-migration.md`;
- the latest report in `process/features/cloudflare-stack-migration/reports/`.
