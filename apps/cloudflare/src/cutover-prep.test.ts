import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("cutover-prep", () => {
  it("runs readiness and returns blocked playbook JSON", () => {
    let stdout = "";
    try {
      stdout = execFileSync("node", ["tools/cutover-prep.mjs", "--json", "--skip-templates", "--skip-evidence"], {
        cwd: packageRoot,
        encoding: "utf8",
      });
    } catch (error) {
      const candidate =
        error && typeof error === "object" && "stdout" in error && typeof error.stdout === "string" ? error.stdout : "";
      if (!candidate.trim()) {
        throw error;
      }
      stdout = candidate;
    }

    const report = JSON.parse(stdout);
    expect(report.readiness.status).toBe("blocked");
    expect(Array.isArray(report.blocked_playbook)).toBe(true);
    expect(report.blocked_playbook.length).toBeGreaterThan(0);
    expect(report.operator_note).toContain("seven elapsed green days");
  });
});
