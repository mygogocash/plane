/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";

import { mapProjectDetailPayload, mapProjectPayload } from "./db";

describe("mapProjectPayload", () => {
  it("returns Plane lite-list fields expected by the workspace sidebar", () => {
    const payload = mapProjectPayload(
      {
        id: "project-1",
        workspace_id: "workspace-1",
        name: "Manut",
        identifier: "MANUT",
        network: 2,
        logo_props: null,
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

  it("parses a stored logo_props JSON string into the project payload", () => {
    const payload = mapProjectPayload({
      id: "project-2",
      workspace_id: "workspace-1",
      name: "Tutor me",
      identifier: "TUTORME",
      network: 2,
      logo_props: JSON.stringify({ in_use: "emoji", emoji: { value: "🎓" } }),
      created_at: "2026-06-01T00:00:00.000Z",
      updated_at: "2026-06-02T00:00:00.000Z",
    });

    expect(payload.logo_props).toEqual({ in_use: "emoji", emoji: { value: "🎓" } });
  });

  it("falls back to an empty object when logo_props JSON is invalid", () => {
    const payload = mapProjectPayload({
      id: "project-3",
      workspace_id: "workspace-1",
      name: "Tutor me",
      identifier: "TUTORME",
      network: 2,
      logo_props: "{not valid json",
      created_at: "2026-06-01T00:00:00.000Z",
      updated_at: "2026-06-02T00:00:00.000Z",
    });

    expect(payload.logo_props).toEqual({});
  });
});

describe("mapProjectDetailPayload", () => {
  it("extends the lite payload with project detail defaults", () => {
    const payload = mapProjectDetailPayload(
      {
        id: "project-1",
        workspace_id: "workspace-1",
        name: "Fastwork",
        identifier: "FAST",
        network: 2,
        logo_props: JSON.stringify({ in_use: "emoji", emoji: { value: "⚡" } }),
        created_at: "2026-06-01T00:00:00.000Z",
        updated_at: "2026-06-02T00:00:00.000Z",
      },
      { memberRole: 20 }
    );

    expect(payload).toMatchObject({
      id: "project-1",
      member_role: 20,
      logo_props: { in_use: "emoji", emoji: { value: "⚡" } },
      description_html: "<p></p>",
      default_state: null,
      next_work_item_sequence: 1,
      project_lead: null,
    });
  });
});
