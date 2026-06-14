/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
// types
import type { TRecurringWorkItem, TRecurringWorkItemRun } from "@/types/recurring-work-item";

const { mockService } = vi.hoisted(() => ({
  mockService: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deleteRecurrence: vi.fn(),
    runs: vi.fn(),
  },
}));

vi.mock("@/services/recurring-work-item.service", () => ({
  RecurringWorkItemService: function RecurringWorkItemService() {
    return mockService;
  },
}));

import { RecurringWorkItemStore } from "./recurring-work-item.store";

const SLUG = "acme";
const PROJECT = "project-1";

const recurrence = (overrides: Partial<TRecurringWorkItem> = {}): TRecurringWorkItem => ({
  id: "recurrence-1",
  project_id: PROJECT,
  workspace_id: "workspace-1",
  name: "Daily triage",
  template: null,
  payload: { name: "Generated issue" },
  frequency: "daily",
  rrule: null,
  timezone: "UTC",
  start_date: "2026-06-14T00:00:00Z",
  end_date: null,
  max_iterations: 5,
  next_run_at: "2026-06-14T00:00:00Z",
  owned_by: "user-1",
  is_active: true,
  created_at: "2026-06-14T00:00:00Z",
  updated_at: "2026-06-14T00:00:00Z",
  ...overrides,
});

const run = (overrides: Partial<TRecurringWorkItemRun> = {}): TRecurringWorkItemRun => ({
  id: "run-1",
  run_at: "2026-06-14T00:00:00Z",
  generated_issue: "issue-1",
  ...overrides,
});

describe("RecurringWorkItemStore", () => {
  let store: RecurringWorkItemStore;

  beforeEach(() => {
    vi.clearAllMocks();
    store = new RecurringWorkItemStore({} as never);
  });

  it("fetches recurrence schedules and runs into project caches", async () => {
    const rows = [recurrence(), recurrence({ id: "recurrence-2", name: "Weekly sync", frequency: "weekly" })];
    const runs = [run()];
    mockService.list.mockResolvedValue(rows);
    mockService.runs.mockResolvedValue(runs);

    await store.fetchRecurrences(SLUG, PROJECT);
    await store.fetchRuns(SLUG, PROJECT, "recurrence-1");

    expect(mockService.list).toHaveBeenCalledWith(SLUG, PROJECT);
    expect(store.getRecurrencesForProject(PROJECT)).toEqual(rows);
    expect(store.hasFetchedRecurrencesForProject(PROJECT)).toBe(true);
    expect(mockService.runs).toHaveBeenCalledWith(SLUG, PROJECT, "recurrence-1");
    expect(store.getRunsForRecurrence("recurrence-1")).toEqual(runs);
  });

  it("creates, updates, and deletes recurrence schedules in the project cache", async () => {
    const original = recurrence({ id: "recurrence-1", is_active: true });
    const created = recurrence({ id: "recurrence-2", name: "Weekly report", frequency: "weekly" });
    const updated = recurrence({ id: "recurrence-1", is_active: false });
    mockService.list.mockResolvedValue([original]);
    mockService.create.mockResolvedValue(created);
    mockService.update.mockResolvedValue(updated);
    mockService.deleteRecurrence.mockResolvedValue(undefined);

    await store.fetchRecurrences(SLUG, PROJECT);
    await store.createRecurrence(SLUG, PROJECT, {
      name: "Weekly report",
      payload: { name: "Weekly report" },
      frequency: "weekly",
      timezone: "UTC",
      start_date: "2026-06-14T00:00:00Z",
      max_iterations: 3,
    });
    await store.updateRecurrence(SLUG, PROJECT, "recurrence-1", { is_active: false });

    expect(store.getRecurrencesForProject(PROJECT)).toEqual([updated, created]);

    await store.deleteRecurrence(SLUG, PROJECT, "recurrence-1");

    expect(store.getRecurrencesForProject(PROJECT)).toEqual([created]);
  });
});
