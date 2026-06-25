/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { REQUIRED_AUTHENTICATED_SMOKE_CHECKS } from "../tools/authenticated-smoke-report.mjs";
import { REQUIRED_OPERATOR_APPROVAL_CHECKS } from "../tools/operator-approval-report.mjs";
import { REQUIRED_SEVEN_GREEN_DAYS_CHECKS } from "../tools/seven-green-days-report.mjs";
import {
  buildD1ValidationRelationshipChecks,
  D1_VALIDATION_FIXTURE_COUNTS,
} from "../tools/d1-import-validation-queries.mjs";

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
    cloudflare_route_verified: true,
    cloudflare_route_evidence: {
      edge_header: "x-manut-cloudflare-phase",
      worker_url: "https://manut-app.bettergogocash.workers.dev",
    },
    operator_evidence_required: true,
    operator_evidence: {
      run_id: "auth-smoke-20260621",
      workspace_identifier: "gogocash",
      authenticated_workspace_url: "https://app.manut.xyz/workspaces/gogocash",
      user_identity_redacted: "operator@example.com redacted",
      browser_artifact: "process/features/cloudflare-stack-migration/reports/auth-smoke.png",
    },
    checks: REQUIRED_AUTHENTICATED_SMOKE_CHECKS.map((check) => ({
      id: check.id,
      ok: true,
      evidence: `verified ${check.id}`,
      observed_at: "2026-06-21T12:00:00.000Z",
      url: `https://app.manut.xyz/smoke/${check.id}`,
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
    operator_inputs: {
      maintenance_window: {
        announcement_url: "https://changes.example.com/manut-cutover-window",
        owner: "operator@example.com",
      },
      rollback_checkpoint: {
        rollback_target: "GKE production service before Cloudflare routing change",
        rollback_command: "kubectl rollout undo deployment/manut-app",
        checkpoint_evidence_path: "process/features/cloudflare-stack-migration/reports/rollback-checkpoint.json",
        owner: "operator@example.com",
      },
      dns_routing: {
        change_ticket_url: "https://changes.example.com/manut-dns-routing",
        current_origin: "https://gcp.manut.xyz",
        cutover_origin: "https://app.manut.xyz",
        routing_owner: "operator@example.com",
      },
      write_freeze: {
        start_at: "2026-06-21T12:55:00.000Z",
        end_at: "2026-06-21T14:05:00.000Z",
        announcement_url: "https://changes.example.com/manut-write-freeze",
        coordinator: "operator@example.com",
      },
      smoke_readiness: {
        public_smoke_command: "pnpm --filter @manut/cloudflare smoke:worker",
        authenticated_smoke_command: "pnpm --filter @manut/cloudflare auth:smoke-report",
        evidence_path: "process/features/cloudflare-stack-migration/reports/phase-07-authenticated-smoke_21-06-26.json",
        owner: "operator@example.com",
      },
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
    phase7_readiness: {
      ok: true,
      status: "ready",
      verified_at: "2026-06-28T00:00:00.000Z",
      evidence: "Phase 7 cutover readiness command returned ready with zero selected blockers.",
      command: "pnpm --silent --filter @manut/cloudflare cutover:readiness -- --phase phase-07 --json",
      report_path:
        "process/features/cloudflare-stack-migration/reports/phase-07-production-cutover-readiness_21-06-26.md",
    },
    checks: REQUIRED_SEVEN_GREEN_DAYS_CHECKS.map((check) => ({
      id: check.id,
      ok: true,
      evidence: `verified ${check.id}`,
      observed_at: "2026-06-28T00:00:00.000Z",
    })),
  };
}

function betterStackReportPayload() {
  return {
    ok: true,
    evidence_kind: "betterstack-cutover",
    monitor_source: "betterstack-api",
    monitor_summary: { total: 3, passed: 3, failed: 0 },
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

  it("requires endpoint probes when collecting Better Stack cutover evidence", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-evidence-bundle-"));
    const reportsDir = path.join(root, "reports");

    const report = runBundle(["--json", "--dry-run", "--reports-dir", reportsDir], {
      BETTERSTACK_API_TOKEN: "token",
    });
    const task = report.tasks.find((item: { id: string }) => item.id === "betterstack-cutover-green");

    expect(task).toMatchObject({
      status: "skipped",
      reason: "Dry run: command was not executed.",
    });
    expect(task.command).toContain("--require-endpoint-probes");
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

    await writeFile(sourceCounts, JSON.stringify(D1_VALIDATION_FIXTURE_COUNTS), "utf8");
    await writeFile(d1Counts, JSON.stringify(D1_VALIDATION_FIXTURE_COUNTS), "utf8");
    await writeFile(
      relationships,
      JSON.stringify({
        checks: buildD1ValidationRelationshipChecks(),
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

  it("imports an existing canonical Better Stack report without requiring the API token", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-evidence-bundle-"));
    const reportsDir = path.join(root, "reports");
    const existingReport = path.join(root, "existing-betterstack-report.json");

    await writeFile(existingReport, JSON.stringify(betterStackReportPayload()), "utf8");

    const report = runBundle(["--json", "--reports-dir", reportsDir, "--soft-fail"], {
      BETTERSTACK_CUTOVER_REPORT: existingReport,
    });
    const task = report.tasks.find((item: { id: string }) => item.id === "betterstack-cutover-green");
    const importedReport = JSON.parse(
      await readFile(path.join(reportsDir, "phase-07-betterstack-cutover_21-06-26.json"), "utf8")
    );

    expect(task).toMatchObject({
      status: "pass",
      imported_from_env: "BETTERSTACK_CUTOVER_REPORT",
      report_ok: true,
    });
    expect(importedReport).toMatchObject({
      ok: true,
      evidence_kind: "betterstack-cutover",
    });
    expect(report.summary).toMatchObject({
      passed: 1,
      skipped: 5,
      failed: 0,
    });
  });

  it("rejects imported reports that do not satisfy the expected evidence contract", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-evidence-bundle-"));
    const reportsDir = path.join(root, "reports");
    const existingReport = path.join(root, "wrong-kind-report.json");

    await writeFile(
      existingReport,
      JSON.stringify({
        ok: true,
        evidence_kind: "authenticated-smoke",
      }),
      "utf8"
    );

    const report = runBundle(["--json", "--reports-dir", reportsDir, "--soft-fail"], {
      BETTERSTACK_CUTOVER_REPORT: existingReport,
    });
    const task = report.tasks.find((item: { id: string }) => item.id === "betterstack-cutover-green");

    expect(task).toMatchObject({
      status: "fail",
      imported_from_env: "BETTERSTACK_CUTOVER_REPORT",
      remediation: "Better Stack report must include monitor_summary.",
    });
    expect(report.summary).toMatchObject({
      passed: 0,
      skipped: 5,
      failed: 1,
    });
  });

  it("accepts an existing report that is already in the canonical evidence location", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-evidence-bundle-"));
    const reportsDir = path.join(root, "reports");
    const existingReport = path.join(reportsDir, "phase-07-betterstack-cutover_21-06-26.json");

    await mkdir(reportsDir, { recursive: true });
    await writeFile(existingReport, JSON.stringify(betterStackReportPayload()), "utf8");

    const report = runBundle(["--json", "--reports-dir", reportsDir, "--soft-fail"], {
      BETTERSTACK_CUTOVER_REPORT: existingReport,
    });
    const task = report.tasks.find((item: { id: string }) => item.id === "betterstack-cutover-green");
    const canonicalReport = JSON.parse(await readFile(existingReport, "utf8"));

    expect(task).toMatchObject({
      status: "pass",
      imported_from_env: "BETTERSTACK_CUTOVER_REPORT",
      already_canonical: true,
      report_ok: true,
    });
    expect(canonicalReport).toMatchObject({
      ok: true,
      evidence_kind: "betterstack-cutover",
    });
  });
});
