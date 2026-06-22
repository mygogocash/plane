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

describe("operator approval report", () => {
  it("builds a non-passing operator approval input template for every required check", () => {
    const template = buildOperatorApprovalInputTemplate({ generatedAt: "2026-06-22T00:00:00.000Z" });

    expect(template).toMatchObject({
      template_kind: "operator-approval-input",
      schema_version: 1,
      generated_at: "2026-06-22T00:00:00.000Z",
      approved_by: "",
      approved_at: "",
      target_origin: "https://app.manut.xyz",
      maintenance_window: {
        start_at: "",
        end_at: "",
      },
    });
    expect(template.checks).toHaveLength(REQUIRED_OPERATOR_APPROVAL_CHECKS.length);
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
      approved_by: "operator@example.com",
      summary: {
        total: REQUIRED_OPERATOR_APPROVAL_CHECKS.length,
        failed: 0,
      },
    });
    expect(validateOperatorApprovalReport(report)).toEqual({ ok: true });
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
});
