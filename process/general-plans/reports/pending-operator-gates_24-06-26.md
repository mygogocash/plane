# Pending Operator Gates Report

Date: 2026-06-24
Checkout: `/Users/kunanonjarat/Developer/mygogocash-plane`

## Summary

Code-complete lanes advanced in this session cannot close the remaining umbrella plan
without operator credentials, production maintenance windows, or manual browser smoke.
This report lists the exact commands and artifacts still required.

## Cloudflare Phase 7 Cutover (BLOCKED: 4/17 selected checks)

Run readiness:

```bash
pnpm --silent --filter @manut/cloudflare cutover:readiness --json
pnpm --filter @manut/cloudflare cutover:prep --json
```

`cutover:prep` prints blocker commands and regenerates input templates (non-destructive).

| Gate                           | Owner                                 | Required action                                                                                            |
| ------------------------------ | ------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| D1 import validation           | Operator/DBA                          | Final Postgres delta import + `pnpm --filter @manut/cloudflare d1:validate-import` evidence                |
| Authenticated production smoke | Operator with prod creds              | Fill template, run `auth:smoke-report`, store under `process/features/cloudflare-stack-migration/reports/` |
| Better Stack monitors green    | Operator with `BETTERSTACK_API_TOKEN` | `pnpm --filter @manut/cloudflare betterstack:cutover-report` with `ok: true`                               |
| Operator cutover approval      | Product/ops approver                  | Complete `operator:approval-report` input + set `CUTOVER_APPROVED=true`                                    |

Evidence bundle dry-run:

```bash
pnpm --silent --filter @manut/cloudflare cutover:evidence -- --json --dry-run
```

## Workflows & Approvals (automated complete; manual smoke pending)

Automated integration completed in code:

- Project workflow rules hydrate on project entry (`PROJECT_WORKFLOWS` SWR).
- Board/list state changes route through `/state-transition/` when workflows are enabled.
- Approval-gated moves return 202 and refresh approvals without mutating state.
- Kanban headers show human-readable allowed target states.

Manual smoke still required on `https://app.manut.xyz`:

1. Enable workflows for a test project and define at least one gated transition.
2. Drag a work item to an illegal column → blocked with toast/error.
3. Drag to an approval-required column → approval banner appears; state unchanged until approved.
4. Approve/reject as approver → state moves or stays per rule.

## AI Parity (Phases D–E not started in code)

Completed through Phase C in backend/tests:

- Embeddings, semantic duplicate-check, Celery backfill, Cloudflare Workers AI provider.

Still open product slices (see `docs/plan/ai/tasks.md`):

- **Phase D:** `AISummary` model, summarize endpoints, context-assist endpoint, summary UI.
- **Phase E:** automation rules, intake triage, connectors, MCP server.

Manual smoke still required:

- Issue-create and inbox-create high-confidence duplicate override in a real browser session.

## Ops Rollout

Still operator-gated:

- Authenticated upload/download smoke on production.
- Teammate invite delivery verification.
- Better Stack API token for monitor gate (endpoint probes already pass).

## Recommended execution order

1. Run authenticated smoke with controlled credentials.
2. Complete Better Stack + operator approval artifacts.
3. Execute D1 final import validation during maintenance window.
4. Run workflow manual smoke checklist above.
5. Resume AI Phase D from `ai-parity-followup_PLAN_23-06-26.md` after Phase 3 manual smoke passes.
