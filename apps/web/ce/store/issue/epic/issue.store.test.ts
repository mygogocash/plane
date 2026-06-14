/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it, beforeEach, vi } from "vitest";
import { EIssueFilterType } from "@plane/constants";
import type { TIssue, IIssueFilters } from "@plane/types";
// local imports
import { ProjectEpicsFilter } from "./filter.store";
import { ProjectEpics } from "./issue.store";

const serviceMocks = vi.hoisted(() => ({
  createEpic: vi.fn(),
  fetchProjectEpicFilters: vi.fn(),
  listEpics: vi.fn(),
  patchProjectEpicFilters: vi.fn(),
  projectGetProperties: vi.fn(),
  projectUpdateProperties: vi.fn(),
}));

vi.mock("@/lib/store-context", () => ({
  rootStore: {
    projectRoot: {
      project: {
        getProjectIdentifierById: vi.fn(() => "PRJ"),
      },
    },
  },
  store: {
    projectRoot: {
      project: {
        getProjectIdentifierById: vi.fn(() => "PRJ"),
      },
    },
  },
}));

vi.mock("@plane/services", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@plane/services")>();
  return {
    ...actual,
    EpicService: vi.fn(function EpicService() {
      return {
        create: serviceMocks.createEpic,
        list: serviceMocks.listEpics,
      };
    }),
  };
});

vi.mock("@/services/issue_filter.service", () => ({
  IssueFiltersService: vi.fn(function IssueFiltersService() {
    return {
      fetchProjectEpicFilters: serviceMocks.fetchProjectEpicFilters,
      patchProjectEpicFilters: serviceMocks.patchProjectEpicFilters,
    };
  }),
}));

vi.mock("@/services/project", () => ({
  ProjectService: vi.fn(function ProjectService() {
    return {
      getProjectUserProperties: serviceMocks.projectGetProperties,
      updateProjectUserProperties: serviceMocks.projectUpdateProperties,
    };
  }),
}));

const makeRootStore = () => {
  const issuesMap: Record<string, TIssue> = {};
  return {
    currentUserId: "user-1",
    issueDetail: {
      relation: {
        extractRelationsFromIssues: vi.fn(),
      },
    },
    issues: {
      addIssue: vi.fn((issues: TIssue[]) => {
        issues.forEach((issue) => {
          issuesMap[issue.id] = issue;
        });
      }),
      getIssueById: vi.fn((issueId: string) => issuesMap[issueId]),
      getIssuesByIds: vi.fn((issueIds: string[]) => issueIds.map((issueId) => issuesMap[issueId]).filter(Boolean)),
      removeIssue: vi.fn(),
      updateIssue: vi.fn(),
    },
    projectEpics: {
      clear: vi.fn(),
      fetchIssuesWithExistingPagination: vi.fn(),
    },
    projectId: "project-1",
    projectIssues: {
      clear: vi.fn(),
      fetchIssuesWithExistingPagination: vi.fn(),
    },
    rootStore: {
      projectRoot: {
        project: {
          fetchProjectDetails: vi.fn(),
        },
      },
      router: {
        projectId: "project-1",
      },
    },
  } as any;
};

describe("ProjectEpics store", () => {
  beforeEach(() => {
    Object.values(serviceMocks).forEach((mock) => mock.mockReset());
    serviceMocks.projectUpdateProperties.mockResolvedValue({});
    serviceMocks.patchProjectEpicFilters.mockResolvedValue({});
  });

  it("fetches epics with EpicService and stores them by id", async () => {
    const rootStore = makeRootStore();
    const filterStore = new ProjectEpicsFilter(rootStore);
    const store = new ProjectEpics(rootStore, filterStore);
    const epic = { id: "epic-1", name: "Launch readiness", is_epic: true } as TIssue;
    serviceMocks.listEpics.mockResolvedValue([epic]);

    await store.fetchEpics("acme", "project-1");

    expect(serviceMocks.listEpics).toHaveBeenCalledWith("acme", "project-1");
    expect(store.epicsMap.get("epic-1")).toEqual(epic);
    expect(rootStore.issues.addIssue).toHaveBeenCalledWith([epic]);
  });

  it("creates an epic and adds it to the epic map", async () => {
    const rootStore = makeRootStore();
    const filterStore = new ProjectEpicsFilter(rootStore);
    const store = new ProjectEpics(rootStore, filterStore);
    const epic = { id: "epic-2", name: "Customer beta", is_epic: true } as TIssue;
    serviceMocks.createEpic.mockResolvedValue(epic);

    const response = await store.createEpic("acme", "project-1", { name: "Customer beta" });

    expect(serviceMocks.createEpic).toHaveBeenCalledWith("acme", "project-1", { name: "Customer beta" });
    expect(response).toEqual(epic);
    expect(store.epicsMap.get("epic-2")).toEqual(epic);
  });

  it("persists epic filters across a layout switch", async () => {
    const rootStore = makeRootStore();
    const filterStore = new ProjectEpicsFilter(rootStore);
    const richFilters = { condition: "AND", children: [] } as unknown as IIssueFilters["richFilters"];
    filterStore.filters = {
      "project-1": {
        displayFilters: {
          group_by: null,
          layout: "list",
          order_by: "sort_order",
          sub_group_by: null,
        },
        displayProperties: {},
        kanbanFilters: {
          group_by: [],
          sub_group_by: [],
        },
        richFilters,
      },
    };

    await filterStore.updateFilters("acme", "project-1", EIssueFilterType.DISPLAY_FILTERS, {
      group_by: "state",
      layout: "kanban",
    });

    expect(filterStore.getIssueFilters("project-1")?.richFilters).toEqual(richFilters);
    expect(filterStore.getIssueFilters("project-1")?.displayFilters?.layout).toBe("kanban");
    expect(serviceMocks.patchProjectEpicFilters).toHaveBeenCalledWith("acme", "project-1", {
      display_filters: expect.objectContaining({
        group_by: "state",
        layout: "kanban",
      }),
    });
    expect(rootStore.projectEpics.clear).toHaveBeenCalledWith(true);
    expect(rootStore.projectIssues.fetchIssuesWithExistingPagination).not.toHaveBeenCalled();
  });
});
