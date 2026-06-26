/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";

import { buildIssueInsert, buildIssuesImportSql } from "../tools/d1-issues-sql.mjs";

describe("buildIssueInsert", () => {
  it("maps exported Postgres issue rows into D1 insert SQL", () => {
    const sql = buildIssueInsert({
      id: "issue-1",
      project_id: "project-1",
      workspace_id: "workspace-1",
      name: "Ship icons",
      description_html: "<p>Fix sidebar icons</p>",
      priority: "high",
      state_id: "state-1",
      sequence_id: 12,
      sort_order: 1000,
      created_by: "user-1",
      updated_by: "user-1",
      deleted_at: null,
      created_at: "2026-06-01T00:00:00.000Z",
      updated_at: "2026-06-02T00:00:00.000Z",
    });

    expect(sql).toContain("INSERT OR REPLACE INTO issues");
    expect(sql).toContain("'issue-1'");
    expect(sql).toContain("'Ship icons'");
    expect(sql).toContain("'high'");
    expect(sql).toContain("12");
    expect(sql).toContain("1000");
  });
});

describe("buildIssuesImportSql", () => {
  it("joins multiple issue inserts", () => {
    const sql = buildIssuesImportSql({
      issues: [
        {
          id: "issue-1",
          project_id: "project-1",
          workspace_id: "workspace-1",
          name: "One",
          created_at: "2026-06-01T00:00:00.000Z",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
        {
          id: "issue-2",
          project_id: "project-1",
          workspace_id: "workspace-1",
          name: "Two",
          created_at: "2026-06-02T00:00:00.000Z",
          updated_at: "2026-06-02T00:00:00.000Z",
        },
      ],
    });

    expect(sql.split("INSERT OR REPLACE INTO issues").length - 1).toBe(2);
  });
});
