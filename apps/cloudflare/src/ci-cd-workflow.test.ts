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
});
