/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
// local imports
import { InitiativeService } from "./initiative.service";

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

describe("InitiativeService", () => {
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

  it("maps workspace initiative CRUD methods to the session endpoints", async () => {
    const service = new InitiativeService("http://unit.test");
    const initiative = { id: "initiative-1", name: "Launch readiness", state: "ACTIVE" };
    const payload = { name: "Launch readiness", state: "PLANNED" };
    http.get.mockResolvedValueOnce({ data: [initiative] }).mockResolvedValueOnce({ data: initiative });
    http.post.mockResolvedValue({ data: initiative });
    http.patch.mockResolvedValue({ data: { ...initiative, state: "PLANNED" } });
    http.delete.mockResolvedValue({ data: undefined });

    const listResponse = await service.list("acme");
    const createdResponse = await service.create("acme", payload);
    const retrievedResponse = await service.retrieve("acme", "initiative-1");
    const updatedResponse = await service.update("acme", "initiative-1", payload);
    await service.destroy("acme", "initiative-1");

    expect(http.get).toHaveBeenNthCalledWith(1, "/api/workspaces/acme/initiatives/", {});
    expect(http.post).toHaveBeenCalledWith("/api/workspaces/acme/initiatives/", payload, {});
    expect(http.get).toHaveBeenNthCalledWith(2, "/api/workspaces/acme/initiatives/initiative-1/", {});
    expect(http.patch).toHaveBeenCalledWith("/api/workspaces/acme/initiatives/initiative-1/", payload, {});
    expect(http.delete).toHaveBeenCalledWith("/api/workspaces/acme/initiatives/initiative-1/", {
      data: undefined,
    });
    expect(listResponse).toEqual([initiative]);
    expect(createdResponse).toEqual(initiative);
    expect(retrievedResponse).toEqual(initiative);
    expect(updatedResponse).toEqual({ ...initiative, state: "PLANNED" });
  });

  it("maps progress and member mutations to the initiative member endpoints", async () => {
    const service = new InitiativeService("http://unit.test");
    const progress = {
      counts_by_group: {
        backlog: 0,
        cancelled: 0,
        completed: 1,
        started: 2,
        unstarted: 1,
      },
      percent_complete: 25,
      total_count: 4,
    };
    http.get.mockResolvedValue({ data: progress });
    http.post
      .mockResolvedValueOnce({ data: { attached_epic_ids: ["epic-1"] } })
      .mockResolvedValueOnce({ data: { attached_project_ids: ["project-1"] } });
    http.delete
      .mockResolvedValueOnce({ data: { detached_epic_ids: ["epic-1"] } })
      .mockResolvedValueOnce({ data: { detached_project_ids: ["project-1"] } });

    const progressResponse = await service.getProgress("acme", "initiative-1");
    const epicAttachResponse = await service.attachEpic("acme", "initiative-1", ["epic-1"]);
    const projectAttachResponse = await service.attachProject("acme", "initiative-1", ["project-1"]);
    const epicDetachResponse = await service.detachEpic("acme", "initiative-1", ["epic-1"]);
    const projectDetachResponse = await service.detachProject("acme", "initiative-1", ["project-1"]);

    expect(http.get).toHaveBeenCalledWith("/api/workspaces/acme/initiatives/initiative-1/progress/", {});
    expect(http.post).toHaveBeenNthCalledWith(
      1,
      "/api/workspaces/acme/initiatives/initiative-1/epics/",
      {
        epic_ids: ["epic-1"],
      },
      {}
    );
    expect(http.post).toHaveBeenNthCalledWith(
      2,
      "/api/workspaces/acme/initiatives/initiative-1/projects/",
      {
        project_ids: ["project-1"],
      },
      {}
    );
    expect(http.delete).toHaveBeenNthCalledWith(1, "/api/workspaces/acme/initiatives/initiative-1/epics/", {
      data: {
        epic_ids: ["epic-1"],
      },
    });
    expect(http.delete).toHaveBeenNthCalledWith(2, "/api/workspaces/acme/initiatives/initiative-1/projects/", {
      data: {
        project_ids: ["project-1"],
      },
    });
    expect(progressResponse).toBe(progress);
    expect(epicAttachResponse).toEqual({ attached_epic_ids: ["epic-1"] });
    expect(projectAttachResponse).toEqual({ attached_project_ids: ["project-1"] });
    expect(epicDetachResponse).toEqual({ detached_epic_ids: ["epic-1"] });
    expect(projectDetachResponse).toEqual({ detached_project_ids: ["project-1"] });
  });

  it("loads workspace summary and surfaces API errors without fabricating success", async () => {
    const service = new InitiativeService("http://unit.test");
    const summary = { ACTIVE: [{ id: "initiative-1", name: "Launch readiness", state: "ACTIVE" }] };
    const apiError = { error: "invalid_epic_ids" };
    http.get.mockResolvedValueOnce({ data: summary }).mockRejectedValueOnce({ response: { data: apiError } });

    const response = await service.summary("acme");

    expect(http.get).toHaveBeenNthCalledWith(1, "/api/workspaces/acme/initiatives-summary/", {});
    await expect(service.list("acme")).rejects.toBe(apiError);
    expect(response).toBe(summary);
  });
});
