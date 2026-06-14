/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
// plane imports
import type { TWorkItemTemplate } from "@plane/types";

const { mockService } = vi.hoisted(() => ({
  mockService: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deleteTemplate: vi.fn(),
  },
}));

vi.mock("@/services/work-item-template.service", () => ({
  WorkItemTemplateService: function WorkItemTemplateService() {
    return mockService;
  },
}));

import { WorkItemTemplateStore } from "./work-item-template.store";

const SLUG = "acme";
const PROJECT = "project-1";

const template = (overrides: Partial<TWorkItemTemplate> = {}): TWorkItemTemplate => ({
  id: "template-1",
  project_id: PROJECT,
  workspace_id: "workspace-1",
  name: "Bug report",
  description_html: "Default bug report",
  template_data: {},
  issue_type: "type-bug",
  is_active: true,
  created_at: "2026-06-14T00:00:00Z",
  updated_at: "2026-06-14T00:00:00Z",
  ...overrides,
});

describe("WorkItemTemplateStore", () => {
  let store: WorkItemTemplateStore;

  beforeEach(() => {
    vi.clearAllMocks();
    store = new WorkItemTemplateStore({} as never);
  });

  it("fetches templates and filters picker-visible active templates by issue type", async () => {
    const rows = [
      template({ id: "active-bug", name: "Bug", issue_type: "type-bug" }),
      template({ id: "active-any", name: "Any", issue_type: null }),
      template({ id: "active-story", name: "Story", issue_type: "type-story" }),
      template({ id: "inactive", name: "Inactive", is_active: false }),
    ];
    mockService.list.mockResolvedValue(rows);

    await store.fetchTemplates(SLUG, PROJECT, { includeInactive: true });

    expect(mockService.list).toHaveBeenCalledWith(SLUG, PROJECT, { includeInactive: true });
    expect(store.getTemplatesForProject(PROJECT)).toEqual(rows);
    expect(store.getActiveTemplatesForProject(PROJECT, "type-bug").map((row) => row.id)).toEqual([
      "active-bug",
      "active-any",
    ]);
    expect(store.hasFetchedTemplatesForProject(PROJECT, true)).toBe(true);
  });

  it("updates and deletes templates in the project cache", async () => {
    const original = template({ id: "template-1", is_active: true });
    const updated = template({ id: "template-1", is_active: false });
    mockService.list.mockResolvedValue([original]);
    mockService.update.mockResolvedValue(updated);
    mockService.deleteTemplate.mockResolvedValue(undefined);

    await store.fetchTemplates(SLUG, PROJECT);
    await store.updateTemplate(SLUG, PROJECT, "template-1", { is_active: false });

    expect(store.getTemplatesForProject(PROJECT)).toEqual([updated]);
    expect(store.getActiveTemplatesForProject(PROJECT)).toEqual([]);

    await store.deleteTemplate(SLUG, PROJECT, "template-1");

    expect(store.getTemplatesForProject(PROJECT)).toEqual([]);
  });
});
