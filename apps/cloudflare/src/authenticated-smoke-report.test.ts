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
      validation_error: "Evidence JSON must contain ok: true.",
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
