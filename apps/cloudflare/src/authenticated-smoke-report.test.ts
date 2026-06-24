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
  REQUIRED_AUTHENTICATED_SMOKE_CHECKS,
  buildAuthenticatedSmokeReport,
  buildAuthenticatedSmokeInputTemplate,
  validateAuthenticatedSmokeReport,
} from "../tools/authenticated-smoke-report.mjs";

const packageRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(packageRoot, "..", "..");

function passingInput() {
  return {
    actor: "operator@example.com",
    target_origin: "https://app.manut.xyz",
    cloudflare_route_verified: true,
    cloudflare_route_evidence: {
      edge_header: "x-manut-cloudflare-phase",
      worker_url: "https://manut-app.bettergogocash.workers.dev",
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

describe("authenticated smoke report", () => {
  it("builds a non-passing operator input template for every required workflow", () => {
    const template = buildAuthenticatedSmokeInputTemplate({ generatedAt: "2026-06-22T00:00:00.000Z" });

    expect(template).toMatchObject({
      template_kind: "authenticated-smoke-input",
      schema_version: 1,
      generated_at: "2026-06-22T00:00:00.000Z",
      actor: "",
      target_origin: "https://app.manut.xyz",
      cloudflare_route_verified: false,
    });
    expect(template.checks).toHaveLength(REQUIRED_AUTHENTICATED_SMOKE_CHECKS.length);
    expect(template.checks.map((check) => check.id)).toEqual(
      REQUIRED_AUTHENTICATED_SMOKE_CHECKS.map((check) => check.id)
    );
    expect(buildAuthenticatedSmokeReport(template)).toMatchObject({
      ok: false,
      validation_error: "Authenticated smoke check login is not passing.",
    });
  });

  it("passes only when every required authenticated workflow has evidence", () => {
    const report = buildAuthenticatedSmokeReport(passingInput());

    expect(report).toMatchObject({
      ok: true,
      summary: {
        total: REQUIRED_AUTHENTICATED_SMOKE_CHECKS.length,
        failed: 0,
      },
    });
    expect(validateAuthenticatedSmokeReport(report)).toEqual({ ok: true });
  });

  it("blocks reports missing a required workflow", () => {
    const input = passingInput();
    input.checks = input.checks.filter((check) => check.id !== "work-item-delete");

    const report = buildAuthenticatedSmokeReport(input);

    expect(report).toMatchObject({
      ok: false,
      validation_error: "Authenticated smoke report is missing work-item-delete.",
    });
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        id: "work-item-delete",
        status: "missing",
      })
    );
  });

  it("blocks passing checks without evidence", () => {
    const input = passingInput();
    input.checks[0] = { ...input.checks[0], evidence: "" };

    const report = buildAuthenticatedSmokeReport(input);

    expect(report).toMatchObject({
      ok: false,
    });
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "login",
          ok: false,
          status: "evidence_missing",
        }),
      ])
    );
  });

  it("blocks object evidence without meaningful values", () => {
    const input = passingInput();
    input.checks[0] = { ...input.checks[0], evidence: { url: "", note: " " } };

    const report = buildAuthenticatedSmokeReport(input);

    expect(report).toMatchObject({
      ok: false,
      validation_error: "Authenticated smoke check login is missing evidence.",
    });
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "login",
          status: "evidence_missing",
        }),
      ])
    );
  });

  it("requires an explicit production target origin", () => {
    const input = passingInput();
    delete input.target_origin;

    const report = buildAuthenticatedSmokeReport(input);

    expect(report).toMatchObject({
      ok: false,
      target_origin: null,
      validation_error: "Authenticated smoke report target_origin must be https://app.manut.xyz.",
    });
    expect(validateAuthenticatedSmokeReport(report)).toMatchObject({
      ok: false,
      message: "Evidence JSON must contain ok: true.",
    });
  });

  it("rejects authenticated smoke captured against a non-production origin", () => {
    const input = passingInput();
    input.target_origin = "https://staging.manut.xyz";

    const report = buildAuthenticatedSmokeReport(input);

    expect(report).toMatchObject({
      ok: false,
      target_origin: "https://staging.manut.xyz",
      validation_error: "Authenticated smoke report target_origin must be https://app.manut.xyz.",
    });
  });

  it("requires an explicit actor for auditability", () => {
    const input = passingInput();
    input.actor = " ";

    const report = buildAuthenticatedSmokeReport(input);

    expect(report).toMatchObject({
      ok: false,
      validation_error: "Authenticated smoke report must include actor.",
    });
  });

  it("requires Cloudflare route provenance before passing smoke", () => {
    const input = passingInput();
    input.cloudflare_route_verified = false;

    const report = buildAuthenticatedSmokeReport(input);

    expect(report).toMatchObject({
      ok: false,
      validation_error: "Authenticated smoke report must set cloudflare_route_verified: true.",
    });
  });

  it("requires each smoke check to include an observation timestamp", () => {
    const input = passingInput();
    input.checks[0] = { ...input.checks[0], observed_at: null };

    const report = buildAuthenticatedSmokeReport(input);

    expect(report).toMatchObject({
      ok: false,
      validation_error: "Authenticated smoke report must include checks.login.observed_at.",
    });
  });

  it("requires each smoke check to include a production app URL", () => {
    const input = passingInput();
    input.checks[0] = { ...input.checks[0], url: "" };

    const report = buildAuthenticatedSmokeReport(input);

    expect(report).toMatchObject({
      ok: false,
      validation_error: "Authenticated smoke check login must include a production app.manut.xyz URL.",
    });
  });

  it("does not treat a production URL alone as authenticated smoke evidence", () => {
    const input = passingInput();
    delete input.checks[0].evidence;
    input.checks[0] = { ...input.checks[0], url: "https://app.manut.xyz/workspaces/gogocash" };

    const report = buildAuthenticatedSmokeReport(input);

    expect(report).toMatchObject({
      ok: false,
      validation_error: "Authenticated smoke check login is missing evidence.",
    });
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "login",
          url: "https://app.manut.xyz/workspaces/gogocash",
          status: "evidence_missing",
        }),
      ])
    );
  });

  it("rejects per-check smoke URLs from non-production origins", () => {
    const input = passingInput();
    input.checks[0] = { ...input.checks[0], url: "https://staging.manut.xyz/login" };

    const report = buildAuthenticatedSmokeReport(input);

    expect(report).toMatchObject({
      ok: false,
      validation_error: "Authenticated smoke check login must include a production app.manut.xyz URL.",
    });
  });

  it("writes repo-root-relative reports when run through the package", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-auth-smoke-"));
    const inputPath = path.join(root, "manual-evidence.json");
    const relativeOutPath = `.tmp/${path.basename(root)}/auth-smoke.json`;
    const repoOutPath = path.join(repoRoot, relativeOutPath);

    await rm(path.dirname(repoOutPath), { recursive: true, force: true });
    await writeFile(inputPath, JSON.stringify(passingInput()));

    const stdout = execFileSync(
      "node",
      ["tools/authenticated-smoke-report.mjs", "--input", inputPath, "--json", "--out", relativeOutPath],
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

  it("writes an authenticated smoke input template from the CLI", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-auth-smoke-template-"));
    const relativeOutPath = `.tmp/${path.basename(root)}/auth-smoke-template.json`;
    const repoOutPath = path.join(repoRoot, relativeOutPath);

    await rm(path.dirname(repoOutPath), { recursive: true, force: true });

    const stdout = execFileSync(
      "node",
      ["tools/authenticated-smoke-report.mjs", "--template", "--json", "--out", relativeOutPath],
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
      template_kind: "authenticated-smoke-input",
      target_origin: "https://app.manut.xyz",
    });
    expect(fileTemplate.checks).toHaveLength(REQUIRED_AUTHENTICATED_SMOKE_CHECKS.length);
  });

  it("prints a human template summary when the CLI template mode is not JSON", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-auth-smoke-template-human-"));
    const relativeOutPath = `.tmp/${path.basename(root)}/auth-smoke-template.json`;
    const repoOutPath = path.join(repoRoot, relativeOutPath);

    await rm(path.dirname(repoOutPath), { recursive: true, force: true });

    const stdout = execFileSync(
      "node",
      ["tools/authenticated-smoke-report.mjs", "--template", "--out", relativeOutPath],
      {
        cwd: packageRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
    const fileTemplate = JSON.parse(await readFile(repoOutPath, "utf8"));

    await rm(path.dirname(repoOutPath), { recursive: true, force: true });

    expect(stdout).toContain("Authenticated smoke input template");
    expect(stdout).toContain(`Checks: ${REQUIRED_AUTHENTICATED_SMOKE_CHECKS.length}`);
    expect(fileTemplate).toMatchObject({
      template_kind: "authenticated-smoke-input",
      target_origin: "https://app.manut.xyz",
    });
  });
});
