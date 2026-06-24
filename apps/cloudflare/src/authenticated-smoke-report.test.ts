/**
 * @license
 * Copyright (c) 2023-present, Plane
 *
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  REQUIRED_AUTHENTICATED_SMOKE_CHECKS,
  buildAuthenticatedSmokeInputTemplate,
  buildAuthenticatedSmokeReport,
  validateAuthenticatedSmokeReport,
} from "../tools/authenticated-smoke-report.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(packageRoot, "../..");
const generatedAt = "2026-06-24T08:00:00.000Z";
const observedAt = "2026-06-24T08:01:00.000Z";
const tempDirs: string[] = [];

function workspaceUrl(pathname: string) {
  return `https://app.manut.xyz/workspaces/gogocash${pathname}`;
}

function passingInput() {
  return {
    actor: "operator@example.com",
    target_origin: "https://app.manut.xyz",
    cloudflare_route_verified: true,
    cloudflare_route_evidence: {
      url: "https://app.manut.xyz/cdn-cgi/trace",
      note: "cf-ray captured while the operator browser was logged into the production workspace.",
    },
    operator_evidence_required: true,
    operator_evidence: {
      run_id: "auth-smoke-2026-06-24",
      workspace_identifier: "gogocash",
      authenticated_workspace_url: workspaceUrl("/projects"),
      user_identity_redacted: "operator user menu visible with redacted email",
      browser_artifact: "process/features/cloudflare-stack-migration/reports/auth-smoke-workspace.png",
      note: "Workspace sidebar and account switcher were visible after hard refresh.",
    },
    checks: REQUIRED_AUTHENTICATED_SMOKE_CHECKS.map((check) => ({
      id: check.id,
      ok: true,
      evidence: {
        artifact: `process/features/cloudflare-stack-migration/reports/auth-smoke-${check.id}.png`,
        note: `${check.label} captured from a logged-in production browser.`,
      },
      observed_at: observedAt,
      url: workspaceUrl(`/authenticated-smoke/${check.id}`),
      note: "Captured from logged-in operator browser.",
      title: "Manut workspace",
    })),
  };
}

async function tempPath(name: string) {
  const dir = await mkdtemp(path.join(tmpdir(), "auth-smoke-"));
  tempDirs.push(dir);
  return path.join(dir, name);
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

describe("authenticated smoke report", () => {
  it("builds a non-passing operator input template for every required workflow", () => {
    const template = buildAuthenticatedSmokeInputTemplate(generatedAt);

    expect(template).toMatchObject({
      template_kind: "authenticated-smoke-input",
      schema_version: 1,
      evidence_model_version: 2,
      generated_at: generatedAt,
      actor: "",
      target_origin: "https://app.manut.xyz",
      cloudflare_route_verified: false,
      operator_evidence_required: true,
      operator_evidence: {
        run_id: "",
        workspace_identifier: "",
        authenticated_workspace_url: "",
        user_identity_redacted: "",
        browser_artifact: "",
        note: "",
      },
    });
    expect(template.instructions).toContain("real logged-in production smoke run");
    expect(template.checks).toHaveLength(REQUIRED_AUTHENTICATED_SMOKE_CHECKS.length);
    expect(template.checks.every((check) => check.ok === false && check.evidence === "")).toBe(true);
  });

  it("passes only when every workflow has authenticated operator evidence", () => {
    const report = buildAuthenticatedSmokeReport(passingInput(), generatedAt);

    expect(report).toMatchObject({
      generated_at: generatedAt,
      evidence_kind: "authenticated-smoke",
      ok: true,
      target_origin: "https://app.manut.xyz",
      actor: "operator@example.com",
      cloudflare_route_verified: true,
      operator_evidence_verified: true,
      summary: {
        total: REQUIRED_AUTHENTICATED_SMOKE_CHECKS.length,
        passed: REQUIRED_AUTHENTICATED_SMOKE_CHECKS.length,
        failed: 0,
      },
      errors: [],
    });
    expect(report.checks.every((check) => check.ok && check.status === "pass")).toBe(true);
    expect(validateAuthenticatedSmokeReport(report)).toEqual({ ok: true });
  });

  it("accepts legacy check maps when they still contain real production evidence", () => {
    const input = passingInput();
    input.checks = Object.fromEntries(input.checks.map((check) => [check.id, check])) as never;

    const report = buildAuthenticatedSmokeReport(input, generatedAt);

    expect(report.ok).toBe(true);
    expect(report.operator_evidence_verified).toBe(true);
    expect(validateAuthenticatedSmokeReport(report)).toEqual({ ok: true });
  });

  it("blocks legacy check maps without operator session evidence", () => {
    const input = passingInput();
    input.operator_evidence_required = false;
    delete (input as Partial<typeof input>).operator_evidence;
    input.checks = Object.fromEntries(input.checks.map((check) => [check.id, check])) as never;

    const report = buildAuthenticatedSmokeReport(input, generatedAt);

    expect(report.ok).toBe(false);
    expect(report.operator_evidence_verified).toBe(false);
    expect(report.errors).toContain("operator_evidence_missing");
    expect(validateAuthenticatedSmokeReport(report)).toMatchObject({
      ok: false,
      errors: expect.arrayContaining(["operator_evidence_missing"]),
    });
  });

  it("blocks reports missing a required workflow", () => {
    const input = passingInput();
    input.checks = input.checks.filter((check) => check.id !== "login");

    const report = buildAuthenticatedSmokeReport(input, generatedAt);

    expect(report).toMatchObject({
      ok: false,
      summary: {
        total: REQUIRED_AUTHENTICATED_SMOKE_CHECKS.length,
        passed: REQUIRED_AUTHENTICATED_SMOKE_CHECKS.length - 1,
        failed: 1,
      },
    });
    expect(report.checks.find((check) => check.id === "login")).toMatchObject({
      ok: false,
      status: "missing",
    });
    expect(report.errors).toContain("Authenticated smoke report is missing login.");
  });

  it("blocks missing required operator workspace evidence", () => {
    const input = passingInput();
    input.operator_evidence.authenticated_workspace_url = "";

    const report = buildAuthenticatedSmokeReport(input, generatedAt);

    expect(report.ok).toBe(false);
    expect(report.operator_evidence_verified).toBe(false);
    expect(report.errors).toContain("operator_authenticated_workspace_url_missing");
  });

  it("blocks public, unauthenticated, or auth-page evidence from passing", () => {
    const input = passingInput();
    input.checks[0] = {
      ...input.checks[0],
      evidence: {
        artifact: "signup-page.png",
        note: "Prior probe reached Sign up - Manut.",
      },
      url: "https://app.manut.xyz/sign-up",
      title: "Sign up - Manut",
    };

    const report = buildAuthenticatedSmokeReport(input, generatedAt);

    expect(report.ok).toBe(false);
    expect(report.checks[0]).toMatchObject({
      ok: false,
      status: "public_probe_url",
    });
    expect(report.checks[0].blockers).toContain("unauthenticated_evidence");
  });

  it("blocks public API probes even when they return production URLs", () => {
    const input = passingInput();
    input.checks[1] = {
      ...input.checks[1],
      evidence: "GET /api/instances returned 200",
      url: "https://app.manut.xyz/api/instances/",
    };

    const report = buildAuthenticatedSmokeReport(input, generatedAt);

    expect(report.ok).toBe(false);
    expect(report.checks[1]).toMatchObject({
      ok: false,
      status: "public_probe_url",
    });
    expect(report.checks[1].blockers).toContain("unauthenticated_evidence");
  });

  it("requires production target and per-check production URLs", () => {
    const input = passingInput();
    input.target_origin = "https://staging.manut.xyz";
    input.checks[0] = {
      ...input.checks[0],
      url: "https://staging.manut.xyz/workspaces/gogocash",
    };

    const report = buildAuthenticatedSmokeReport(input, generatedAt);

    expect(report.ok).toBe(false);
    expect(report.target_origin).toBe("https://staging.manut.xyz");
    expect(report.errors).toContain("Authenticated smoke report target_origin must be https://app.manut.xyz.");
    expect(report.checks[0]).toMatchObject({
      ok: false,
      status: "url_not_production",
    });
  });

  it("requires Cloudflare route provenance before passing smoke", () => {
    const input = passingInput();
    input.cloudflare_route_verified = false;
    input.cloudflare_route_evidence = {};

    const report = buildAuthenticatedSmokeReport(input, generatedAt);

    expect(report.ok).toBe(false);
    expect(report.errors).toContain("Authenticated smoke report must set cloudflare_route_verified: true.");
    expect(report.errors).toContain("Cloudflare route evidence is required.");
  });

  it("requires timestamps and meaningful evidence for every check", () => {
    const input = passingInput();
    input.checks[0] = {
      ...input.checks[0],
      evidence: { url: "", note: " " },
      observed_at: "",
    };

    const report = buildAuthenticatedSmokeReport(input, generatedAt);

    expect(report.ok).toBe(false);
    expect(report.checks[0]).toMatchObject({
      ok: false,
      status: "evidence_missing",
    });
    expect(report.checks[0].blockers).toContain("observed_at_missing");
  });

  it("writes a canonical report from CLI input and exits zero only when passing", async () => {
    const inputPath = await tempPath("manual-evidence.json");
    const relativeOutPath = "process/features/cloudflare-stack-migration/reports/.tmp-auth-smoke-report.json";
    const repoOutPath = path.join(repoRoot, relativeOutPath);
    await writeFile(inputPath, JSON.stringify(passingInput()), "utf8");

    const result = spawnSync(
      "node",
      ["tools/authenticated-smoke-report.mjs", "--input", inputPath, "--json", "--out", relativeOutPath],
      { cwd: packageRoot, encoding: "utf8" }
    );

    expect(result.status).toBe(0);
    const stdoutReport = JSON.parse(result.stdout);
    const fileReport = JSON.parse(await readFile(repoOutPath, "utf8"));
    expect(stdoutReport.ok).toBe(true);
    expect(fileReport.ok).toBe(true);
    await rm(repoOutPath, { force: true });
  });

  it("writes blocked CLI evidence and exits non-zero for incomplete operator input", async () => {
    const inputPath = await tempPath("manual-evidence.json");
    const relativeOutPath = "process/features/cloudflare-stack-migration/reports/.tmp-auth-smoke-blocked.json";
    const repoOutPath = path.join(repoRoot, relativeOutPath);
    const input = passingInput();
    input.operator_evidence.authenticated_workspace_url = "";
    await writeFile(inputPath, JSON.stringify(input), "utf8");

    const result = spawnSync(
      "node",
      ["tools/authenticated-smoke-report.mjs", "--input", inputPath, "--json", "--out", relativeOutPath],
      { cwd: packageRoot, encoding: "utf8" }
    );

    expect(result.status).toBe(1);
    const stdoutReport = JSON.parse(result.stdout);
    const fileReport = JSON.parse(await readFile(repoOutPath, "utf8"));
    expect(stdoutReport.ok).toBe(false);
    expect(fileReport.errors).toContain("operator_authenticated_workspace_url_missing");
    await rm(repoOutPath, { force: true });
  });

  it("prints and writes the operator input template from the CLI", async () => {
    const relativeOutPath = "process/features/cloudflare-stack-migration/reports/.tmp-auth-smoke-template.json";
    const repoOutPath = path.join(repoRoot, relativeOutPath);

    const jsonResult = spawnSync(
      "node",
      ["tools/authenticated-smoke-report.mjs", "--template", "--json", "--out", relativeOutPath],
      { cwd: packageRoot, encoding: "utf8" }
    );

    expect(jsonResult.status).toBe(0);
    expect(JSON.parse(jsonResult.stdout)).toMatchObject({
      template_kind: "authenticated-smoke-input",
      operator_evidence_required: true,
    });
    expect(JSON.parse(await readFile(repoOutPath, "utf8"))).toMatchObject({
      template_kind: "authenticated-smoke-input",
      operator_evidence_required: true,
    });
    await rm(repoOutPath, { force: true });

    const textResult = spawnSync("node", ["tools/authenticated-smoke-report.mjs", "--template"], {
      cwd: packageRoot,
      encoding: "utf8",
    });
    expect(textResult.status).toBe(0);
    expect(textResult.stdout).toContain("Authenticated smoke input template");
    expect(textResult.stdout).toContain(`Checks: ${REQUIRED_AUTHENTICATED_SMOKE_CHECKS.length}`);
  });
});
