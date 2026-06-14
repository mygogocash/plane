/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
// local imports
import { EpicService } from "./epic.service";

const http = vi.hoisted(() => ({
  create: vi.fn(),
  delete: vi.fn(),
  get: vi.fn(),
  patch: vi.fn(),
  post: vi.fn(),
}));

vi.mock("axios", () => ({
  create: http.create,
}));

describe("EpicService", () => {
  beforeEach(() => {
    http.create.mockReturnValue({
      delete: http.delete,
      get: http.get,
      patch: http.patch,
      post: http.post,
    });
    http.delete.mockReset();
    http.get.mockReset();
    http.patch.mockReset();
    http.post.mockReset();
  });

  it("lists project epics through the session endpoint", async () => {
    const service = new EpicService("http://unit.test");
    const epics = [{ id: "epic-1", name: "Launch readiness" }];
    http.get.mockResolvedValue({ data: epics });

    const response = await service.list("acme", "project-1");

    expect(http.get).toHaveBeenCalledWith("/api/workspaces/acme/projects/project-1/epics/", {});
    expect(response).toBe(epics);
  });

  it("creates an epic through the project-scoped endpoint", async () => {
    const service = new EpicService("http://unit.test");
    const payload = { name: "Cross-project launch", description_html: "<p>Scope</p>" };
    const createdEpic = { id: "epic-2", ...payload };
    http.post.mockResolvedValue({ data: createdEpic });

    const response = await service.create("acme", "project-1", payload);

    expect(http.post).toHaveBeenCalledWith("/api/workspaces/acme/projects/project-1/epics/", payload, {});
    expect(response).toBe(createdEpic);
  });

  it("retrieves epic progress through the progress endpoint", async () => {
    const service = new EpicService("http://unit.test");
    const progress = {
      counts_by_group: {
        backlog: 1,
        started: 2,
        completed: 3,
      },
      percent_complete: 50,
      total_count: 6,
    };
    http.get.mockResolvedValue({ data: progress });

    const response = await service.getProgress("acme", "project-1", "epic-1");

    expect(http.get).toHaveBeenCalledWith("/api/workspaces/acme/projects/project-1/epics/epic-1/progress/", {});
    expect(response).toBe(progress);
  });

  it("loads epic properties and persists one property value", async () => {
    const service = new EpicService("http://unit.test");
    const properties = [{ id: "property-1", display_name: "Release owner", property_type: "member" }];
    const propertyValues = { property_values: { "property-1": "member-1" } };
    http.get.mockResolvedValueOnce({ data: properties }).mockResolvedValueOnce({ data: propertyValues });
    http.post.mockResolvedValue({ data: propertyValues });

    const loadedProperties = await service.getProperties("acme", "type-epic");
    const loadedValues = await service.getPropertyValues("acme", "project-1", "epic-1");
    const savedValues = await service.setPropertyValue("acme", "project-1", "epic-1", "property-1", "member-1");

    expect(http.get).toHaveBeenNthCalledWith(1, "/api/workspaces/acme/issue-types/type-epic/properties/", {});
    expect(http.get).toHaveBeenNthCalledWith(
      2,
      "/api/workspaces/acme/projects/project-1/epics/epic-1/property-values/",
      {}
    );
    expect(http.post).toHaveBeenCalledWith(
      "/api/workspaces/acme/projects/project-1/epics/epic-1/property-values/",
      {
        property_values: {
          "property-1": "member-1",
        },
      },
      {}
    );
    expect(loadedProperties).toBe(properties);
    expect(loadedValues).toBe(propertyValues);
    expect(savedValues).toBe(propertyValues);
  });
});
