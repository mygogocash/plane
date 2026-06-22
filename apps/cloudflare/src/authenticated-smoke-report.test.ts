import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  REQUIRED_AUTHENTICATED_SMOKE_CHECKS,
  buildAuthenticatedSmokeReport,
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
    })),
  };
}

describe("authenticated smoke report", () => {
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
});
