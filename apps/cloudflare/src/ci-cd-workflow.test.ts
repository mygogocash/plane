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

  it("does not suppress GKE deploys for shared package manifest changes", () => {
    const workflow = readFileSync(path.join(repoRoot, ".github", "workflows", "ci-cd.yml"), "utf8");
    const cloudflareOnlyPattern = workflow
      .split("\n")
      .find((line) => line.includes("apps/cloudflare/*|apps/cloudflare/**"));

    expect(cloudflareOnlyPattern).toBeDefined();
    expect(cloudflareOnlyPattern).not.toContain("package.json");
    expect(cloudflareOnlyPattern).not.toContain("pnpm-lock.yaml");
    expect(cloudflareOnlyPattern).not.toContain("pnpm-workspace.yaml");
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

  it("summarizes Better Stack cutover evidence before enforcing green status", () => {
    const workflow = readFileSync(path.join(repoRoot, ".github", "workflows", "ci-cd.yml"), "utf8");

    expect(workflow).toContain(".github/ops/betterstack/summarize-cutover-report.sh");
    expect(workflow).toContain("phase-07-betterstack-cutover_21-06-26.json");
    expect(workflow).toContain("--soft-fail");
  });

  it("fails Better Stack monitoring when the cutover report is not green", () => {
    const workflow = readFileSync(path.join(repoRoot, ".github", "workflows", "ci-cd.yml"), "utf8");

    expect(workflow).toContain("Require Better Stack cutover report to pass");
    expect(workflow).toContain("jq -e '.ok == true'");
    expect(workflow).toContain("Better Stack cutover report is not green.");
  });

  it("writes Cloudflare deploy evidence with a provider-backed Worker version id", () => {
    const workflow = readFileSync(path.join(repoRoot, ".github", "workflows", "cloudflare-ci-cd.yml"), "utf8");

    expect(workflow).toContain("Resolve deployed Worker version");
    expect(workflow).toContain("/workers/scripts/${encodeURIComponent(workerName)}/deployments");
    expect(workflow).toContain("WORKER_VERSION_ID: ${{ steps.worker_version.outputs.version_id }}");
    expect(workflow).toContain(
      'evidence_kind: deployTarget === "production" ? "cloudflare-production-deploy" : "cloudflare-preview-deploy"'
    );
    expect(workflow).toContain("version_id: process.env.WORKER_VERSION_ID");
    expect(workflow).not.toContain("version_id: process.env.GITHUB_SHA");
    expect(workflow).not.toContain("version_id: null");
  });
});
