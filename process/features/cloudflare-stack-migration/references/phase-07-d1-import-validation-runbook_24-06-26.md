# Phase 7 D1 Import Validation Runbook

Canonical blocker: `d1-import-validation`

Canonical readiness evidence:
`process/features/cloudflare-stack-migration/reports/phase-07-d1-import-validation_21-06-26.json`

This lane is evidence-only. The tools in `apps/cloudflare/tools/` normalize source
counts, collect read-only D1 target counts and relationship checks, and build the
canonical validation report. They do not perform the production D1 import.

## Gate

Do not run the production import from this runbook. The import remains an explicit
operator action outside these tools. Produce the canonical report only after:

- the operator approves the final D1 import window
- Postgres source counts cover the final import scope
- D1 target evidence is collected after the approved import
- required source rows and required target rows are both non-zero
- all required relationship checks are present and have zero orphan rows

## Inputs

- Postgres source counts report from `d1:source-counts`
- D1 target count evidence from `d1:target-evidence`
- D1 relationship evidence from `d1:target-evidence`
- Canonical output path above

The current pre-import target snapshot has `required_scope_target_rows: 0`; that is
not sufficient to clear readiness.

## Procedure

1. Generate or refresh the SQL manifest for the operator packet:

   ```bash
   pnpm --filter @manut/cloudflare d1:validation-queries -- --json \
     --out process/features/cloudflare-stack-migration/reports/phase-07-d1-validation-query-manifest_22-06-26.json
   ```

2. Normalize final Postgres source counts after the import window is frozen:

   ```bash
   pnpm --filter @manut/cloudflare d1:source-counts -- --json \
     --input <psql-counts.json> \
     --source final-postgres-import-window \
     --out <postgres-source-counts.json>
   ```

3. After explicit operator approval and the production import, collect read-only
   D1 target evidence:

   ```bash
   pnpm --filter @manut/cloudflare d1:target-evidence -- --json \
     --database <d1-database-name> \
     --out <d1-target-snapshot.json> \
     --counts-out <d1-target-counts.json> \
     --relationships-out <d1-target-relationships.json>
   ```

4. Build the canonical Phase 7 validation report:

   ```bash
   pnpm --filter @manut/cloudflare d1:validate-import -- \
     <postgres-source-counts.json> \
     <d1-target-counts.json> \
     --relationships <d1-target-relationships.json> \
     --out process/features/cloudflare-stack-migration/reports/phase-07-d1-import-validation_21-06-26.json \
     --json
   ```

5. Verify the blocker state:

   ```bash
   pnpm --silent --filter @manut/cloudflare cutover:readiness -- --json
   ```

The `d1-import-validation` check should pass only when the canonical report is
present, `ok: true`, required source and target rows are non-zero, and relationship
failures are zero.
