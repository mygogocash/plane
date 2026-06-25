/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";

import { applyLegacyProjectLiteFields, pickLegacyProjectLiteFields } from "./legacy-project-lite";

describe("legacy project lite merge", () => {
  it("merges logo_props and member_role from legacy project payloads", () => {
    const legacy = pickLegacyProjectLiteFields({
      logo_props: { in_use: "emoji", emoji: { value: "🚀" } },
      member_role: 20,
      sort_order: 42,
      archived_at: null,
    });

    const merged = applyLegacyProjectLiteFields(
      {
        id: "project-1",
        name: "Manut",
        logo_props: {},
        member_role: 15,
      },
      legacy
    );

    expect(merged.logo_props).toEqual({ in_use: "emoji", emoji: { value: "🚀" } });
    expect(merged.member_role).toBe(20);
    expect(merged.sort_order).toBe(42);
  });
});
