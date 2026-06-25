/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";

import { applyLegacyWorkspaceMedia, pickLegacyWorkspaceMedia } from "./legacy-workspace-media";

describe("legacy workspace media merge", () => {
  it("prefers logo_url from legacy workspace payloads", () => {
    const legacy = pickLegacyWorkspaceMedia({
      logo_url: "/api/assets/v2/workspaces/gogocash/abc/",
      logo: "",
    });

    const merged = applyLegacyWorkspaceMedia(
      {
        id: "ws-1",
        slug: "gogocash",
        logo: "",
        logo_url: "",
      },
      legacy
    );

    expect(merged.logo_url).toBe("/api/assets/v2/workspaces/gogocash/abc/");
    expect(merged.logo).toBe("/api/assets/v2/workspaces/gogocash/abc/");
  });

  it("leaves native payload unchanged when legacy media is missing", () => {
    const payload = {
      id: "ws-1",
      slug: "gogocash",
      logo: null,
      logo_url: null,
    };

    expect(applyLegacyWorkspaceMedia(payload, undefined)).toEqual(payload);
  });
});
