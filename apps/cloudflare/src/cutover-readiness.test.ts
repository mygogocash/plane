import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

const REQUIRED_AUTHENTICATED_SMOKE_IDS = [
  "login",
  "session-refresh",
  "workspace-sidebar",
  "project-list",
  "work-item-create",
  "work-item-edit",
  "work-item-delete",
  "upload-attachment",
  "live-update",
  "admin-route",
  "public-space-route",
];

const REQUIRED_SEVEN_GREEN_DAYS_IDS = [
  "betterstack-monitors",
  "cloudflare-worker-logs",
  "d1-backup-export",
  "r2-backup-export",
  "rollback-retention",
];

function runReadiness(root: string, env: NodeJS.ProcessEnv = {}) {
  try {
    const stdout = execFileSync("node", ["tools/cutover-readiness.mjs", "--json", "--root", root], {
      cwd: path.resolve(__dirname, ".."),
      encoding: "utf8",
      env: {
        ...process.env,
        ...env,
      },
    });

    return JSON.parse(stdout);
  } catch (error) {
    const stdout = (error as { stdout?: string }).stdout ?? "";
    return JSON.parse(stdout);
  }
}

describe("cutover readiness evidence gate", () => {
  it("exposes selected checks separately from the full audit list", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-cutover-gate-"));

    const report = runReadiness(root);

    expect(report.checks.some((item: { phase: string }) => item.phase === "phase-08")).toBe(true);
    expect(report.selected_checks.every((item: { phase: string }) => item.phase !== "phase-08")).toBe(true);
    expect(report.selected_checks).toHaveLength(report.selected_summary.total);
  });

  it("rejects env-pointed JSON evidence unless it explicitly reports ok true", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-cutover-gate-"));
    const evidencePath = path.join(root, "d1-import.json");
    await writeFile(evidencePath, JSON.stringify({ ok: false, reason: "counts differ" }));

    const report = runReadiness(root, {
      D1_IMPORT_VALIDATION_REPORT: evidencePath,
    });
    const check = report.checks.find((item: { id: string }) => item.id === "d1-import-validation");

    expect(check).toMatchObject({
      status: "blocked",
      remediation: "Evidence JSON must contain ok: true.",
    });
  });

  it("rejects placeholder Worker smoke evidence for production smoke", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-cutover-gate-"));
    const evidencePath = path.join(root, "prod-smoke.txt");
    await writeFile(evidencePath, "ok");

    const report = runReadiness(root, {
      CLOUDFLARE_PRODUCTION_SMOKE_REPORT: evidencePath,
    });
    const check = report.checks.find((item: { id: string }) => item.id === "cloudflare-production-smoke");

    expect(check).toMatchObject({
      status: "blocked",
      remediation: "Evidence file must be JSON for this gate.",
    });
  });

  it("rejects weak Worker smoke evidence even when ok is true", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-cutover-gate-"));
    const evidencePath = path.join(root, "prod-smoke.json");
    await writeFile(evidencePath, JSON.stringify({ ok: true }));

    const report = runReadiness(root, {
      CLOUDFLARE_PRODUCTION_SMOKE_REPORT: evidencePath,
    });
    const check = report.checks.find((item: { id: string }) => item.id === "cloudflare-production-smoke");

    expect(check).toMatchObject({
      status: "blocked",
      remediation: "Worker smoke report must include base_url.",
    });
  });

  it("rejects weak live shadow evidence even when ok is true", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-cutover-gate-"));
    const evidencePath = path.join(root, "live-shadow.json");
    await writeFile(evidencePath, JSON.stringify({ ok: true }));

    const report = runReadiness(root, {
      LIVE_SHADOW_TEST_REPORT: evidencePath,
    });
    const check = report.checks.find((item: { id: string }) => item.id === "live-shadow-validation");

    expect(check).toMatchObject({
      status: "blocked",
      remediation: "Live shadow report must include base_url.",
    });
  });

  it("rejects weak Cloudflare deploy evidence even when ok is true", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-cutover-gate-"));
    const evidencePath = path.join(root, "deploy.json");
    await writeFile(evidencePath, JSON.stringify({ ok: true }));

    const report = runReadiness(root, {
      CLOUDFLARE_PRODUCTION_DEPLOY_REPORT: evidencePath,
    });
    const check = report.checks.find((item: { id: string }) => item.id === "cloudflare-production-deploy");

    expect(check).toMatchObject({
      status: "blocked",
      remediation: "Cloudflare deploy report environment must be production.",
    });
  });

  it("uses canonical production deploy evidence when no env override is set", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-cutover-gate-"));
    const reportDir = path.join(root, "process/features/cloudflare-stack-migration/reports");
    await mkdir(reportDir, { recursive: true });
    await writeFile(
      path.join(reportDir, "phase-07-cloudflare-production-deploy_21-06-26.json"),
      JSON.stringify({
        ok: true,
        evidence_kind: "cloudflare-production-deploy",
        environment: "production",
        worker: {
          name: "manut-app",
          url: "https://manut-app.bettergogocash.workers.dev",
          version_id: "worker-version-1",
        },
        checks: {
          dry_run_bundle: true,
          remote_d1_migrations: true,
          worker_deploy: true,
          queue_consumer: true,
          production_smoke: true,
        },
        evidence: {
          smoke_report:
            "process/features/cloudflare-stack-migration/reports/phase-07-cloudflare-production-smoke_21-06-26.json",
        },
      })
    );

    const report = runReadiness(root);
    const check = report.checks.find((item: { id: string }) => item.id === "cloudflare-production-deploy");

    expect(check).toMatchObject({
      status: "pass",
      evidence:
        "process/features/cloudflare-stack-migration/reports/phase-07-cloudflare-production-deploy_21-06-26.json",
    });
  });

  it("rejects Cloudflare deploy evidence that uses a git SHA as the Worker version", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-cutover-gate-"));
    const reportDir = path.join(root, "process/features/cloudflare-stack-migration/reports");
    await mkdir(reportDir, { recursive: true });
    await writeFile(
      path.join(reportDir, "phase-07-cloudflare-production-deploy_21-06-26.json"),
      JSON.stringify({
        ok: true,
        evidence_kind: "cloudflare-production-deploy",
        environment: "production",
        worker: {
          name: "manut-app",
          url: "https://manut-app.bettergogocash.workers.dev",
          version_id: "0123456789abcdef0123456789abcdef01234567",
          git_sha: "0123456789abcdef0123456789abcdef01234567",
        },
        checks: {
          remote_d1_migrations: true,
          worker_deploy: true,
          worker_smoke: true,
          live_shadow: true,
        },
        evidence: {
          smoke_report: "phase-07-cloudflare-production-smoke_21-06-26.json",
        },
      })
    );

    const report = runReadiness(root);
    const check = report.checks.find((item: { id: string }) => item.id === "cloudflare-production-deploy");

    expect(check).toMatchObject({
      status: "blocked",
      remediation: "Cloudflare deploy report worker version_id must be provider-backed, not a git SHA.",
    });
  });

  it("requires production Worker smoke evidence in addition to deploy evidence", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-cutover-gate-"));
    const report = runReadiness(root);
    const check = report.checks.find((item: { id: string }) => item.id === "cloudflare-production-smoke");

    expect(check).toMatchObject({
      status: "blocked",
      evidence:
        "process/features/cloudflare-stack-migration/reports/phase-07-cloudflare-production-smoke_21-06-26.json",
    });
  });

  it("blocks empty local evidence files", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-cutover-gate-"));
    const reportDir = path.join(root, "process/features/cloudflare-stack-migration/reports");
    await mkdir(reportDir, { recursive: true });
    await writeFile(path.join(reportDir, "phase-01-cloudflare-foundation-evidence_21-06-26.md"), "");

    const report = runReadiness(root);
    const check = report.checks.find((item: { id: string }) => item.id === "phase-01-foundation-report");

    expect(check).toMatchObject({
      status: "blocked",
      remediation: "Evidence file exists but is empty.",
    });
  });

  it("rejects authenticated smoke reports that do not include required workflow checks", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-cutover-gate-"));
    const reportDir = path.join(root, "process/features/cloudflare-stack-migration/reports");
    await mkdir(reportDir, { recursive: true });
    await writeFile(
      path.join(reportDir, "phase-07-authenticated-smoke_21-06-26.json"),
      JSON.stringify({
        ok: true,
        evidence_kind: "authenticated-smoke",
        target_origin: "https://app.manut.xyz",
        actor: "operator@example.com",
        cloudflare_route_verified: true,
        cloudflare_route_evidence: "x-manut-cloudflare-phase header observed on app.manut.xyz",
        checks: [
          {
            id: "login",
            ok: true,
            evidence: "login screenshot",
            observed_at: "2026-06-21T12:00:00.000Z",
            url: "https://app.manut.xyz/",
          },
        ],
      })
    );

    const report = runReadiness(root);
    const check = report.checks.find((item: { id: string }) => item.id === "authenticated-smoke");

    expect(check).toMatchObject({
      status: "blocked",
      remediation: "Authenticated smoke report is missing session-refresh.",
    });
  });

  it("rejects authenticated smoke reports without production audit context", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-cutover-gate-"));
    const reportDir = path.join(root, "process/features/cloudflare-stack-migration/reports");
    await mkdir(reportDir, { recursive: true });
    await writeFile(
      path.join(reportDir, "phase-07-authenticated-smoke_21-06-26.json"),
      JSON.stringify({
        ok: true,
        checks: REQUIRED_AUTHENTICATED_SMOKE_IDS.map((id) => ({
          id,
          ok: true,
          evidence: `${id} screenshot`,
        })),
      })
    );

    const report = runReadiness(root);
    const check = report.checks.find((item: { id: string }) => item.id === "authenticated-smoke");

    expect(check).toMatchObject({
      status: "blocked",
      remediation: "Authenticated smoke report target_origin must be https://app.manut.xyz.",
    });
  });

  it("rejects authenticated smoke reports without Cloudflare route provenance", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-cutover-gate-"));
    const reportDir = path.join(root, "process/features/cloudflare-stack-migration/reports");
    await mkdir(reportDir, { recursive: true });
    await writeFile(
      path.join(reportDir, "phase-07-authenticated-smoke_21-06-26.json"),
      JSON.stringify({
        ok: true,
        evidence_kind: "authenticated-smoke",
        target_origin: "https://app.manut.xyz",
        actor: "operator@example.com",
        checks: REQUIRED_AUTHENTICATED_SMOKE_IDS.map((id) => ({
          id,
          ok: true,
          evidence: `${id} screenshot`,
          observed_at: "2026-06-21T12:00:00.000Z",
        })),
      })
    );

    const report = runReadiness(root);
    const check = report.checks.find((item: { id: string }) => item.id === "authenticated-smoke");

    expect(check).toMatchObject({
      status: "blocked",
      remediation: "Authenticated smoke report must set cloudflare_route_verified: true.",
    });
  });

  it("rejects weak D1 import reports even when ok is true", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-cutover-gate-"));
    const reportDir = path.join(root, "process/features/cloudflare-stack-migration/reports");
    await mkdir(reportDir, { recursive: true });
    await writeFile(path.join(reportDir, "phase-07-d1-import-validation_21-06-26.json"), JSON.stringify({ ok: true }));

    const report = runReadiness(root);
    const check = report.checks.find((item: { id: string }) => item.id === "d1-import-validation");

    expect(check).toMatchObject({
      status: "blocked",
      remediation: "D1 import report must include summary.",
    });
  });

  it("rejects weak D1 env override evidence even when the file name is generic", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-cutover-gate-"));
    const evidencePath = path.join(root, "d1-final-evidence.json");
    await writeFile(evidencePath, JSON.stringify({ ok: true }));

    const report = runReadiness(root, {
      D1_IMPORT_VALIDATION_REPORT: evidencePath,
    });
    const check = report.checks.find((item: { id: string }) => item.id === "d1-import-validation");

    expect(check).toMatchObject({
      status: "blocked",
      remediation: "D1 import report must include summary.",
    });
  });

  it("rejects high-risk env override evidence when the file is not JSON", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-cutover-gate-"));
    const evidencePath = path.join(root, "d1-final-evidence.txt");
    await writeFile(evidencePath, "ok");

    const report = runReadiness(root, {
      D1_IMPORT_VALIDATION_REPORT: evidencePath,
    });
    const check = report.checks.find((item: { id: string }) => item.id === "d1-import-validation");

    expect(check).toMatchObject({
      status: "blocked",
      remediation: "Evidence file must be JSON for this gate.",
    });
  });

  it("rejects D1 reports with failed relationship rows even when summary claims success", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-cutover-gate-"));
    const reportDir = path.join(root, "process/features/cloudflare-stack-migration/reports");
    await mkdir(reportDir, { recursive: true });
    await writeFile(
      path.join(reportDir, "phase-07-d1-import-validation_21-06-26.json"),
      JSON.stringify({
        ok: true,
        source_counts: "postgres-counts.json",
        target_counts: "d1-counts.json",
        summary: {
          count_tables_matched: 2,
          count_tables_mismatched: 0,
          relationship_checks_failed: 0,
        },
        count_report: {
          ok: true,
          matchedTableCount: 2,
          mismatchedTableCount: 0,
          matches: [
            { table: "workspaces", sourceCount: 1, targetCount: 1 },
            { table: "projects", sourceCount: 2, targetCount: 2 },
          ],
        },
        relationship_checks: [{ name: "projects.workspace_id", ok: false, orphan_count: 1 }],
      })
    );

    const report = runReadiness(root);
    const check = report.checks.find((item: { id: string }) => item.id === "d1-import-validation");

    expect(check).toMatchObject({
      status: "blocked",
      remediation: "D1 import relationship checks must all pass with zero orphans.",
    });
  });

  it("rejects D1 reports with zero matched count tables", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-cutover-gate-"));
    const reportDir = path.join(root, "process/features/cloudflare-stack-migration/reports");
    await mkdir(reportDir, { recursive: true });
    await writeFile(
      path.join(reportDir, "phase-07-d1-import-validation_21-06-26.json"),
      JSON.stringify({
        ok: true,
        source_counts: "postgres-counts.json",
        target_counts: "d1-counts.json",
        summary: {
          count_tables_matched: 0,
          count_tables_mismatched: 0,
          relationship_checks_failed: 0,
        },
        count_report: {
          ok: true,
          matchedTableCount: 0,
          mismatchedTableCount: 0,
        },
        relationship_checks: [{ name: "projects.workspace_id", ok: true, orphan_count: 0 }],
      })
    );

    const report = runReadiness(root);
    const check = report.checks.find((item: { id: string }) => item.id === "d1-import-validation");

    expect(check).toMatchObject({
      status: "blocked",
      remediation: "D1 import report must include at least one matched count table.",
    });
  });

  it("rejects D1 reports when all required table counts are empty", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-cutover-gate-"));
    const reportDir = path.join(root, "process/features/cloudflare-stack-migration/reports");
    await mkdir(reportDir, { recursive: true });
    await writeFile(
      path.join(reportDir, "phase-07-d1-import-validation_21-06-26.json"),
      JSON.stringify({
        ok: true,
        evidence_kind: "d1-import-validation",
        source_counts: "postgres-counts.json",
        target_counts: "d1-counts.json",
        summary: {
          count_tables_matched: 2,
          count_tables_mismatched: 0,
          required_scope_source_rows: 0,
          required_scope_target_rows: 0,
          relationship_checks_failed: 0,
        },
        count_report: {
          ok: true,
          matchedTableCount: 2,
          mismatchedTableCount: 0,
          matches: [
            { table: "workspaces", sourceCount: 0, targetCount: 0 },
            { table: "projects", sourceCount: 0, targetCount: 0 },
          ],
        },
        relationship_checks: [{ name: "projects.workspace_id", ok: true, orphan_count: 0 }],
      })
    );

    const report = runReadiness(root);
    const check = report.checks.find((item: { id: string }) => item.id === "d1-import-validation");

    expect(check).toMatchObject({
      status: "blocked",
      remediation: "D1 import report must include non-empty required table counts.",
    });
  });

  it("rejects D1 reports with the wrong evidence kind even when the shape passes", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-cutover-gate-"));
    const reportDir = path.join(root, "process/features/cloudflare-stack-migration/reports");
    await mkdir(reportDir, { recursive: true });
    await writeFile(
      path.join(reportDir, "phase-07-d1-import-validation_21-06-26.json"),
      JSON.stringify({
        ok: true,
        evidence_kind: "r2-manifest-validation",
        source_counts: "postgres-counts.json",
        target_counts: "d1-counts.json",
        summary: {
          count_tables_matched: 2,
          count_tables_mismatched: 0,
          required_scope_source_rows: 3,
          required_scope_target_rows: 3,
          relationship_checks_failed: 0,
        },
        count_report: {
          ok: true,
          matchedTableCount: 2,
          mismatchedTableCount: 0,
          matches: [
            { table: "workspaces", sourceCount: 1, targetCount: 1 },
            { table: "projects", sourceCount: 2, targetCount: 2 },
          ],
        },
        relationship_checks: [{ name: "projects.workspace_id", ok: true, orphan_count: 0 }],
      })
    );

    const report = runReadiness(root);
    const check = report.checks.find((item: { id: string }) => item.id === "d1-import-validation");

    expect(check).toMatchObject({
      status: "blocked",
      remediation: "Evidence JSON evidence_kind must be d1-import-validation.",
    });
  });

  it("rejects D1 reports missing required Phase 7 table coverage", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-cutover-gate-"));
    const reportDir = path.join(root, "process/features/cloudflare-stack-migration/reports");
    await mkdir(reportDir, { recursive: true });
    await writeFile(
      path.join(reportDir, "phase-07-d1-import-validation_21-06-26.json"),
      JSON.stringify({
        ok: true,
        source_counts: "postgres-counts.json",
        target_counts: "d1-counts.json",
        summary: {
          count_tables_matched: 1,
          count_tables_mismatched: 0,
          relationship_checks_failed: 0,
        },
        count_report: {
          ok: true,
          matchedTableCount: 1,
          mismatchedTableCount: 0,
          matches: [{ table: "workspaces", sourceCount: 1, targetCount: 1 }],
        },
        relationship_checks: [{ name: "projects.workspace_id", ok: true, orphan_count: 0 }],
      })
    );

    const report = runReadiness(root);
    const check = report.checks.find((item: { id: string }) => item.id === "d1-import-validation");

    expect(check).toMatchObject({
      status: "blocked",
      remediation: "D1 import report must cover required tables: missing projects.",
    });
  });

  it("rejects D1 reports missing required Phase 7 relationship coverage", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-cutover-gate-"));
    const reportDir = path.join(root, "process/features/cloudflare-stack-migration/reports");
    await mkdir(reportDir, { recursive: true });
    await writeFile(
      path.join(reportDir, "phase-07-d1-import-validation_21-06-26.json"),
      JSON.stringify({
        ok: true,
        source_counts: "postgres-counts.json",
        target_counts: "d1-counts.json",
        summary: {
          count_tables_matched: 2,
          count_tables_mismatched: 0,
          relationship_checks_failed: 0,
        },
        count_report: {
          ok: true,
          matchedTableCount: 2,
          mismatchedTableCount: 0,
          matches: [
            { table: "workspaces", sourceCount: 1, targetCount: 1 },
            { table: "projects", sourceCount: 2, targetCount: 2 },
          ],
        },
        relationship_checks: [{ name: "projects.owner_id", ok: true, orphan_count: 0 }],
      })
    );

    const report = runReadiness(root);
    const check = report.checks.find((item: { id: string }) => item.id === "d1-import-validation");

    expect(check).toMatchObject({
      status: "blocked",
      remediation: "D1 import report must cover required relationships: missing projects.workspace_id.",
    });
  });

  it("rejects D1 reports with validation errors even when ok is true", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-cutover-gate-"));
    const reportDir = path.join(root, "process/features/cloudflare-stack-migration/reports");
    await mkdir(reportDir, { recursive: true });
    await writeFile(
      path.join(reportDir, "phase-07-d1-import-validation_21-06-26.json"),
      JSON.stringify({
        ok: true,
        source_counts: "postgres-counts.json",
        target_counts: "d1-counts.json",
        summary: {
          count_tables_matched: 2,
          count_tables_mismatched: 0,
          relationship_checks_failed: 0,
        },
        validation_errors: ["operator overrode missing relationship checks"],
        count_report: {
          ok: true,
          matchedTableCount: 2,
          mismatchedTableCount: 0,
          matches: [
            { table: "workspaces", sourceCount: 1, targetCount: 1 },
            { table: "projects", sourceCount: 2, targetCount: 2 },
          ],
        },
        relationship_checks: [{ name: "projects.workspace_id", ok: true, orphan_count: 0 }],
      })
    );

    const report = runReadiness(root);
    const check = report.checks.find((item: { id: string }) => item.id === "d1-import-validation");

    expect(check).toMatchObject({
      status: "blocked",
      remediation: "D1 import report must not include validation_errors.",
    });
  });

  it("rejects R2 validation reports that do not enforce shared checksums", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-cutover-gate-"));
    const reportDir = path.join(root, "process/features/cloudflare-stack-migration/reports");
    await mkdir(reportDir, { recursive: true });
    await writeFile(
      path.join(reportDir, "phase-07-r2-manifest-validation_21-06-26.json"),
      JSON.stringify({
        ok: true,
        checksumPolicy: { requireSharedChecksum: false },
        sourceObjectCount: 1,
        targetObjectCount: 1,
        matchedObjectCount: 1,
        mismatchedObjectCount: 0,
        mismatches: [],
      })
    );

    const report = runReadiness(root);
    const check = report.checks.find((item: { id: string }) => item.id === "r2-manifest-validation");

    expect(check).toMatchObject({
      status: "blocked",
      remediation: "R2 manifest report must require shared checksums.",
    });
  });

  it("rejects weak R2 env override evidence even when the file name is generic", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-cutover-gate-"));
    const evidencePath = path.join(root, "r2-final-evidence.json");
    await writeFile(evidencePath, JSON.stringify({ ok: true }));

    const report = runReadiness(root, {
      R2_MANIFEST_VALIDATION_REPORT: evidencePath,
    });
    const check = report.checks.find((item: { id: string }) => item.id === "r2-manifest-validation");

    expect(check).toMatchObject({
      status: "blocked",
      remediation: "R2 manifest report must require shared checksums.",
    });
  });

  it("rejects R2 validation reports with zero matched objects", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-cutover-gate-"));
    const reportDir = path.join(root, "process/features/cloudflare-stack-migration/reports");
    await mkdir(reportDir, { recursive: true });
    await writeFile(
      path.join(reportDir, "phase-07-r2-manifest-validation_21-06-26.json"),
      JSON.stringify({
        ok: true,
        source_manifest: "gcs-manifest.json",
        target_manifest: "r2-manifest.json",
        checksumPolicy: { requireSharedChecksum: true },
        sourceObjectCount: 0,
        targetObjectCount: 0,
        matchedObjectCount: 0,
        mismatchedObjectCount: 0,
        mismatches: [],
      })
    );

    const report = runReadiness(root);
    const check = report.checks.find((item: { id: string }) => item.id === "r2-manifest-validation");

    expect(check).toMatchObject({
      status: "blocked",
      remediation: "R2 manifest report must include at least one matched object.",
    });
  });

  it("rejects Better Stack reports unless every required monitor is up", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-cutover-gate-"));
    const reportDir = path.join(root, "process/features/cloudflare-stack-migration/reports");
    await mkdir(reportDir, { recursive: true });
    await writeFile(
      path.join(reportDir, "phase-07-betterstack-cutover_21-06-26.json"),
      JSON.stringify({
        ok: true,
        monitor_summary: { total: 3, passed: 2, failed: 1 },
        monitor_checks: [
          { id: "public-site", ok: true, status: "up" },
          { id: "app-root", ok: true, status: "up" },
          { id: "api-instances", ok: false, status: "down" },
        ],
      })
    );

    const report = runReadiness(root);
    const check = report.checks.find((item: { id: string }) => item.id === "betterstack-cutover-green");

    expect(check).toMatchObject({
      status: "blocked",
      remediation: "Better Stack report must have all required monitors green.",
    });
  });

  it("rejects Better Stack reports that omit required monitor ids", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-cutover-gate-"));
    const reportDir = path.join(root, "process/features/cloudflare-stack-migration/reports");
    await mkdir(reportDir, { recursive: true });
    await writeFile(
      path.join(reportDir, "phase-07-betterstack-cutover_21-06-26.json"),
      JSON.stringify({
        ok: true,
        monitor_summary: { total: 3, passed: 3, failed: 0 },
        monitor_checks: [
          { id: "public-site", ok: true, status: "up" },
          { id: "app-root", ok: true, status: "up" },
          { id: "unrelated", ok: true, status: "up" },
        ],
      })
    );

    const report = runReadiness(root);
    const check = report.checks.find((item: { id: string }) => item.id === "betterstack-cutover-green");

    expect(check).toMatchObject({
      status: "blocked",
      remediation: "Better Stack report is missing required monitor api-instances.",
    });
  });

  it("rejects Better Stack reports without URL match proof", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-cutover-gate-"));
    const reportDir = path.join(root, "process/features/cloudflare-stack-migration/reports");
    await mkdir(reportDir, { recursive: true });
    await writeFile(
      path.join(reportDir, "phase-07-betterstack-cutover_21-06-26.json"),
      JSON.stringify({
        ok: true,
        monitor_summary: { total: 3, passed: 3, failed: 0 },
        monitor_checks: [
          { id: "public-site", ok: true, status: "up", url: "https://manut.xyz" },
          { id: "app-root", ok: true, status: "up", url: "https://legacy.manut.example" },
          { id: "api-instances", ok: true, status: "up", url: "https://app.manut.xyz/api/instances/" },
        ],
      })
    );

    const report = runReadiness(root);
    const check = report.checks.find((item: { id: string }) => item.id === "betterstack-cutover-green");

    expect(check).toMatchObject({
      status: "blocked",
      remediation: "Better Stack monitor checks must target the expected URLs.",
    });
  });

  it("rejects Better Stack reports without Better Stack monitor ids", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-cutover-gate-"));
    const reportDir = path.join(root, "process/features/cloudflare-stack-migration/reports");
    await mkdir(reportDir, { recursive: true });
    await writeFile(
      path.join(reportDir, "phase-07-betterstack-cutover_21-06-26.json"),
      JSON.stringify({
        ok: true,
        evidence_kind: "betterstack-cutover",
        monitor_summary: { total: 3, passed: 3, failed: 0 },
        endpoint_summary: { total: 3, passed: 3, failed: 0 },
        monitor_checks: [
          {
            id: "public-site",
            ok: true,
            status: "up",
            url: "https://manut.xyz",
            expected_url: "https://manut.xyz",
            url_matches: true,
          },
          {
            id: "app-root",
            ok: true,
            status: "up",
            url: "https://app.manut.xyz",
            expected_url: "https://app.manut.xyz",
            url_matches: true,
          },
          {
            id: "api-instances",
            ok: true,
            status: "up",
            url: "https://app.manut.xyz/api/instances/",
            expected_url: "https://app.manut.xyz/api/instances/",
            url_matches: true,
          },
        ],
        endpoint_checks: [
          { id: "public-site", ok: true, status: 200, keyword_found: true, url: "https://manut.xyz" },
          { id: "app-root", ok: true, status: 200, keyword_found: true, url: "https://app.manut.xyz" },
          {
            id: "api-instances",
            ok: true,
            status: 200,
            keyword_found: true,
            url: "https://app.manut.xyz/api/instances/",
          },
        ],
      })
    );

    const report = runReadiness(root);
    const check = report.checks.find((item: { id: string }) => item.id === "betterstack-cutover-green");

    expect(check).toMatchObject({
      status: "blocked",
      remediation: "Better Stack monitor checks must include Better Stack monitor ids.",
    });
  });

  it("rejects Better Stack reports when live endpoint probes fail", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-cutover-gate-"));
    const reportDir = path.join(root, "process/features/cloudflare-stack-migration/reports");
    await mkdir(reportDir, { recursive: true });
    await writeFile(
      path.join(reportDir, "phase-07-betterstack-cutover_21-06-26.json"),
      JSON.stringify({
        ok: true,
        monitor_summary: { total: 3, passed: 3, failed: 0 },
        endpoint_summary: { total: 3, passed: 2, failed: 1 },
        monitor_checks: [
          {
            id: "public-site",
            ok: true,
            status: "up",
            monitor_id: "monitor-public-site",
            url: "https://manut.xyz",
            expected_url: "https://manut.xyz",
            url_matches: true,
          },
          {
            id: "app-root",
            ok: true,
            status: "up",
            monitor_id: "monitor-app-root",
            url: "https://app.manut.xyz",
            expected_url: "https://app.manut.xyz",
            url_matches: true,
          },
          {
            id: "api-instances",
            ok: true,
            status: "up",
            monitor_id: "monitor-api-instances",
            url: "https://app.manut.xyz/api/instances/",
            expected_url: "https://app.manut.xyz/api/instances/",
            url_matches: true,
          },
        ],
        endpoint_checks: [
          { id: "public-site", ok: true, status: 200, keyword_found: true },
          { id: "app-root", ok: true, status: 200, keyword_found: true },
          { id: "api-instances", ok: false, status: 200, keyword_found: false },
        ],
      })
    );

    const report = runReadiness(root);
    const check = report.checks.find((item: { id: string }) => item.id === "betterstack-cutover-green");

    expect(check).toMatchObject({
      status: "blocked",
      remediation: "Better Stack endpoint probes must all pass.",
    });
  });

  it("accepts Better Stack reports when required monitors pass and unrelated monitors fail", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-cutover-gate-"));
    const reportDir = path.join(root, "process/features/cloudflare-stack-migration/reports");
    await mkdir(reportDir, { recursive: true });
    await writeFile(
      path.join(reportDir, "phase-07-betterstack-cutover_21-06-26.json"),
      JSON.stringify({
        ok: true,
        evidence_kind: "betterstack-cutover",
        monitor_summary: { total: 4, passed: 3, failed: 1 },
        endpoint_summary: { total: 3, passed: 3, failed: 0 },
        monitor_checks: [
          {
            id: "public-site",
            ok: true,
            status: "up",
            monitor_id: "monitor-public-site",
            url: "https://manut.xyz",
            expected_url: "https://manut.xyz",
            url_matches: true,
          },
          {
            id: "app-root",
            ok: true,
            status: "up",
            monitor_id: "monitor-app-root",
            url: "https://app.manut.xyz",
            expected_url: "https://app.manut.xyz",
            url_matches: true,
          },
          {
            id: "api-instances",
            ok: true,
            status: "up",
            monitor_id: "monitor-api-instances",
            url: "https://app.manut.xyz/api/instances/",
            expected_url: "https://app.manut.xyz/api/instances/",
            url_matches: true,
          },
          { id: "staging-app", ok: false, status: "down", url_matches: true },
        ],
        endpoint_checks: [
          { id: "public-site", ok: true, status: 200, keyword_found: true, url: "https://manut.xyz" },
          { id: "app-root", ok: true, status: 200, keyword_found: true, url: "https://app.manut.xyz" },
          {
            id: "api-instances",
            ok: true,
            status: 200,
            keyword_found: true,
            url: "https://app.manut.xyz/api/instances/",
          },
        ],
      })
    );

    const report = runReadiness(root);
    const check = report.checks.find((item: { id: string }) => item.id === "betterstack-cutover-green");

    expect(check).toMatchObject({ status: "pass" });
  });

  it("rejects structurally green Better Stack reports for non-production URLs", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-cutover-gate-"));
    const reportDir = path.join(root, "process/features/cloudflare-stack-migration/reports");
    await mkdir(reportDir, { recursive: true });
    await writeFile(
      path.join(reportDir, "phase-07-betterstack-cutover_21-06-26.json"),
      JSON.stringify({
        ok: true,
        evidence_kind: "betterstack-cutover",
        monitor_summary: { total: 3, passed: 3, failed: 0 },
        endpoint_summary: { total: 3, passed: 3, failed: 0 },
        monitor_checks: [
          {
            id: "public-site",
            ok: true,
            status: "up",
            url: "https://staging.example.com",
            expected_url: "https://staging.example.com",
            url_matches: true,
          },
          {
            id: "app-root",
            ok: true,
            status: "up",
            url: "https://staging.example.com/app",
            expected_url: "https://staging.example.com/app",
            url_matches: true,
          },
          {
            id: "api-instances",
            ok: true,
            status: "up",
            url: "https://staging.example.com/api/instances/",
            expected_url: "https://staging.example.com/api/instances/",
            url_matches: true,
          },
        ],
        endpoint_checks: [
          { id: "public-site", ok: true, status: 200, keyword_found: true, url: "https://staging.example.com" },
          { id: "app-root", ok: true, status: 200, keyword_found: true, url: "https://staging.example.com/app" },
          {
            id: "api-instances",
            ok: true,
            status: 200,
            keyword_found: true,
            url: "https://staging.example.com/api/instances/",
          },
        ],
      })
    );

    const report = runReadiness(root);
    const check = report.checks.find((item: { id: string }) => item.id === "betterstack-cutover-green");

    expect(check).toMatchObject({
      status: "blocked",
      remediation: "Better Stack monitor checks must target canonical Manut production URLs.",
    });
  });

  it("rejects weak Better Stack env override evidence even when the file name is generic", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-cutover-gate-"));
    const evidencePath = path.join(root, "betterstack-final-evidence.json");
    await writeFile(evidencePath, JSON.stringify({ ok: true }));

    const report = runReadiness(root, {
      BETTERSTACK_CUTOVER_REPORT: evidencePath,
    });
    const check = report.checks.find((item: { id: string }) => item.id === "betterstack-cutover-green");

    expect(check).toMatchObject({
      status: "blocked",
      remediation: "Better Stack report must include monitor_summary.",
    });
  });

  it("rejects weak seven-green-days env override evidence even when the file name is generic", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-cutover-gate-"));
    const evidencePath = path.join(root, "phase8-final-evidence.json");
    await writeFile(evidencePath, JSON.stringify({ ok: true }));

    const report = runReadiness(root, {
      SEVEN_GREEN_DAYS_REPORT: evidencePath,
    });
    const check = report.checks.find((item: { id: string }) => item.id === "phase8-seven-green-days");

    expect(check).toMatchObject({
      status: "blocked",
      remediation: "Seven green days report must set green_days_verified: true.",
    });
  });

  it("rejects seven-green-days reports without production target context", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-cutover-gate-"));
    const evidencePath = path.join(root, "phase8-final-evidence.json");
    await writeFile(
      evidencePath,
      JSON.stringify({
        ok: true,
        green_days_verified: true,
        cutover_at: "2026-06-21T00:00:00.000Z",
        verified_through: "2026-06-28T00:00:00.000Z",
        checks: REQUIRED_SEVEN_GREEN_DAYS_IDS.map((id) => ({
          id,
          ok: true,
          evidence: `${id} evidence`,
        })),
      })
    );

    const report = runReadiness(root, {
      SEVEN_GREEN_DAYS_REPORT: evidencePath,
    });
    const check = report.checks.find((item: { id: string }) => item.id === "phase8-seven-green-days");

    expect(check).toMatchObject({
      status: "blocked",
      remediation: "Seven green days report target_origin must be https://app.manut.xyz.",
    });
  });

  it("rejects operator approval when CUTOVER_APPROVED is set without an approval report", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-cutover-gate-"));

    const report = runReadiness(root, {
      CUTOVER_APPROVED: "true",
    });
    const check = report.checks.find((item: { id: string }) => item.id === "operator-cutover-approval");

    expect(check).toMatchObject({
      status: "blocked",
      evidence: "process/features/cloudflare-stack-migration/reports/phase-07-operator-cutover-approval_21-06-26.json",
      remediation: "Record the operator cutover approval report before setting CUTOVER_APPROVED=true.",
    });
  });

  it("rejects weak operator approval env override evidence even when ok is true", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-cutover-gate-"));
    const evidencePath = path.join(root, "approval.json");
    await writeFile(evidencePath, JSON.stringify({ ok: true, target_origin: "https://app.manut.xyz" }));

    const report = runReadiness(root, {
      CUTOVER_APPROVED: "true",
      OPERATOR_CUTOVER_APPROVAL_REPORT: evidencePath,
    });
    const check = report.checks.find((item: { id: string }) => item.id === "operator-cutover-approval");

    expect(check).toMatchObject({
      status: "blocked",
      remediation: "Operator approval report must include approved_by.",
    });
  });

  it("accepts strongly shaped operator approval only when the explicit approval env is set", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-cutover-gate-"));
    const evidencePath = path.join(root, "approval.json");
    await writeFile(
      evidencePath,
      JSON.stringify({
        ok: true,
        evidence_kind: "operator-approval",
        cutover_approved: true,
        approved_by: "operator@example.com",
        approved_at: "2026-06-21T12:00:00.000Z",
        target_origin: "https://app.manut.xyz",
        maintenance_window: {
          start_at: "2026-06-21T13:00:00.000Z",
          end_at: "2026-06-21T14:00:00.000Z",
        },
        checks: [
          {
            id: "maintenance-window-announced",
            ok: true,
            evidence: "calendar invite",
            observed_at: "2026-06-21T12:00:00.000Z",
          },
          {
            id: "rollback-checkpoint-confirmed",
            ok: true,
            evidence: "rollback DNS target documented",
            observed_at: "2026-06-21T12:00:00.000Z",
          },
          {
            id: "dns-change-approved",
            ok: true,
            evidence: "operator approved app.manut.xyz route change",
            observed_at: "2026-06-21T12:00:00.000Z",
          },
          {
            id: "write-freeze-confirmed",
            ok: true,
            evidence: "maintenance banner scheduled",
            observed_at: "2026-06-21T12:00:00.000Z",
          },
          {
            id: "smoke-plan-ready",
            ok: true,
            evidence: "public and authenticated smoke checklist ready",
            observed_at: "2026-06-21T12:00:00.000Z",
          },
        ],
      })
    );

    const withoutEnv = runReadiness(root, {
      OPERATOR_CUTOVER_APPROVAL_REPORT: evidencePath,
    });
    const blockedCheck = withoutEnv.checks.find((item: { id: string }) => item.id === "operator-cutover-approval");

    expect(blockedCheck).toMatchObject({
      status: "blocked",
      remediation:
        "Set CUTOVER_APPROVED=true only after approval report, maintenance window, and rollback checkpoint are recorded.",
    });

    const withEnv = runReadiness(root, {
      CUTOVER_APPROVED: "true",
      OPERATOR_CUTOVER_APPROVAL_REPORT: evidencePath,
    });
    const passingCheck = withEnv.checks.find((item: { id: string }) => item.id === "operator-cutover-approval");

    expect(passingCheck).toMatchObject({ status: "pass" });
  });

  it("accepts strongly shaped D1, R2, and Better Stack evidence for their gates", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-cutover-gate-"));
    const reportDir = path.join(root, "process/features/cloudflare-stack-migration/reports");
    await mkdir(reportDir, { recursive: true });
    await writeFile(
      path.join(reportDir, "phase-07-d1-import-validation_21-06-26.json"),
      JSON.stringify({
        ok: true,
        evidence_kind: "d1-import-validation",
        source_counts: "postgres-counts.json",
        target_counts: "d1-counts.json",
        summary: {
          count_tables_matched: 2,
          count_tables_mismatched: "0",
          required_scope_source_rows: "3",
          required_scope_target_rows: "3",
          relationship_checks_failed: "0",
        },
        count_report: {
          ok: true,
          matchedTableCount: 2,
          mismatchedTableCount: 0,
          matches: [
            { table: "workspaces", sourceCount: 1, targetCount: 1 },
            { table: "projects", sourceCount: 2, targetCount: 2 },
          ],
        },
        relationship_checks: [{ name: "projects.workspace_id", ok: true, orphanCount: "0" }],
      })
    );
    await writeFile(
      path.join(reportDir, "phase-07-r2-manifest-validation_21-06-26.json"),
      JSON.stringify({
        ok: true,
        evidence_kind: "r2-manifest-validation",
        source_manifest: "gcs-manifest.json",
        target_manifest: "r2-manifest.json",
        checksumPolicy: { requireSharedChecksum: true },
        sourceObjectCount: 1,
        targetObjectCount: 1,
        matchedObjectCount: 1,
        mismatchedObjectCount: 0,
        mismatches: [],
      })
    );
    await writeFile(
      path.join(reportDir, "phase-07-betterstack-cutover_21-06-26.json"),
      JSON.stringify({
        ok: true,
        evidence_kind: "betterstack-cutover",
        monitor_summary: { total: 3, passed: 3, failed: 0 },
        endpoint_summary: { total: 3, passed: 3, failed: 0 },
        monitor_checks: [
          {
            id: "public-site",
            ok: true,
            status: "up",
            monitor_id: "monitor-public-site",
            url: "https://manut.xyz",
            url_matches: true,
            expected_url: "https://manut.xyz",
          },
          {
            id: "app-root",
            ok: true,
            status: "up",
            monitor_id: "monitor-app-root",
            url: "https://app.manut.xyz",
            url_matches: true,
            expected_url: "https://app.manut.xyz",
          },
          {
            id: "api-instances",
            ok: true,
            status: "up",
            monitor_id: "monitor-api-instances",
            url: "https://app.manut.xyz/api/instances/",
            url_matches: true,
            expected_url: "https://app.manut.xyz/api/instances/",
          },
        ],
        endpoint_checks: [
          { id: "public-site", ok: true, status: 200, keyword_found: true, url: "https://manut.xyz" },
          { id: "app-root", ok: true, status: 200, keyword_found: true, url: "https://app.manut.xyz" },
          {
            id: "api-instances",
            ok: true,
            status: 200,
            keyword_found: true,
            url: "https://app.manut.xyz/api/instances/",
          },
        ],
      })
    );

    const report = runReadiness(root);
    const checksById = new Map(report.checks.map((item: { id: string }) => [item.id, item]));

    expect(checksById.get("d1-import-validation")).toMatchObject({ status: "pass" });
    expect(checksById.get("r2-manifest-validation")).toMatchObject({ status: "pass" });
    expect(checksById.get("betterstack-cutover-green")).toMatchObject({ status: "pass" });
  });
});
