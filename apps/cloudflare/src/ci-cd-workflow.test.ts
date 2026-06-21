import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..", "..", "..");

describe("Manut CI/CD workflow", () => {
  it("treats Better Stack monitoring files as Cloudflare-only changes", () => {
    const workflow = readFileSync(path.join(repoRoot, ".github", "workflows", "ci-cd.yml"), "utf8");

    expect(workflow).toContain(".github/ops/betterstack/*");
    expect(workflow).toContain(".github/ops/betterstack/**");
    expect(workflow).toContain(".github/workflows/betterstack-monitoring.yml");
  });

  it("does not treat the GKE deploy workflow itself as Cloudflare-only", () => {
    const workflow = readFileSync(path.join(repoRoot, ".github", "workflows", "ci-cd.yml"), "utf8");

    expect(workflow).not.toContain(".github/workflows/ci-cd.yml|");
  });

  it("does not fail production smoke on the first transient connection failure", () => {
    const workflow = readFileSync(path.join(repoRoot, ".github", "workflows", "ci-cd.yml"), "utf8");

    expect(workflow).toContain("Waiting ${delay_seconds}s before production smoke");
    expect(workflow).toContain("successful_samples=0");
    expect(workflow).toContain("Production smoke never passed after ${samples} samples.");
  });
});
