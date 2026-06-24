/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  REQUIRED_OPERATOR_APPROVAL_CHECKS,
  buildOperatorApprovalInputTemplate,
  buildOperatorApprovalReport,
  validateOperatorApprovalReport,
} from "../tools/operator-approval-report.mjs";

const packageRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(packageRoot, "..", "..");

function passingInput() {
  return {
    schema_version: 2,
    approved_by: "operator@example.com",
    approved_at: "2026-06-21T12:00:00.000Z",
    target_origin: "https://app.manut.xyz",
    maintenance_window: {
      start_at: "2026-06-21T13:00:00.000Z",
      end_at: "2026-06-21T14:00:00.000Z",
    },
    operator_inputs: {
      maintenance_window: {
        announcement_url: "https://calendar.example.com/cutover-window",
        owner: "Ops Commander",
      },
      rollback_checkpoint: {
        rollback_target: "GKE production service before Cloudflare routing change",
        rollback_command: "pnpm --filter @manut/cloudflare cutover:rollback -- --target=gke",
        checkpoint_evidence_path:
          "process/features/cloudflare-stack-migration/reports/phase-07-production-cutover-readiness_21-06-26.md",
        owner: "Platform Operator",
      },
      dns_routing: {
        change_ticket_url: "https://changes.example.com/manut-cutover-gate-123",
        current_origin: "https://gke-app.example.com",
        cutover_origin: "https://app.manut.xyz",
        routing_owner: "DNS Operator",
      },
      write_freeze: {
        start_at: "2026-06-21T12:45:00.000Z",
        end_at: "2026-06-21T14:15:00.000Z",
        announcement_url: "https://status.example.com/write-freeze",
        coordinator: "Ops Coordinator",
      },
      smoke_readiness: {
        public_smoke_command: "pnpm --filter @manut/cloudflare smoke:worker",
        authenticated_smoke_command:
          "pnpm --filter @manut/cloudflare smoke:authenticated -- --origin=https://app.manut.xyz",
        evidence_path: "process/features/cloudflare-stack-migration/reports/phase-07-authenticated-smoke_21-06-26.json",
        owner: "QA Operator",
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

describe("operator approval report", () => {
  it("builds a non-passing operator approval input template for every required check", () => {
    const template = buildOperatorApprovalInputTemplate({ generatedAt: "2026-06-22T00:00:00.000Z" });

    expect(template).toMatchObject({
      template_kind: "operator-approval-input",
      schema_version: 2,
      generated_at: "2026-06-22T00:00:00.000Z",
      approved_by: "",
      approved_at: "",
      target_origin: "https://app.manut.xyz",
      maintenance_window: {
        start_at: "",
        end_at: "",
      },
      operator_inputs: {
        rollback_checkpoint: {
          rollback_target: "",
          rollback_command: "",
          checkpoint_evidence_path: "",
          owner: "",
        },
        dns_routing: {
          change_ticket_url: "",
          current_origin: "",
          cutover_origin: "",
          routing_owner: "",
        },
        smoke_readiness: {
          public_smoke_command: "",
          authenticated_smoke_command: "",
          evidence_path: "",
          owner: "",
        },
      },
    });
    expect(template.checks).toHaveLength(REQUIRED_OPERATOR_APPROVAL_CHECKS.length);
    expect(template.checks.find((check) => check.id === "maintenance-window-announced")).toMatchObject({
      required_inputs: [
        { path: "maintenance_window.start_at", label: "Maintenance window start timestamp" },
        { path: "maintenance_window.end_at", label: "Maintenance window end timestamp" },
        {
          path: "operator_inputs.maintenance_window.announcement_url",
          label: "Maintenance announcement or calendar URL",
        },
        { path: "operator_inputs.maintenance_window.owner", label: "Maintenance-window operator owner" },
      ],
    });
    expect(template.checks.map((check) => check.id)).toEqual(
      REQUIRED_OPERATOR_APPROVAL_CHECKS.map((check) => check.id)
    );
    expect(buildOperatorApprovalReport(template)).toMatchObject({
      ok: false,
      cutover_approved: false,
      validation_error: "Operator approval check maintenance-window-announced is not passing.",
    });
  });

  it("passes only when every required cutover approval check has evidence", () => {
    const report = buildOperatorApprovalReport(passingInput());

    expect(report).toMatchObject({
      ok: true,
      cutover_approved: true,
      decision_complete: true,
      approved_by: "operator@example.com",
      summary: {
        total: REQUIRED_OPERATOR_APPROVAL_CHECKS.length,
        failed: 0,
        remaining_operator_inputs: 0,
      },
      remaining_operator_inputs: [],
    });
    expect(validateOperatorApprovalReport(report)).toEqual({ ok: true });
  });

  it("blocks approval when a required rollback operator input is missing", () => {
    const input = passingInput();
    input.operator_inputs.rollback_checkpoint.rollback_command = "";

    const report = buildOperatorApprovalReport(input);

    expect(report).toMatchObject({
      ok: false,
      cutover_approved: false,
      decision_complete: false,
      validation_error:
        "Operator approval check rollback-checkpoint-confirmed is missing operator input operator_inputs.rollback_checkpoint.rollback_command.",
    });
    expect(report.remaining_operator_inputs).toContainEqual({
      check_id: "rollback-checkpoint-confirmed",
      path: "operator_inputs.rollback_checkpoint.rollback_command",
      label: "Rollback command or runbook step",
    });
  });

  it("blocks reports without an approver identity", () => {
    const input = passingInput();
    input.approved_by = "";

    const report = buildOperatorApprovalReport(input);

    expect(report).toMatchObject({
      ok: false,
      validation_error: "Operator approval report must include approved_by.",
    });
  });

  it("blocks reports without the production target origin", () => {
    const input = passingInput();
    delete input.target_origin;

    const report = buildOperatorApprovalReport(input);

    expect(report).toMatchObject({
      ok: false,
      validation_error: "Operator approval report target_origin must be https://app.manut.xyz.",
    });
  });

  it("blocks reports missing a required approval check", () => {
    const input = passingInput();
    input.checks = input.checks.filter((check) => check.id !== "rollback-checkpoint-confirmed");

    const report = buildOperatorApprovalReport(input);

    expect(report).toMatchObject({
      ok: false,
      validation_error: "Operator approval report is missing rollback-checkpoint-confirmed.",
    });
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        id: "rollback-checkpoint-confirmed",
        status: "missing",
      })
    );
  });

  it("blocks object evidence that has no meaningful values", () => {
    const input = passingInput();
    const dnsApproval = input.checks.find((check) => check.id === "dns-change-approved");
    dnsApproval.evidence = { url: "", note: "  " };

    const report = buildOperatorApprovalReport(input);

    expect(report).toMatchObject({
      ok: false,
      validation_error: "Operator approval check dns-change-approved is missing evidence.",
    });
  });

  it("requires every operator approval check to include an observation timestamp", () => {
    const input = passingInput();
    const writeFreeze = input.checks.find((check) => check.id === "write-freeze-confirmed");
    delete writeFreeze.observed_at;

    const report = buildOperatorApprovalReport(input);

    expect(report).toMatchObject({
      ok: false,
      cutover_approved: false,
      validation_error: "Operator approval report must include checks.write-freeze-confirmed.observed_at.",
    });
  });

  it("writes repo-root-relative reports when run through the package", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-operator-approval-"));
    const inputPath = path.join(root, "approval-evidence.json");
    const relativeOutPath = `.tmp/${path.basename(root)}/operator-approval.json`;
    const repoOutPath = path.join(repoRoot, relativeOutPath);

    await rm(path.dirname(repoOutPath), { recursive: true, force: true });
    await writeFile(inputPath, JSON.stringify(passingInput()));

    const stdout = execFileSync(
      "node",
      ["tools/operator-approval-report.mjs", "--input", inputPath, "--json", "--out", relativeOutPath],
      {
        cwd: packageRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
    const stdoutReport = JSON.parse(stdout);
    const fileReport = JSON.parse(await readFile(repoOutPath, "utf8"));

    await rm(path.dirname(repoOutPath), { recursive: true, force: true });

    expect(stdoutReport.ok).toBe(true);
    expect(fileReport.ok).toBe(true);
  });

  it("writes an operator approval input template from the CLI", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-operator-approval-template-"));
    const relativeOutPath = `.tmp/${path.basename(root)}/operator-approval-template.json`;
    const repoOutPath = path.join(repoRoot, relativeOutPath);

    await rm(path.dirname(repoOutPath), { recursive: true, force: true });

    const stdout = execFileSync(
      "node",
      ["tools/operator-approval-report.mjs", "--template", "--json", "--out", relativeOutPath],
      {
        cwd: packageRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
    const stdoutTemplate = JSON.parse(stdout);
    const fileTemplate = JSON.parse(await readFile(repoOutPath, "utf8"));

    await rm(path.dirname(repoOutPath), { recursive: true, force: true });

    expect(stdoutTemplate).toMatchObject({
      template_kind: "operator-approval-input",
      target_origin: "https://app.manut.xyz",
    });
    expect(fileTemplate.checks).toHaveLength(REQUIRED_OPERATOR_APPROVAL_CHECKS.length);
  });

  it("prints a human template summary when the CLI template mode is not JSON", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-operator-approval-template-human-"));
    const relativeOutPath = `.tmp/${path.basename(root)}/operator-approval-template.json`;
    const repoOutPath = path.join(repoRoot, relativeOutPath);

    await rm(path.dirname(repoOutPath), { recursive: true, force: true });

    const stdout = execFileSync(
      "node",
      ["tools/operator-approval-report.mjs", "--template", "--out", relativeOutPath],
      {
        cwd: packageRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
    const fileTemplate = JSON.parse(await readFile(repoOutPath, "utf8"));

    await rm(path.dirname(repoOutPath), { recursive: true, force: true });

    expect(stdout).toContain("Operator approval input template");
    expect(stdout).toContain(`Checks: ${REQUIRED_OPERATOR_APPROVAL_CHECKS.length}`);
    expect(fileTemplate).toMatchObject({
      template_kind: "operator-approval-input",
      target_origin: "https://app.manut.xyz",
    });
  });
});
