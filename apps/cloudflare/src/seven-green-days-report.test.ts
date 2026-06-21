import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  REQUIRED_SEVEN_GREEN_DAYS_CHECKS,
  buildSevenGreenDaysReport,
  validateSevenGreenDaysReport,
} from "../tools/seven-green-days-report.mjs";

const packageRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(packageRoot, "..", "..");

function passingInput() {
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

describe("seven green days report", () => {
  it("passes only when the stability window covers at least seven days with all required evidence", () => {
    const report = buildSevenGreenDaysReport(passingInput());

    expect(report).toMatchObject({
      ok: true,
      green_days_verified: true,
      stability_window_days: 7,
      summary: {
        total: REQUIRED_SEVEN_GREEN_DAYS_CHECKS.length,
        failed: 0,
      },
    });
    expect(validateSevenGreenDaysReport(report)).toEqual({ ok: true });
  });

  it("blocks windows shorter than seven days", () => {
    const report = buildSevenGreenDaysReport({
      ...passingInput(),
      verified_through: "2026-06-27T23:59:59.000Z",
    });

    expect(report).toMatchObject({
      ok: false,
      green_days_verified: false,
      validation_error: "Seven green days report must cover at least 7 full days after cutover.",
    });
  });

  it("blocks reports missing a required evidence check", () => {
    const input = passingInput();
    input.checks = input.checks.filter((check) => check.id !== "cloudflare-worker-logs");

    const report = buildSevenGreenDaysReport(input);

    expect(report).toMatchObject({
      ok: false,
      validation_error: "Seven green days report is missing cloudflare-worker-logs.",
    });
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        id: "cloudflare-worker-logs",
        status: "missing",
      })
    );
  });

  it("blocks object evidence without meaningful values", () => {
    const input = passingInput();
    input.checks[0] = { ...input.checks[0], evidence: { url: "", note: " " } };

    const report = buildSevenGreenDaysReport(input);

    expect(report).toMatchObject({
      ok: false,
      green_days_verified: false,
      validation_error: "Seven green days check betterstack-monitors is missing evidence.",
    });
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "betterstack-monitors",
          status: "evidence_missing",
        }),
      ])
    );
  });

  it("requires an explicit production target origin", () => {
    const input = passingInput();
    delete input.target_origin;

    const report = buildSevenGreenDaysReport(input);

    expect(report).toMatchObject({
      ok: false,
      green_days_verified: false,
      target_origin: null,
      validation_error: "Seven green days report target_origin must be https://app.manut.xyz.",
    });
  });

  it("rejects seven-green-days evidence captured against a non-production origin", () => {
    const input = passingInput();
    input.target_origin = "https://staging.manut.xyz";

    const report = buildSevenGreenDaysReport(input);

    expect(report).toMatchObject({
      ok: false,
      green_days_verified: false,
      target_origin: "https://staging.manut.xyz",
      validation_error: "Seven green days report target_origin must be https://app.manut.xyz.",
    });
  });

  it("writes repo-root-relative reports when run through the package", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-seven-green-days-"));
    const inputPath = path.join(root, "phase8-evidence.json");
    const relativeOutPath = `.tmp/${path.basename(root)}/phase8-seven-green-days.json`;
    const repoOutPath = path.join(repoRoot, relativeOutPath);

    await rm(path.dirname(repoOutPath), { recursive: true, force: true });
    await writeFile(inputPath, JSON.stringify(passingInput()));

    const stdout = execFileSync(
      "node",
      ["tools/seven-green-days-report.mjs", "--input", inputPath, "--json", "--out", relativeOutPath],
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
