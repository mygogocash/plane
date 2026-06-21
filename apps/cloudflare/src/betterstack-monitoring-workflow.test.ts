import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..", "..", "..");

describe("Better Stack Monitoring workflow", () => {
  it("summarizes the cutover report artifact state", () => {
    const workflow = readFileSync(path.join(repoRoot, ".github", "workflows", "betterstack-monitoring.yml"), "utf8");

    expect(workflow).toContain(".github/ops/betterstack/summarize-cutover-report.sh");
    expect(workflow).toContain("phase-07-betterstack-cutover_21-06-26.json");
    expect(workflow).toContain("--soft-fail");
  });
});
