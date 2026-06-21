import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..", "..", "..");

function readValues(): string {
  return readFileSync(path.join(repoRoot, "k8s", "manut-helm-values.yaml"), "utf8");
}

describe("Manut Helm values", () => {
  it("keeps HTTP-facing workloads multi-replica for production availability", () => {
    const values = readValues();

    for (const component of ["web", "space", "admin", "live", "api"]) {
      expect(values).toMatch(new RegExp(`\\n${component}:\\n(?:  .+\\n)*  replicas: [2-9][0-9]*\\n`));
    }
  });

  it("tracks disruption budgets for current fallback and Manut HTTP workloads", () => {
    const planeFallbackPdb = readFileSync(
      path.join(repoRoot, "k8s", "plane-fallback-pod-disruption-budgets.yaml"),
      "utf8"
    );
    const manutPdb = readFileSync(path.join(repoRoot, "k8s", "manut-pod-disruption-budgets.yaml"), "utf8");

    for (const component of ["web", "space", "admin", "live", "api"]) {
      expect(planeFallbackPdb).toContain(`plane-ce-plane-app-${component}`);
      expect(manutPdb).toContain(`manut-ce-manut-app-${component}`);
    }

    expect(planeFallbackPdb).toMatch(/minAvailable:\s+1/);
    expect(manutPdb).toMatch(/minAvailable:\s+1/);
  });

  it("keeps the API replica setting documented near the production health report", () => {
    const report = readFileSync(
      path.join(
        repoRoot,
        "process",
        "features",
        "cloudflare-stack-migration",
        "reports",
        "phase-07-production-cutover-readiness_21-06-26.md"
      ),
      "utf8"
    );

    expect(report).toContain("single API replica");
    expect(report).toContain("node scale-down");
  });
});
