import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

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

  it("uses canonical production deploy evidence when no env override is set", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-cutover-gate-"));
    const reportDir = path.join(root, "process/features/cloudflare-stack-migration/reports");
    await mkdir(reportDir, { recursive: true });
    await writeFile(
      path.join(reportDir, "phase-07-cloudflare-production-deploy_21-06-26.json"),
      JSON.stringify({ ok: true })
    );

    const report = runReadiness(root);
    const check = report.checks.find((item: { id: string }) => item.id === "cloudflare-production-deploy");

    expect(check).toMatchObject({
      status: "pass",
      evidence:
        "process/features/cloudflare-stack-migration/reports/phase-07-cloudflare-production-deploy_21-06-26.json",
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
      JSON.stringify({ ok: true, checks: [{ id: "login", ok: true, evidence: "login screenshot" }] })
    );

    const report = runReadiness(root);
    const check = report.checks.find((item: { id: string }) => item.id === "authenticated-smoke");

    expect(check).toMatchObject({
      status: "blocked",
      remediation: "Authenticated smoke report is missing session-refresh.",
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
          count_tables_mismatched: 0,
          relationship_checks_failed: 0,
        },
        count_report: {
          ok: true,
          mismatchedTableCount: 0,
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
          count_tables_mismatched: 0,
          relationship_checks_failed: 0,
        },
        validation_errors: ["operator overrode missing relationship checks"],
        count_report: {
          ok: true,
          mismatchedTableCount: 0,
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

  it("rejects operator approval when CUTOVER_APPROVED is set without an approval report", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-cutover-gate-"));

    const report = runReadiness(root, {
      CUTOVER_APPROVED: "true",
    });
    const check = report.checks.find((item: { id: string }) => item.id === "operator-cutover-approval");

    expect(check).toMatchObject({
      status: "blocked",
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
        cutover_approved: true,
        approved_by: "operator@example.com",
        approved_at: "2026-06-21T12:00:00.000Z",
        target_origin: "https://app.manut.xyz",
        maintenance_window: {
          start_at: "2026-06-21T13:00:00.000Z",
          end_at: "2026-06-21T14:00:00.000Z",
        },
        checks: [
          { id: "maintenance-window-announced", ok: true, evidence: "calendar invite" },
          { id: "rollback-checkpoint-confirmed", ok: true, evidence: "rollback DNS target documented" },
          { id: "dns-change-approved", ok: true, evidence: "operator approved app.manut.xyz route change" },
          { id: "write-freeze-confirmed", ok: true, evidence: "maintenance banner scheduled" },
          { id: "smoke-plan-ready", ok: true, evidence: "public and authenticated smoke checklist ready" },
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
        source_counts: "postgres-counts.json",
        target_counts: "d1-counts.json",
        summary: {
          count_tables_mismatched: 0,
          relationship_checks_failed: 0,
        },
        count_report: {
          ok: true,
          mismatchedTableCount: 0,
        },
        relationship_checks: [{ name: "projects.workspace_id", ok: true, orphanCount: 0 }],
      })
    );
    await writeFile(
      path.join(reportDir, "phase-07-r2-manifest-validation_21-06-26.json"),
      JSON.stringify({
        ok: true,
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
        monitor_summary: { total: 3, passed: 3, failed: 0 },
        monitor_checks: [
          { id: "public-site", ok: true, status: "up" },
          { id: "app-root", ok: true, status: "up" },
          { id: "api-instances", ok: true, status: "up" },
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
