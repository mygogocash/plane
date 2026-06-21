import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..", "..", "..");

describe("Cloudflare CI/CD workflow", () => {
  it("does not require zone credentials for workers.dev deploys", () => {
    const workflow = readFileSync(path.join(repoRoot, ".github", "workflows", "cloudflare-ci-cd.yml"), "utf8");

    expect(workflow).not.toContain('test -n "$CLOUDFLARE_ZONE_ID"');
    expect(workflow).toContain("Required future DNS/cutover variable");
  });

  it("uploads target-specific deploy, smoke, and live-shadow evidence", () => {
    const workflow = readFileSync(path.join(repoRoot, ".github", "workflows", "cloudflare-ci-cd.yml"), "utf8");

    expect(workflow).toContain("cloudflare-${{ inputs.deploy_target }}-deploy.json");
    expect(workflow).toContain("cloudflare-${{ inputs.deploy_target }}-smoke.json");
    expect(workflow).toContain("cloudflare-${{ inputs.deploy_target }}-live-shadow.json");
    expect(workflow).toContain("name: cloudflare-${{ inputs.deploy_target }}-evidence");
  });
});
