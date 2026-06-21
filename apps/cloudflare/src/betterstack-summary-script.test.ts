import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

import { describe, expect, it } from "vitest";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, "..", "..", "..");
const summaryScript = path.join(repoRoot, ".github", "ops", "betterstack", "summarize-cutover-report.sh");

function runSummaryScript(reportPath: string, summaryPath: string) {
  return new Promise<{ stdout: string; stderr: string; code: number | null }>((resolve) => {
    const child = spawn("bash", [summaryScript, reportPath], {
      cwd: repoRoot,
      env: {
        ...process.env,
        GITHUB_STEP_SUMMARY: summaryPath,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => {
      resolve({ stdout, stderr, code });
    });
  });
}

describe("Better Stack cutover summary script", () => {
  it("surfaces a blocked cutover report without failing the deploy job", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "betterstack-summary-"));
    const reportPath = path.join(tempDir, "phase-07-betterstack-cutover.json");
    const summaryPath = path.join(tempDir, "summary.md");

    await writeFile(
      reportPath,
      JSON.stringify({
        ok: false,
        monitor_summary: { total: 3, passed: 0, failed: 3 },
        endpoint_summary: { total: 3, passed: 2, failed: 1 },
      }),
      "utf8"
    );
    await chmod(summaryScript, 0o755).catch(() => undefined);

    const result = await runSummaryScript(reportPath, summaryPath);

    expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain("Better Stack cutover report is blocked");
    expect(await readFile(summaryPath, "utf8")).toContain("Cutover report status: `blocked`");
  });

  it("records missing report files as blocked evidence", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "betterstack-summary-"));
    const summaryPath = path.join(tempDir, "summary.md");
    const missingReportPath = path.join(tempDir, "missing.json");

    await chmod(summaryScript, 0o755).catch(() => undefined);

    const result = await runSummaryScript(missingReportPath, summaryPath);

    expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain("Better Stack cutover report was not generated");
    expect(await readFile(summaryPath, "utf8")).toContain("Cutover report status: `missing`");
  });
});
