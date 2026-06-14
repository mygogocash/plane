/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { isEmpty, set } from "lodash-es";
import { action, computed, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
import type { TSupportedFilterTypeForUpdate } from "@plane/constants";
import { EIssueFilterType } from "@plane/constants";
import type {
  IIssueDisplayFilterOptions,
  IIssueDisplayProperties,
  IIssueFilters,
  IssuePaginationOptions,
  TIssueKanbanFilters,
  TIssueParams,
  TSupportedFilterForUpdate,
  TWorkItemFilterExpression,
} from "@plane/types";
import { EIssuesStoreType } from "@plane/types";
import { handleIssueQueryParamsByLayout } from "@plane/utils";
import { IssueFiltersService } from "@/services/issue_filter.service";
import type { IBaseIssueFilterStore } from "@/store/issue/helpers/issue-filter-helper.store";
import { IssueFilterHelperStore } from "@/store/issue/helpers/issue-filter-helper.store";
import type { IIssueRootStore } from "@/store/issue/root.store";

export interface IProjectEpicsFilter extends IBaseIssueFilterStore {
  getFilterParams: (
    options: IssuePaginationOptions,
    projectId: string,
    cursor: string | undefined,
    groupId: string | undefined,
    subGroupId: string | undefined
  ) => Partial<Record<TIssueParams, string | boolean>>;
  getIssueFilters(projectId: string): IIssueFilters | undefined;
  fetchFilters: (workspaceSlug: string, projectId: string) => Promise<void>;
  updateFilterExpression: (
    workspaceSlug: string,
    projectId: string,
    filters: TWorkItemFilterExpression
  ) => Promise<void>;
  updateFilters: (
    workspaceSlug: string,
    projectId: string,
    filterType: TSupportedFilterTypeForUpdate,
    filters: TSupportedFilterForUpdate
  ) => Promise<void>;
}

export class ProjectEpicsFilter extends IssueFilterHelperStore implements IProjectEpicsFilter {
  filters: { [projectId: string]: IIssueFilters } = {};
  rootIssueStore: IIssueRootStore;
  issueFilterService: IssueFiltersService;

  constructor(_rootStore: IIssueRootStore) {
    super();
    makeObservable(this, {
      filters: observable,
      issueFilters: computed,
      appliedFilters: computed,
      fetchFilters: action,
      updateFilterExpression: action,
      updateFilters: action,
    });
    this.rootIssueStore = _rootStore;
    this.issueFilterService = new IssueFiltersService();
  }

  get issueFilters() {
    const projectId = this.rootIssueStore.projectId;
    if (!projectId) return undefined;

    return this.getIssueFilters(projectId);
  }

  get appliedFilters() {
    const projectId = this.rootIssueStore.projectId;
    if (!projectId) return undefined;

    return this.getAppliedFilters(projectId);
  }

  getIssueFilters(projectId: string) {
    const displayFilters = this.filters[projectId] || undefined;
    if (isEmpty(displayFilters)) return undefined;

    return this.computedIssueFilters(displayFilters);
  }

  getAppliedFilters(projectId: string) {
    const userFilters = this.getIssueFilters(projectId);
    if (!userFilters) return undefined;

    const filteredParams = handleIssueQueryParamsByLayout(userFilters?.displayFilters?.layout, "issues");
    if (!filteredParams) return undefined;

    return this.computedFilteredParams(userFilters?.richFilters, userFilters?.displayFilters, filteredParams);
  }

  getFilterParams = computedFn(
    (
      options: IssuePaginationOptions,
      projectId: string,
      cursor: string | undefined,
      groupId: string | undefined,
      subGroupId: string | undefined
    ) => {
      const filterParams = this.getAppliedFilters(projectId);
      return this.getPaginationParams(filterParams, options, cursor, groupId, subGroupId);
    }
  );

  fetchFilters = async (workspaceSlug: string, projectId: string) => {
    const filters = await this.issueFilterService.fetchProjectEpicFilters(workspaceSlug, projectId);

    const richFilters = filters?.rich_filters;
    const displayFilters = this.computedDisplayFilters(filters?.display_filters);
    const displayProperties = this.computedDisplayProperties(filters?.display_properties);

    const kanbanFilters = {
      group_by: [],
      sub_group_by: [],
    };
    const currentUserId = this.rootIssueStore.currentUserId;
    if (currentUserId) {
      const localFilters = this.handleIssuesLocalFilters.get(
        EIssuesStoreType.EPIC,
        workspaceSlug,
        projectId,
        currentUserId
      );
      kanbanFilters.group_by = localFilters?.kanban_filters?.group_by || [];
      kanbanFilters.sub_group_by = localFilters?.kanban_filters?.sub_group_by || [];
    }

    runInAction(() => {
      set(this.filters, [projectId, "richFilters"], richFilters);
      set(this.filters, [projectId, "displayFilters"], displayFilters);
      set(this.filters, [projectId, "displayProperties"], displayProperties);
      set(this.filters, [projectId, "kanbanFilters"], kanbanFilters);
    });
  };

  updateFilterExpression: IProjectEpicsFilter["updateFilterExpression"] = async (workspaceSlug, projectId, filters) => {
    try {
      runInAction(() => {
        set(this.filters, [projectId, "richFilters"], filters);
      });

      this.rootIssueStore.projectEpics.fetchIssuesWithExistingPagination(workspaceSlug, projectId, "mutation");
      await this.issueFilterService.patchProjectEpicFilters(workspaceSlug, projectId, {
        rich_filters: filters,
      });
    } catch (error) {
      console.log("error while updating epic rich filters", error);
      throw error;
    }
  };

  updateFilters: IProjectEpicsFilter["updateFilters"] = async (workspaceSlug, projectId, type, filters) => {
    try {
      if (isEmpty(this.filters) || isEmpty(this.filters[projectId])) return;

      const currentFilters = {
        displayFilters: this.filters[projectId].displayFilters as IIssueDisplayFilterOptions,
        displayProperties: this.filters[projectId].displayProperties as IIssueDisplayProperties,
        kanbanFilters: this.filters[projectId].kanbanFilters as TIssueKanbanFilters,
        richFilters: this.filters[projectId].richFilters,
      };

      switch (type) {
        case EIssueFilterType.DISPLAY_FILTERS: {
          const updatedDisplayFilters = filters as IIssueDisplayFilterOptions;
          currentFilters.displayFilters = { ...currentFilters.displayFilters, ...updatedDisplayFilters };

          if (currentFilters.displayFilters.group_by === null) {
            currentFilters.displayFilters.sub_group_by = null;
            updatedDisplayFilters.sub_group_by = null;
          }

          if (
            currentFilters.displayFilters.layout === "kanban" &&
            currentFilters.displayFilters.group_by === currentFilters.displayFilters.sub_group_by
          ) {
            currentFilters.displayFilters.sub_group_by = null;
            updatedDisplayFilters.sub_group_by = null;
          }

          if (currentFilters.displayFilters.layout === "kanban" && currentFilters.displayFilters.group_by === null) {
            currentFilters.displayFilters.group_by = "state";
            updatedDisplayFilters.group_by = "state";
          }

          runInAction(() => {
            Object.keys(updatedDisplayFilters).forEach((key) => {
              set(
                this.filters,
                [projectId, "displayFilters", key],
                updatedDisplayFilters[key as keyof IIssueDisplayFilterOptions]
              );
            });
          });

          if (this.getShouldClearIssues(updatedDisplayFilters)) {
            this.rootIssueStore.projectEpics.clear(true);
          }

          if (this.getShouldReFetchIssues(updatedDisplayFilters)) {
            this.rootIssueStore.projectEpics.fetchIssuesWithExistingPagination(workspaceSlug, projectId, "mutation");
          }

          await this.issueFilterService.patchProjectEpicFilters(workspaceSlug, projectId, {
            display_filters: currentFilters.displayFilters,
          });

          break;
        }
        case EIssueFilterType.DISPLAY_PROPERTIES: {
          const updatedDisplayProperties = filters as IIssueDisplayProperties;
          currentFilters.displayProperties = {
            ...currentFilters.displayProperties,
            ...updatedDisplayProperties,
          };

          runInAction(() => {
            Object.keys(updatedDisplayProperties).forEach((key) => {
              set(
                this.filters,
                [projectId, "displayProperties", key],
                updatedDisplayProperties[key as keyof IIssueDisplayProperties]
              );
            });
          });

          await this.issueFilterService.patchProjectEpicFilters(workspaceSlug, projectId, {
            display_properties: currentFilters.displayProperties,
          });
          break;
        }
        case EIssueFilterType.KANBAN_FILTERS: {
          const updatedKanbanFilters = filters as TIssueKanbanFilters;
          currentFilters.kanbanFilters = { ...currentFilters.kanbanFilters, ...updatedKanbanFilters };

          const currentUserId = this.rootIssueStore.currentUserId;
          if (currentUserId)
            this.handleIssuesLocalFilters.set(EIssuesStoreType.EPIC, type, workspaceSlug, projectId, currentUserId, {
              kanban_filters: currentFilters.kanbanFilters,
            });

          runInAction(() => {
            Object.keys(updatedKanbanFilters).forEach((key) => {
              set(
                this.filters,
                [projectId, "kanbanFilters", key],
                updatedKanbanFilters[key as keyof TIssueKanbanFilters]
              );
            });
          });

          break;
        }
        default:
          break;
      }
    } catch (error) {
      this.fetchFilters(workspaceSlug, projectId);
      throw error;
    }
  };
}
