# Phase 4 D1 Backend Rewrite Evidence

Captured: 2026-06-21T08:58:00Z

## Scope Completed

- Added D1 shadow tables for the first read-only domain slice:
  - `workspaces`
  - `projects`
- Added `0002_shadow_core.sql` with active-row indexes matching the soft-delete
  uniqueness posture required by the Django models.
- Added Cloudflare-only diagnostic routes:
  - `GET /api/cloudflare/d1/workspaces`
  - `GET /api/cloudflare/d1/workspaces/:workspaceSlug/projects`
- Kept production `/api/v1/*` routes legacy-proxied.
- Updated migration status to report `active_phase: d1-backend-rewrite` and
  `d1_shadow_domains: ["workspaces", "projects"]`.
- Added `d1:inventory` and `d1:compare` package scripts.

## Route Behavior

| Condition                   | Behavior                                                           |
| --------------------------- | ------------------------------------------------------------------ |
| `MANUT_DB` missing          | JSON `503`, `D1_BINDING_MISSING`                                   |
| Workspace list with D1 rows | JSON `200`, `status: shadow`, `source: d1`, `cutover_ready: false` |
| Projects by workspace slug  | JSON `200`, scoped to active workspace slug                        |
| Unknown workspace slug      | JSON `404`, `D1_WORKSPACE_NOT_FOUND`                               |

## Verification Commands

```bash
pnpm --filter @manut/cloudflare test -- --run src/index.test.ts
pnpm --filter @manut/cloudflare d1:compare -- <synthetic-postgres-counts.json> <synthetic-d1-counts.json> --json
node apps/cloudflare/tools/django-model-inventory.mjs --root apps/api/plane --json
```

Inventory summary from the static scanner:

```json
{
  "modelClassCount": 121,
  "concreteModelClassCount": 114,
  "abstractModelClassCount": 7,
  "migrationFileCount": 138,
  "compatibilityConcernCounts": {
    "json-field": 55,
    "unique-together": 49,
    "partial-constraint": 49,
    "binary-field": 8,
    "many-to-many": 4,
    "postgres-specific": 5,
    "file-field": 2,
    "postgres-locking": 1,
    "transaction-semantics": 2
  }
}
```

Synthetic row-count comparison result:

```json
{
  "ok": true,
  "matchedTableCount": 2,
  "mismatchedTableCount": 0,
  "mismatches": []
}
```

## Cutover Status

Blocked. No production Cloud SQL export/import was run, no D1 production
migration was applied, and no user-facing API route was switched to D1. The next
operator action is to export/import a non-production or sampled dataset and
compare `workspaces` / `projects` row counts and relationships.

## Rollback

Do not route production traffic to the D1 shadow endpoints. If the schema or
shadow reads need to be removed from a preview Worker, revert this phase commit
or stop deploying the Cloudflare Worker package. GKE/Cloud SQL remains source of
truth.
