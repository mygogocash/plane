/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";

import { mapProjectPayload } from "./db";

describe("mapProjectPayload", () => {
  it("returns Plane lite-list fields expected by the workspace sidebar", () => {
    const payload = mapProjectPayload(
      {
        id: "project-1",
        workspace_id: "workspace-1",
        name: "Manut",
        identifier: "MANUT",
        network: 2,
        created_at: "2026-06-01T00:00:00.000Z",
        updated_at: "2026-06-02T00:00:00.000Z",
      },
      { memberRole: 20 }
    );

    expect(payload).toMatchObject({
      id: "project-1",
      workspace: "workspace-1",
      member_role: 20,
      archived_at: null,
      sort_order: 0,
      logo_props: {},
      page_view: true,
    });
    expect(payload).not.toHaveProperty("workspace_id");
  });
});
