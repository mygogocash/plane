// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const wranglerConfig = readFileSync(path.join(repoRoot, "apps", "cloudflare", "wrangler.toml"), "utf8");
const rootWranglerConfig = readFileSync(path.join(repoRoot, "wrangler.toml"), "utf8");

describe("Wrangler production config", () => {
  it("pins the Cloudflare account for non-interactive deploys", () => {
    expect(wranglerConfig).toContain('account_id = "187ab61ed9dbc6e616cb23e6b95aa8f1"');
  });

  it("attaches app.manut.xyz production routes for slice 5 cutover", () => {
    expect(wranglerConfig).toContain('pattern = "app.manut.xyz/*"');
    expect(wranglerConfig).toContain('zone_name = "manut.xyz"');
  });

  it("does not check in a self-referential legacy GKE origin", () => {
    expect(wranglerConfig).not.toContain('LEGACY_GKE_ORIGIN = "https://app.manut.xyz"');
  });

  it("runs the worker first for API and auth routes so POST login is not blocked by static assets", () => {
    expect(wranglerConfig).toContain('run_worker_first = ["/api/*", "/auth/*"');
  });

  it("keeps logs and traces observability persistent across deployments", () => {
    expect(wranglerConfig).toContain("[observability]");
    expect(wranglerConfig).toContain("head_sampling_rate = 1");
    expect(wranglerConfig).toContain("[observability.logs]");
    expect(wranglerConfig).toContain("invocation_logs = true");
    expect(wranglerConfig).toContain("[observability.traces]");
    expect(wranglerConfig).toContain("persist = true");
  });
});

describe("Root Wrangler config for Workers Builds", () => {
  it("points assets at a repo-root-relative web client build directory", () => {
    expect(rootWranglerConfig).toContain('directory = "apps/web/build/client"');
    expect(rootWranglerConfig).not.toContain('directory = "../web/build/client"');
  });

  it("runs the worker first for API and auth routes so POST login is not blocked by static assets", () => {
    expect(rootWranglerConfig).toContain('run_worker_first = ["/api/*", "/auth/*"');
  });
});
