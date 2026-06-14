/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import type { TIssue } from "@plane/types";

export type TRecurringWorkItemFrequency = "daily" | "weekly" | "monthly" | "custom";

export type TRecurringWorkItemPayloadData = Partial<TIssue> & {
  type?: string | null;
  sub_items?: Partial<TIssue>[];
  [key: string]: unknown;
};

export type TRecurringWorkItem = {
  id: string;
  project_id: string;
  workspace_id: string;
  name: string;
  template: string | null;
  payload: TRecurringWorkItemPayloadData;
  frequency: TRecurringWorkItemFrequency;
  rrule: string | null;
  timezone: string;
  start_date: string;
  end_date: string | null;
  max_iterations: number | null;
  next_run_at: string;
  owned_by: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type TRecurringWorkItemCreatePayload = {
  name: string;
  template?: string | null;
  payload?: TRecurringWorkItemPayloadData;
  frequency: TRecurringWorkItemFrequency;
  rrule?: string | null;
  timezone: string;
  start_date: string;
  end_date?: string | null;
  max_iterations?: number | null;
  is_active?: boolean;
};

export type TRecurringWorkItemUpdatePayload = Partial<TRecurringWorkItemCreatePayload>;

export type TRecurringWorkItemRun = {
  id: string;
  run_at: string;
  generated_issue: string | null;
};

export type TIssueModalRecurrenceDraft = {
  enabled: boolean;
  frequency: TRecurringWorkItemFrequency;
  rrule: string;
  timezone: string;
  start_date: string;
  end_date: string;
  max_iterations: number | null;
};

export type TRecurringIssue = TIssue & {
  is_recurring?: boolean;
};
