// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it, vi } from "vitest";

import type { TPage, TPageTemplate } from "@plane/types";

import { PageTemplateStore } from "./page-template.store";

const template = (overrides: Partial<TPageTemplate> = {}): TPageTemplate => ({
  id: "template-1",
  workspace: "workspace-1",
  project: null,
  name: "Template",
  description_json: {},
  description_binary: null,
  description_html: "<p>Template</p>",
  description_stripped: "Template",
  logo_props: {},
  template_type: "custom",
  access: 0,
  owned_by: "user-1",
  is_active: true,
  created_at: "2026-06-23T00:00:00Z",
  updated_at: "2026-06-23T00:00:00Z",
  ...overrides,
});

const page = (overrides: Partial<TPage> = {}): TPage =>
  ({
    id: "page-1",
    name: "Created Page",
    ...overrides,
  }) as TPage;

const service = () => ({
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  apply: vi.fn(),
});

describe("PageTemplateStore", () => {
  it("fetches and scopes templates by workspace and project", async () => {
    const mockService = service();
    mockService.list.mockResolvedValue([template(), template({ id: "template-2", project: "project-1" })]);
    const store = new PageTemplateStore(mockService);

    await store.fetchTemplates("acme", "project-1");

    expect(mockService.list).toHaveBeenCalledWith("acme", "project-1");
    expect(store.getTemplates("acme", "project-1").map((row) => row.id)).toEqual(["template-1", "template-2"]);
    expect(store.getTemplatesForProject("acme", "project-1").map((row) => row.id)).toEqual([
      "template-1",
      "template-2",
    ]);
  });

  it("applies a template through the service", async () => {
    const mockService = service();
    mockService.apply.mockResolvedValue(page({ id: "created-page" }));
    const store = new PageTemplateStore(mockService);

    const createdPage = await store.applyTemplate("acme", "template-1", { project_id: "project-1" });

    expect(mockService.apply).toHaveBeenCalledWith("acme", "template-1", { project_id: "project-1" });
    expect(createdPage.id).toBe("created-page");
  });

  it("removes templates from cached scopes after delete", async () => {
    const mockService = service();
    mockService.list.mockResolvedValue([template(), template({ id: "template-2" })]);
    mockService.remove.mockResolvedValue(undefined);
    const store = new PageTemplateStore(mockService);

    await store.fetchTemplates("acme");
    await store.removeTemplate("acme", "template-1");

    expect(mockService.remove).toHaveBeenCalledWith("acme", "template-1");
    expect(store.getTemplates("acme").map((row) => row.id)).toEqual(["template-2"]);
  });
});
