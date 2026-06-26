/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";

import { buildEmptyIssuesListResponse } from "./issue-response";

describe("buildEmptyIssuesListResponse", () => {
  it("returns the paginated issues envelope expected by the web store", () => {
    expect(buildEmptyIssuesListResponse("state")).toEqual({
      grouped_by: "state",
      next_cursor: "",
      prev_cursor: "",
      next_page_results: false,
      prev_page_results: false,
      total_count: 0,
      count: 0,
      total_pages: 0,
      extra_stats: null,
      results: [],
      total_results: 0,
    });
  });
});
