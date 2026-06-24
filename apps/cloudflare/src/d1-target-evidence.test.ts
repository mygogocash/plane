/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";

import { buildD1TargetEvidence, unwrapWranglerRows } from "../tools/collect-d1-target-evidence.mjs";

describe("D1 target evidence collection", () => {
  it("unwraps successful Wrangler D1 JSON results", () => {
    expect(
      unwrapWranglerRows(
        [
          {
            success: true,
            results: [{ table_name: "workspaces", count: 1 }],
          },
        ],
        "d1 counts"
      )
    ).toEqual([{ table_name: "workspaces", count: 1 }]);
  });

  it("rejects failed Wrangler D1 JSON results", () => {
    expect(() =>
      unwrapWranglerRows(
        [
          {
            success: false,
            errors: [{ message: "no such table: workspaces" }],
            results: [],
          },
        ],
        "d1 counts"
      )
    ).toThrow("d1 counts SQL runner reported failure");
  });

  it("marks target evidence blocked when required D1 tables are empty", () => {
    const report = buildD1TargetEvidence({
      database: "manut-prod",
      generatedAt: "2026-06-22T00:00:00.000Z",
      countRows: [
        { table_name: "projects", count: 0 },
        { table_name: "workspaces", count: 0 },
      ],
      relationshipRows: [
        {
          name: "projects.workspace_id",
          source: "projects",
          target: "workspaces",
          orphan_count: 0,
        },
      ],
    });

    expect(report).toMatchObject({
      ok: false,
      evidence_kind: "d1-target-snapshot",
      database: "manut-prod",
      final_import_ready: false,
      final_import_blocked: {
        reason: "D1 target required tables are empty; final import validation requires non-empty imported rows.",
      },
      summary: {
        required_scope_target_rows: 0,
        relationship_checks_failed: 0,
      },
      counts: {
        counts: {
          projects: 0,
          workspaces: 0,
        },
      },
    });
  });

  it("marks target evidence ready when required D1 counts and relationships are populated", () => {
    const report = buildD1TargetEvidence({
      database: "manut-prod",
      generatedAt: "2026-06-22T00:00:00.000Z",
      countRows: [
        { table_name: "projects", count: "2" },
        { table_name: "workspaces", count: "1" },
      ],
      relationshipRows: [
        {
          name: "projects.workspace_id",
          source: "projects",
          target: "workspaces",
          orphan_count: "0",
        },
      ],
    });

    expect(report).toMatchObject({
      ok: true,
      final_import_ready: true,
      final_import_blocked: null,
      summary: {
        required_scope_target_rows: 3,
        relationship_checks_failed: 0,
      },
    });
  });
});
