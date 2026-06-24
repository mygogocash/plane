export const CANONICAL_D1_IMPORT_VALIDATION_REPORT =
  "process/features/cloudflare-stack-migration/reports/phase-07-d1-import-validation_21-06-26.json";

export const D1_IMPORT_VALIDATION_RUNBOOK =
  "process/features/cloudflare-stack-migration/references/phase-07-d1-import-validation-runbook_24-06-26.md";

const DEFAULT_INPUTS = {
  sourceCounts: "<postgres-source-counts.json>",
  targetCounts: "<d1-target-counts.json>",
  relationships: "<d1-target-relationships.json>",
};

function present(value, fallback) {
  return typeof value === "string" && value.trim() !== "" ? value : fallback;
}

export function buildD1ImportValidationCommand({
  sourceCounts,
  targetCounts,
  relationships,
  out = CANONICAL_D1_IMPORT_VALIDATION_REPORT,
} = {}) {
  return [
    "pnpm --filter @manut/cloudflare d1:validate-import --",
    present(sourceCounts, DEFAULT_INPUTS.sourceCounts),
    present(targetCounts, DEFAULT_INPUTS.targetCounts),
    "--relationships",
    present(relationships, DEFAULT_INPUTS.relationships),
    "--out",
    present(out, CANONICAL_D1_IMPORT_VALIDATION_REPORT),
    "--json",
  ].join(" ");
}

export function buildD1ImportValidationRunbook({ sourceCounts, targetCounts, relationships } = {}) {
  const requiredInputs = {
    postgres_source_counts: present(sourceCounts, DEFAULT_INPUTS.sourceCounts),
    d1_target_counts: present(targetCounts, DEFAULT_INPUTS.targetCounts),
    d1_relationship_checks: present(relationships, DEFAULT_INPUTS.relationships),
  };

  return {
    readiness_blocker_id: "d1-import-validation",
    canonical_report: CANONICAL_D1_IMPORT_VALIDATION_REPORT,
    runbook: D1_IMPORT_VALIDATION_RUNBOOK,
    production_action_gate:
      "These tools only normalize and validate evidence. Run the production D1 import only after explicit operator approval.",
    required_inputs: requiredInputs,
    commands: {
      target_evidence:
        "pnpm --filter @manut/cloudflare d1:target-evidence -- --json --out <d1-target-snapshot.json> --counts-out <d1-target-counts.json> --relationships-out <d1-target-relationships.json>",
      validate_import: buildD1ImportValidationCommand({
        sourceCounts: requiredInputs.postgres_source_counts,
        targetCounts: requiredInputs.d1_target_counts,
        relationships: requiredInputs.d1_relationship_checks,
      }),
      readiness: "pnpm --silent --filter @manut/cloudflare cutover:readiness -- --json",
    },
  };
}

export function buildD1ImportValidationNextSteps({
  sourceRows = null,
  targetRows = null,
  missingTables = [],
  missingRelationships = [],
  hasRelationshipFailures = false,
  ok = false,
} = {}) {
  const steps = [];

  if (missingTables.length > 0) {
    steps.push(`Regenerate source and target counts with required table coverage: ${missingTables.join(", ")}.`);
  }

  if (sourceRows === null) {
    steps.push("Provide the Postgres source-count report for the same final import window.");
  } else if (sourceRows <= 0) {
    steps.push(
      "Regenerate Postgres source counts from the final import window; required source rows must be non-zero."
    );
  }

  if (targetRows === null) {
    steps.push("After explicit operator approval and import, collect D1 target counts and relationship evidence.");
  } else if (targetRows <= 0) {
    steps.push(
      "After the operator-approved D1 import, rerun D1 target evidence; required target rows must be non-zero."
    );
  }

  if (missingRelationships.length > 0) {
    steps.push(`Regenerate D1 relationship checks with required coverage: ${missingRelationships.join(", ")}.`);
  }

  if (hasRelationshipFailures) {
    steps.push("Resolve failed D1 relationship checks before writing canonical Phase 7 evidence.");
  }

  if (ok) {
    steps.push(`Write or keep the canonical D1 import validation report at ${CANONICAL_D1_IMPORT_VALIDATION_REPORT}.`);
  } else {
    steps.push(
      `Do not treat ${CANONICAL_D1_IMPORT_VALIDATION_REPORT} as ready until all validation errors are resolved.`
    );
  }

  steps.push("Re-run the cutover readiness command and confirm the d1-import-validation blocker changes to pass.");

  return steps;
}
