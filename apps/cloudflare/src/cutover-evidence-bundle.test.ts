import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { REQUIRED_AUTHENTICATED_SMOKE_CHECKS } from "../tools/authenticated-smoke-report.mjs";
import { REQUIRED_OPERATOR_APPROVAL_CHECKS } from "../tools/operator-approval-report.mjs";
import { REQUIRED_SEVEN_GREEN_DAYS_CHECKS } from "../tools/seven-green-days-report.mjs";

const packageRoot = path.resolve(__dirname, "..");

function runBundle(args: string[], env: NodeJS.ProcessEnv = {}) {
  try {
    const stdout = execFileSync("node", ["tools/collect-cutover-evidence.mjs", ...args], {
      cwd: packageRoot,
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

function authenticatedSmokeInput() {
  return {
    actor: "operator@example.com",
    target_origin: "https://app.manut.xyz",
    checks: REQUIRED_AUTHENTICATED_SMOKE_CHECKS.map((check) => ({
      id: check.id,
      ok: true,
      evidence: `verified ${check.id}`,
      observed_at: "2026-06-21T12:00:00.000Z",
    })),
  };
}

function operatorApprovalInput() {
  return {
    approved_by: "operator@example.com",
    approved_at: "2026-06-21T12:00:00.000Z",
    target_origin: "https://app.manut.xyz",
    maintenance_window: {
      start_at: "2026-06-21T13:00:00.000Z",
      end_at: "2026-06-21T14:00:00.000Z",
    },
    checks: REQUIRED_OPERATOR_APPROVAL_CHECKS.map((check) => ({
      id: check.id,
      ok: true,
      evidence: `verified ${check.id}`,
      observed_at: "2026-06-21T12:00:00.000Z",
    })),
  };
}

function sevenGreenDaysInput() {
  return {
    cutover_at: "2026-06-21T00:00:00.000Z",
    verified_through: "2026-06-28T00:00:00.000Z",
    target_origin: "https://app.manut.xyz",
    checks: REQUIRED_SEVEN_GREEN_DAYS_CHECKS.map((check) => ({
      id: check.id,
      ok: true,
      evidence: `verified ${check.id}`,
      observed_at: "2026-06-28T00:00:00.000Z",
    })),
  };
}

describe("cutover evidence bundle", () => {
  it("dry-runs the remaining Phase 7 and Phase 8 evidence gates without inputs", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-evidence-bundle-"));
    const reportsDir = path.join(root, "reports");

    const report = runBundle(["--json", "--dry-run", "--reports-dir", reportsDir]);

    expect(report).toMatchObject({
      ok: false,
      status: "blocked",
      dry_run: true,
      summary: {
        total: 6,
        passed: 0,
        skipped: 6,
      },
    });
    expect(report.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "d1-import-validation",
          status: "skipped",
          missing_env: ["D1_POSTGRES_COUNTS", "D1_D1_COUNTS", "D1_RELATIONSHIPS"],
        }),
        expect.objectContaining({
          id: "betterstack-cutover-green",
          status: "skipped",
          missing_env: ["BETTERSTACK_API_TOKEN"],
        }),
      ])
    );
  });

  it("writes canonical evidence reports for supplied local inputs", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-evidence-bundle-"));
    const reportsDir = path.join(root, "reports");
    const sourceCounts = path.join(root, "postgres-counts.json");
    const d1Counts = path.join(root, "d1-counts.json");
    const relationships = path.join(root, "relationships.json");
    const gcsManifest = path.join(root, "gcs-manifest.json");
    const r2Manifest = path.join(root, "r2-manifest.json");
    const authInput = path.join(root, "authenticated-smoke-input.json");
    const approvalInput = path.join(root, "operator-approval-input.json");
    const sevenDaysInput = path.join(root, "seven-green-days-input.json");

    await writeFile(sourceCounts, JSON.stringify({ workspaces: 1, projects: 2 }), "utf8");
    await writeFile(d1Counts, JSON.stringify({ workspaces: 1, projects: 2 }), "utf8");
    await writeFile(
      relationships,
      JSON.stringify({
        checks: [{ name: "projects.workspace_id", source: "projects", target: "workspaces", orphan_count: 0 }],
      }),
      "utf8"
    );
    await writeFile(gcsManifest, JSON.stringify([{ key: "workspace/logo.png", size: 10, crc32c: "abc123" }]), "utf8");
    await writeFile(r2Manifest, JSON.stringify([{ key: "workspace/logo.png", size: 10, crc32c: "abc123" }]), "utf8");
    await writeFile(authInput, JSON.stringify(authenticatedSmokeInput()), "utf8");
    await writeFile(approvalInput, JSON.stringify(operatorApprovalInput()), "utf8");
    await writeFile(sevenDaysInput, JSON.stringify(sevenGreenDaysInput()), "utf8");

    const report = runBundle(["--json", "--reports-dir", reportsDir, "--skip-betterstack", "--soft-fail"], {
      D1_POSTGRES_COUNTS: sourceCounts,
      D1_D1_COUNTS: d1Counts,
      D1_RELATIONSHIPS: relationships,
      R2_GCS_MANIFEST: gcsManifest,
      R2_R2_MANIFEST: r2Manifest,
      AUTHENTICATED_SMOKE_INPUT: authInput,
      OPERATOR_APPROVAL_INPUT: approvalInput,
      SEVEN_GREEN_DAYS_INPUT: sevenDaysInput,
    });

    expect(report).toMatchObject({
      ok: false,
      status: "blocked",
      summary: {
        total: 6,
        passed: 5,
        skipped: 1,
        failed: 0,
      },
    });
    expect(report.tasks.find((task: { id: string }) => task.id === "betterstack-cutover-green")).toMatchObject({
      status: "skipped",
      reason: "Skipped by --skip-betterstack.",
    });

    const d1Report = JSON.parse(
      await readFile(path.join(reportsDir, "phase-07-d1-import-validation_21-06-26.json"), "utf8")
    );
    const r2Report = JSON.parse(
      await readFile(path.join(reportsDir, "phase-07-r2-manifest-validation_21-06-26.json"), "utf8")
    );
    const authReport = JSON.parse(
      await readFile(path.join(reportsDir, "phase-07-authenticated-smoke_21-06-26.json"), "utf8")
    );
    const approvalReport = JSON.parse(
      await readFile(path.join(reportsDir, "phase-07-operator-cutover-approval_21-06-26.json"), "utf8")
    );
    const sevenDaysReport = JSON.parse(
      await readFile(path.join(reportsDir, "phase-08-seven-green-days_21-06-26.json"), "utf8")
    );

    expect(d1Report.ok).toBe(true);
    expect(r2Report.ok).toBe(true);
    expect(authReport.ok).toBe(true);
    expect(approvalReport.cutover_approved).toBe(true);
    expect(sevenDaysReport.green_days_verified).toBe(true);
  });
});
