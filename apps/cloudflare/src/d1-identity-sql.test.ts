/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";

import { buildIdentityImportSql, buildUserInsert } from "../tools/d1-identity-sql.mjs";

describe("d1 identity sql builder", () => {
  it("escapes single quotes in user inserts", () => {
    const statement = buildUserInsert({
      id: "user-1",
      email: "o'connor@example.com",
      display_name: "O'Connor",
      first_name: "Pat",
      last_name: "Example",
      avatar: "",
      is_active: 1,
      is_bot: 0,
      last_active: "2026-06-25T00:00:00.000Z",
      created_at: "2026-06-25T00:00:00.000Z",
      updated_at: "2026-06-25T00:00:00.000Z",
    });

    expect(statement).toContain("'o''connor@example.com'");
    expect(statement).toContain("'O''Connor'");
  });

  it("wraps identity imports in a transaction", () => {
    const sql = buildIdentityImportSql({
      users: [
        {
          id: "user-1",
          email: "user@example.com",
          created_at: "2026-06-25T00:00:00.000Z",
          updated_at: "2026-06-25T00:00:00.000Z",
        },
      ],
      profiles: [
        {
          user_id: "user-1",
          is_onboarded: 1,
          onboarding_step: '{"profile_complete":true}',
          is_tour_completed: 0,
          created_at: "2026-06-25T00:00:00.000Z",
          updated_at: "2026-06-25T00:00:00.000Z",
        },
      ],
      workspaceMembers: [
        {
          id: "wm-1",
          workspace_id: "ws-1",
          member_id: "user-1",
          role: 20,
          is_active: 1,
          created_at: "2026-06-25T00:00:00.000Z",
          updated_at: "2026-06-25T00:00:00.000Z",
        },
      ],
    });

    expect(sql).toContain("INSERT OR REPLACE INTO users");
    expect(sql).toContain("INSERT OR REPLACE INTO profiles");
    expect(sql).toContain("INSERT OR REPLACE INTO workspace_members");
  });
});
