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

  it("fails production smoke when any sample fails after rollout", () => {
    const workflow = readFileSync(path.join(repoRoot, ".github", "workflows", "ci-cd.yml"), "utf8");

    expect(workflow).toContain("Waiting ${delay_seconds}s before production smoke");
    expect(workflow).toContain("successful_samples=0");
    expect(workflow).toContain("Production smoke never passed after ${samples} samples.");
    expect(workflow).toContain("Production smoke had ${failed_samples} failed sample(s) after rollout.");
    expect(workflow).toContain("exit 1");
    expect(workflow).not.toContain("transient failed sample(s) before recovery");
  });

  it("reconciles GKE availability guardrails before production smoke", () => {
    const workflow = readFileSync(path.join(repoRoot, ".github", "workflows", "ci-cd.yml"), "utf8");

    expect(workflow).toContain("GKE_MIN_HTTP_REPLICAS");
    expect(workflow).toContain("k8s/plane-fallback-pod-disruption-budgets.yaml");
    expect(workflow).toContain("k8s/manut-pod-disruption-budgets.yaml");
    expect(workflow).toContain("scale_if_exists plane-app-api-wl manut-app-api-wl");
  });

  it("summarizes blocked Better Stack cutover evidence even when monitor sync is non-blocking", () => {
    const workflow = readFileSync(path.join(repoRoot, ".github", "workflows", "ci-cd.yml"), "utf8");

    expect(workflow).toContain(".github/ops/betterstack/summarize-cutover-report.sh");
    expect(workflow).toContain("phase-07-betterstack-cutover_21-06-26.json");
  });
});
