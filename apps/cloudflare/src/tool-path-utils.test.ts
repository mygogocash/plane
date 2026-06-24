/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import path from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const packageRoot = path.resolve(__dirname, "..");

describe("Cloudflare tool path utilities", () => {
  it("finds the repository root from the package directory", async () => {
    const { findRepoRoot } = await import("../tools/path-utils.mjs");

    expect(findRepoRoot(packageRoot)).toBe(repoRoot);
  });

  it("resolves relative paths from the repository root", async () => {
    const { resolveRepoPath } = await import("../tools/path-utils.mjs");

    expect(resolveRepoPath("process/features/report.json", repoRoot)).toBe(
      path.join(repoRoot, "process", "features", "report.json")
    );
  });
});
