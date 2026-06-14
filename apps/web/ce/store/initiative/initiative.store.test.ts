/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { INITIATIVE_STATES } from "@plane/constants";
import type { TInitiative } from "@plane/types";
// local imports
import { InitiativeStore } from "./initiative.store";

const serviceMocks = vi.hoisted(() => ({
  attachEpic: vi.fn(),
  attachProject: vi.fn(),
  create: vi.fn(),
  destroy: vi.fn(),
  detachEpic: vi.fn(),
  detachProject: vi.fn(),
  getProgress: vi.fn(),
  list: vi.fn(),
  retrieve: vi.fn(),
  summary: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@plane/services", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@plane/services")>();
  return {
    ...actual,
    InitiativeService: vi.fn(function InitiativeService() {
      return serviceMocks;
    }),
  };
});

describe("InitiativeStore", () => {
  beforeEach(() => {
    Object.values(serviceMocks).forEach((mock) => mock.mockReset());
  });

  it("uses the exact five lifecycle states for initiative columns", () => {
    expect(INITIATIVE_STATES.map((state) => state.value)).toEqual([
      "DRAFT",
      "PLANNED",
      "ACTIVE",
      "COMPLETED",
      "CLOSED",
    ]);
  });

  it("fetches initiatives and stores them in an observable map keyed by id", async () => {
    const initiative = { id: "initiative-1", name: "Launch readiness", state: "ACTIVE" } as TInitiative;
    serviceMocks.list.mockResolvedValue([initiative]);
    const store = new InitiativeStore();

    const response = await store.fetchInitiatives("acme");

    expect(serviceMocks.list).toHaveBeenCalledWith("acme");
    expect(response).toEqual([initiative]);
    expect(store.initiativesMap.get("initiative-1")).toEqual(initiative);
    expect(store.getInitiativeById("initiative-1")).toEqual(initiative);
    expect(store.loader).toBe(false);
    expect(store.error).toBeNull();
  });

  it("records fetch errors and does not leave partial initiative data", async () => {
    const store = new InitiativeStore();
    const apiError = { error: "server_error" };
    serviceMocks.list.mockRejectedValue(apiError);

    await expect(store.fetchInitiatives("acme")).rejects.toBe(apiError);

    expect(store.loader).toBe(false);
    expect(store.error).toBe(apiError);
    expect(store.initiativesMap.size).toBe(0);
  });

  it("refreshes progress after membership updates without refetching the full list", async () => {
    const store = new InitiativeStore();
    const progress = {
      counts_by_group: {
        backlog: 0,
        cancelled: 0,
        completed: 1,
        started: 1,
        unstarted: 0,
      },
      percent_complete: 50,
      total_count: 2,
    };
    serviceMocks.attachEpic.mockResolvedValue({ attached_epic_ids: ["epic-1"] });
    serviceMocks.attachProject.mockResolvedValue({ attached_project_ids: ["project-1"] });
    serviceMocks.getProgress.mockResolvedValue(progress);

    await store.attachEpic("acme", "initiative-1", ["epic-1"]);
    await store.attachProject("acme", "initiative-1", ["project-1"]);

    expect(serviceMocks.attachEpic).toHaveBeenCalledWith("acme", "initiative-1", ["epic-1"]);
    expect(serviceMocks.attachProject).toHaveBeenCalledWith("acme", "initiative-1", ["project-1"]);
    expect(serviceMocks.getProgress).toHaveBeenCalledTimes(2);
    expect(serviceMocks.list).not.toHaveBeenCalled();
    expect(store.progressMap.get("initiative-1")).toEqual(progress);
  });
});
