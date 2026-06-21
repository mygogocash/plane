import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

function runReadiness(root: string, env: NodeJS.ProcessEnv = {}) {
  try {
    const stdout = execFileSync("node", ["tools/cutover-readiness.mjs", "--json", "--root", root], {
      cwd: path.resolve(__dirname, ".."),
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

describe("cutover readiness evidence gate", () => {
  it("rejects env-pointed JSON evidence unless it explicitly reports ok true", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-cutover-gate-"));
    const evidencePath = path.join(root, "d1-import.json");
    await writeFile(evidencePath, JSON.stringify({ ok: false, reason: "counts differ" }));

    const report = runReadiness(root, {
      D1_IMPORT_VALIDATION_REPORT: evidencePath,
    });
    const check = report.checks.find((item: { id: string }) => item.id === "d1-import-validation");

    expect(check).toMatchObject({
      status: "blocked",
      remediation: "Evidence JSON must contain ok: true.",
    });
  });

  it("uses canonical production deploy evidence when no env override is set", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-cutover-gate-"));
    const reportDir = path.join(root, "process/features/cloudflare-stack-migration/reports");
    await mkdir(reportDir, { recursive: true });
    await writeFile(
      path.join(reportDir, "phase-07-cloudflare-production-deploy_21-06-26.json"),
      JSON.stringify({ ok: true })
    );

    const report = runReadiness(root);
    const check = report.checks.find((item: { id: string }) => item.id === "cloudflare-production-deploy");

    expect(check).toMatchObject({
      status: "pass",
      evidence:
        "process/features/cloudflare-stack-migration/reports/phase-07-cloudflare-production-deploy_21-06-26.json",
    });
  });
});
