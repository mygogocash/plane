// Copyright 2023-present Plane Authors. All rights reserved.
// SPDX-License-Identifier: AGPL-3.0-only

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const cloudflarePackageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const webPackageRoot = resolve(cloudflarePackageRoot, "../web");

function readPackageJson(packageRoot: string) {
  return JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
}

describe("Cloudflare Workers Builds deploy scripts", () => {
  it("defines split build and deploy commands for dashboard wiring", () => {
    const scripts = readPackageJson(cloudflarePackageRoot).scripts;

    expect(scripts["deploy:build"]).toBe("pnpm --filter web... run build");
    expect(scripts["deploy:worker"]).toBe("wrangler deploy --env production");
    expect(scripts["build:web"]).toBe("pnpm --filter web... run build");
  });

  it("raises Node heap for web production build to avoid SSR OOM on CI hosts", () => {
    const buildScript = readPackageJson(webPackageRoot).scripts.build;

    expect(buildScript).toContain("--max-old-space-size=4096");
  });
});
