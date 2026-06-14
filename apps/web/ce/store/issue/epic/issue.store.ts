/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { action, makeObservable, observable, runInAction } from "mobx";
import { EpicService } from "@plane/services";
import type {
  TBulkOperationsPayload,
  TEpic,
  TEpicPayload,
  TIssue,
  TIssueCreatePayload,
  TLoader,
  TIssuesResponse,
  ViewFlags,
  IssuePaginationOptions,
} from "@plane/types";
import { EIssueServiceType } from "@plane/types";
import type { IBaseIssuesStore } from "@/store/issue/helpers/base-issues.store";
import { BaseIssuesStore } from "@/store/issue/helpers/base-issues.store";
import type { IIssueRootStore } from "@/store/issue/root.store";
import type { IProjectEpicsFilter } from "./filter.store";

export interface IProjectEpics extends IBaseIssuesStore {
  viewFlags: ViewFlags;
  epicsMap: Map<string, TEpic>;
  fetchEpics: (workspaceSlug: string, projectId: string) => Promise<TEpic[]>;
  createEpic: (workspaceSlug: string, projectId: string, data: TEpicPayload) => Promise<TEpic>;
  fetchIssues: (
    workspaceSlug: string,
    projectId: string,
    loadType: TLoader,
    options: IssuePaginationOptions
  ) => Promise<TIssuesResponse | undefined>;
  fetchIssuesWithExistingPagination: (
    workspaceSlug: string,
    projectId: string,
    loadType: TLoader
  ) => Promise<TIssuesResponse | undefined>;
  fetchNextIssues: (
    workspaceSlug: string,
    projectId: string,
    groupId?: string,
    subGroupId?: string
  ) => Promise<TIssuesResponse | undefined>;
  createIssue: (workspaceSlug: string, projectId: string, data: TIssueCreatePayload) => Promise<TIssue>;
  updateIssue: (workspaceSlug: string, projectId: string, issueId: string, data: Partial<TIssue>) => Promise<void>;
  archiveIssue: (workspaceSlug: string, projectId: string, issueId: string) => Promise<void>;
  quickAddIssue: (workspaceSlug: string, projectId: string, data: TIssue) => Promise<TIssue | undefined>;
  removeBulkIssues: (workspaceSlug: string, projectId: string, issueIds: string[]) => Promise<void>;
  archiveBulkIssues: (workspaceSlug: string, projectId: string, issueIds: string[]) => Promise<void>;
  bulkUpdateProperties: (workspaceSlug: string, projectId: string, data: TBulkOperationsPayload) => Promise<void>;
}

export class ProjectEpics extends BaseIssuesStore implements IProjectEpics {
  viewFlags = {
    enableInlineEditing: true,
    enableIssueCreation: true,
    enableQuickAdd: true,
  };
  epicsMap = new Map<string, TEpic>();
  issueFilterStore: IProjectEpicsFilter;
  epicService: EpicService;
  router;

  constructor(_rootStore: IIssueRootStore, issueFilterStore: IProjectEpicsFilter) {
    super(_rootStore, issueFilterStore, false, EIssueServiceType.EPICS);
    makeObservable(this, {
      epicsMap: observable,
      fetchEpics: action,
      createEpic: action,
      fetchIssues: action,
      fetchNextIssues: action,
      fetchIssuesWithExistingPagination: action,
      quickAddIssue: action,
    });
    this.issueFilterStore = issueFilterStore;
    this.epicService = new EpicService();
    this.router = _rootStore.rootStore.router;
  }

  fetchParentStats = async (workspaceSlug: string, projectId?: string) => {
    if (!projectId) return;

    this.rootIssueStore.rootStore.projectRoot.project.fetchProjectDetails(workspaceSlug, projectId);
  };

  updateParentStats = () => {};

  fetchEpics = async (workspaceSlug: string, projectId: string) => {
    const epics = await this.epicService.list(workspaceSlug, projectId);
    const normalizedEpics = epics.map((epic) => Object.assign({}, epic, { is_epic: true }));

    runInAction(() => {
      this.epicsMap.clear();
      normalizedEpics.forEach((epic) => this.epicsMap.set(epic.id, epic));
    });
    this.rootIssueStore.issues.addIssue(normalizedEpics);

    return normalizedEpics;
  };

  createEpic = async (workspaceSlug: string, projectId: string, data: TEpicPayload) => {
    const response = await this.epicService.create(workspaceSlug, projectId, data);
    const epic = { ...response, is_epic: true };

    runInAction(() => {
      this.epicsMap.set(epic.id, epic);
    });
    this.addIssue(epic, true);
    await this.fetchParentStats(workspaceSlug, projectId);

    return epic;
  };

  fetchIssues = async (
    workspaceSlug: string,
    projectId: string,
    loadType: TLoader = "init-loader",
    options: IssuePaginationOptions,
    isExistingPaginationOptions = false
  ) => {
    try {
      runInAction(() => {
        this.setLoader(loadType);
        this.clear(!isExistingPaginationOptions);
      });

      const params = this.issueFilterStore?.getFilterParams(options, projectId, undefined, undefined, undefined);
      const response = await this.issueService.getIssues(workspaceSlug, projectId, params, {
        signal: this.controller.signal,
      });

      this.onfetchIssues(response, options, workspaceSlug, projectId, undefined, !isExistingPaginationOptions);
      return response;
    } catch (error) {
      this.setLoader(undefined);
      throw error;
    }
  };

  fetchNextIssues = async (workspaceSlug: string, projectId: string, groupId?: string, subGroupId?: string) => {
    const cursorObject = this.getPaginationData(groupId, subGroupId);
    if (!this.paginationOptions || (cursorObject && !cursorObject?.nextPageResults)) return;

    try {
      this.setLoader("pagination", groupId, subGroupId);

      const params = this.issueFilterStore?.getFilterParams(
        this.paginationOptions,
        projectId,
        this.getNextCursor(groupId, subGroupId),
        groupId,
        subGroupId
      );
      const response = await this.issueService.getIssues(workspaceSlug, projectId, params);

      this.onfetchNexIssues(response, groupId, subGroupId);
      return response;
    } catch (error) {
      this.setLoader(undefined, groupId, subGroupId);
      throw error;
    }
  };

  fetchIssuesWithExistingPagination = async (
    workspaceSlug: string,
    projectId: string,
    loadType: TLoader = "mutation"
  ) => {
    if (!this.paginationOptions) return;
    return await this.fetchIssues(workspaceSlug, projectId, loadType, this.paginationOptions, true);
  };

  override createIssue = async (workspaceSlug: string, projectId: string, data: TIssueCreatePayload) => {
    const response = await super.createIssue(workspaceSlug, projectId, data, "", projectId === this.router.projectId);
    runInAction(() => {
      this.epicsMap.set(response.id, { ...response, is_epic: true });
    });
    return response;
  };

  archiveBulkIssues = this.bulkArchiveIssues;
  quickAddIssue = this.issueQuickAdd;
  updateIssue = this.issueUpdate;
  archiveIssue = this.issueArchive;
}
