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

  it("runs automatically for preview cutover evidence changes", () => {
    const workflow = readFileSync(path.join(repoRoot, ".github", "workflows", "betterstack-monitoring.yml"), "utf8");

    expect(workflow).toContain("push:");
    expect(workflow).toContain('"preview"');
    expect(workflow).toContain(".github/ops/betterstack/**");
    expect(workflow).toContain("apps/cloudflare/tools/betterstack-cutover-report.mjs");
    expect(workflow).toContain("process/features/cloudflare-stack-migration/**");
  });

  it("declares the public site fallback used only for challenged CI probes", () => {
    const workflow = readFileSync(path.join(repoRoot, ".github", "workflows", "betterstack-monitoring.yml"), "utf8");

    expect(workflow).toContain("BETTERSTACK_SITE_FALLBACK_URL");
    expect(workflow).toContain("https://manut.pages.dev");
  });

  it("only treats dry-run as report-suppressing for manual dispatch", () => {
    const workflow = readFileSync(path.join(repoRoot, ".github", "workflows", "betterstack-monitoring.yml"), "utf8");

    expect(workflow).toContain("github.event_name == 'workflow_dispatch' && inputs.dry_run == true");
    expect(workflow).toContain("github.event_name != 'workflow_dispatch' || inputs.dry_run == false");
  });
});
