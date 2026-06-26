/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";

import { legacyGetEmptyStubResponse, legacyNativeCompatibilityStubResponse } from "./legacy-get-stubs";

describe("legacy native compatibility stubs", () => {
  it("returns empty collections for project shell GET routes", async () => {
    const response = legacyGetEmptyStubResponse(
      new Request("https://app.manut.xyz/api/workspaces/gogocash/projects/abc/members/")
    );

    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toEqual([]);
  });

  it("returns empty objects for project preference GET routes", async () => {
    const response = legacyGetEmptyStubResponse(
      new Request("https://app.manut.xyz/api/workspaces/gogocash/projects/abc/workflow-config/")
    );

    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toEqual({});
  });

  it("accepts client error reports without proxying to legacy GKE", async () => {
    const response = legacyNativeCompatibilityStubResponse(
      new Request("https://app.manut.xyz/api/client-errors/", { method: "POST" })
    );

    expect(response?.status).toBe(204);
  });
});
