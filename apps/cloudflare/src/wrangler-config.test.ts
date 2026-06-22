import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const wranglerConfig = readFileSync(path.join(repoRoot, "apps", "cloudflare", "wrangler.toml"), "utf8");

describe("Wrangler production config", () => {
  it("pins the Cloudflare account for non-interactive deploys", () => {
    expect(wranglerConfig).toContain('account_id = "187ab61ed9dbc6e616cb23e6b95aa8f1"');
  });

  it("does not attach app.manut.xyz routes before cutover", () => {
    expect(wranglerConfig).not.toMatch(/^routes?\s*=/m);
    expect(wranglerConfig).not.toMatch(/^custom_domain\s*=/m);
  });

  it("does not check in a self-referential legacy GKE origin", () => {
    expect(wranglerConfig).not.toContain('LEGACY_GKE_ORIGIN = "https://app.manut.xyz"');
  });
});
