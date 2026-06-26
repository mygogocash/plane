/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export function buildEmptyIssuesListResponse(groupedBy = "state") {
  return {
    grouped_by: groupedBy,
    next_cursor: "",
    prev_cursor: "",
    next_page_results: false,
    prev_page_results: false,
    total_count: 0,
    count: 0,
    total_pages: 0,
    extra_stats: null,
    results: [] as unknown[],
    total_results: 0,
  };
}
