/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TIssue, TIssuePropertyValues } from "./issues";
import type { TStateGroups } from "./state";

export type TEpic = TIssue;

export type TEpicPayload = Partial<TIssue> & {
  description_html?: string;
};

export type TEpicProgress = {
  counts_by_group: Partial<Record<TStateGroups, number>>;
  percent_complete: number;
  total_count?: number;
};

export type TEpicPropertyValuesResponse = {
  property_values: TIssuePropertyValues;
};

export type TEpicAnalyticsGroup =
  | "backlog_issues"
  | "unstarted_issues"
  | "started_issues"
  | "completed_issues"
  | "cancelled_issues"
  | "overdue_issues";

export type TEpicAnalytics = {
  backlog_issues: number;
  unstarted_issues: number;
  started_issues: number;
  completed_issues: number;
  cancelled_issues: number;
  overdue_issues: number;
};
