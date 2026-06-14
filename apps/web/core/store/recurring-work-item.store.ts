/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { set } from "lodash-es";
import { action, makeObservable, observable, runInAction } from "mobx";
// plane imports
import type {
  TRecurringWorkItem,
  TRecurringWorkItemCreatePayload,
  TRecurringWorkItemRun,
  TRecurringWorkItemUpdatePayload,
} from "@/types/recurring-work-item";
// services
import { RecurringWorkItemService } from "@/services/recurring-work-item.service";
// store
import type { CoreRootStore } from "./root.store";

const EMPTY_RECURRENCES: TRecurringWorkItem[] = [];
const EMPTY_RUNS: TRecurringWorkItemRun[] = [];

export interface IRecurringWorkItemStore {
  recurrencesByProjectId: Record<string, TRecurringWorkItem[]>;
  runsByRecurrenceId: Record<string, TRecurringWorkItemRun[]>;
  loadingByProjectId: Record<string, boolean>;
  runsLoadingByRecurrenceId: Record<string, boolean>;
  fetchedProjectIds: Record<string, boolean>;
  fetchedRunsByRecurrenceId: Record<string, boolean>;
  getRecurrencesForProject: (projectId: string) => TRecurringWorkItem[];
  getRecurrenceById: (recurrenceId: string) => TRecurringWorkItem | undefined;
  getRunsForRecurrence: (recurrenceId: string) => TRecurringWorkItemRun[];
  getRecurrencesLoadingForProject: (projectId: string) => boolean;
  getRunsLoadingForRecurrence: (recurrenceId: string) => boolean;
  hasFetchedRecurrencesForProject: (projectId: string) => boolean;
  hasFetchedRunsForRecurrence: (recurrenceId: string) => boolean;
  fetchRecurrences: (workspaceSlug: string, projectId: string) => Promise<TRecurringWorkItem[]>;
  createRecurrence: (
    workspaceSlug: string,
    projectId: string,
    data: TRecurringWorkItemCreatePayload
  ) => Promise<TRecurringWorkItem>;
  updateRecurrence: (
    workspaceSlug: string,
    projectId: string,
    recurrenceId: string,
    data: TRecurringWorkItemUpdatePayload
  ) => Promise<TRecurringWorkItem>;
  deleteRecurrence: (workspaceSlug: string, projectId: string, recurrenceId: string) => Promise<void>;
  fetchRuns: (workspaceSlug: string, projectId: string, recurrenceId: string) => Promise<TRecurringWorkItemRun[]>;
}

export class RecurringWorkItemStore implements IRecurringWorkItemStore {
  recurrencesByProjectId: Record<string, TRecurringWorkItem[]> = {};
  runsByRecurrenceId: Record<string, TRecurringWorkItemRun[]> = {};
  loadingByProjectId: Record<string, boolean> = {};
  runsLoadingByRecurrenceId: Record<string, boolean> = {};
  fetchedProjectIds: Record<string, boolean> = {};
  fetchedRunsByRecurrenceId: Record<string, boolean> = {};
  rootStore: CoreRootStore;
  recurrenceService: RecurringWorkItemService;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      recurrencesByProjectId: observable,
      runsByRecurrenceId: observable,
      loadingByProjectId: observable,
      runsLoadingByRecurrenceId: observable,
      fetchedProjectIds: observable,
      fetchedRunsByRecurrenceId: observable,
      fetchRecurrences: action,
      createRecurrence: action,
      updateRecurrence: action,
      deleteRecurrence: action,
      fetchRuns: action,
    });
    this.rootStore = _rootStore;
    this.recurrenceService = new RecurringWorkItemService();
  }

  getRecurrencesForProject = (projectId: string): TRecurringWorkItem[] =>
    this.recurrencesByProjectId[projectId] ?? EMPTY_RECURRENCES;

  getRecurrenceById = (recurrenceId: string): TRecurringWorkItem | undefined =>
    Object.values(this.recurrencesByProjectId)
      .flat()
      .find((recurrence) => recurrence.id === recurrenceId);

  getRunsForRecurrence = (recurrenceId: string): TRecurringWorkItemRun[] =>
    this.runsByRecurrenceId[recurrenceId] ?? EMPTY_RUNS;

  getRecurrencesLoadingForProject = (projectId: string): boolean => this.loadingByProjectId[projectId] ?? false;

  getRunsLoadingForRecurrence = (recurrenceId: string): boolean =>
    this.runsLoadingByRecurrenceId[recurrenceId] ?? false;

  hasFetchedRecurrencesForProject = (projectId: string): boolean => this.fetchedProjectIds[projectId] === true;

  hasFetchedRunsForRecurrence = (recurrenceId: string): boolean =>
    this.fetchedRunsByRecurrenceId[recurrenceId] === true;

  fetchRecurrences = async (workspaceSlug: string, projectId: string): Promise<TRecurringWorkItem[]> => {
    runInAction(() => {
      set(this.loadingByProjectId, [projectId], true);
    });

    try {
      const response = await this.recurrenceService.list(workspaceSlug, projectId);
      runInAction(() => {
        set(this.recurrencesByProjectId, [projectId], response);
        set(this.fetchedProjectIds, [projectId], true);
        set(this.loadingByProjectId, [projectId], false);
      });
      return response;
    } catch (error) {
      runInAction(() => {
        set(this.loadingByProjectId, [projectId], false);
      });
      throw error;
    }
  };

  createRecurrence = async (
    workspaceSlug: string,
    projectId: string,
    data: TRecurringWorkItemCreatePayload
  ): Promise<TRecurringWorkItem> => {
    const response = await this.recurrenceService.create(workspaceSlug, projectId, data);
    runInAction(() => {
      set(this.recurrencesByProjectId, [projectId], [...this.getRecurrencesForProject(projectId), response]);
    });
    return response;
  };

  updateRecurrence = async (
    workspaceSlug: string,
    projectId: string,
    recurrenceId: string,
    data: TRecurringWorkItemUpdatePayload
  ): Promise<TRecurringWorkItem> => {
    const response = await this.recurrenceService.update(workspaceSlug, projectId, recurrenceId, data);
    runInAction(() => {
      set(
        this.recurrencesByProjectId,
        [projectId],
        this.getRecurrencesForProject(projectId).map((recurrence) =>
          recurrence.id === recurrenceId ? response : recurrence
        )
      );
    });
    return response;
  };

  deleteRecurrence = async (workspaceSlug: string, projectId: string, recurrenceId: string): Promise<void> => {
    await this.recurrenceService.deleteRecurrence(workspaceSlug, projectId, recurrenceId);
    runInAction(() => {
      set(
        this.recurrencesByProjectId,
        [projectId],
        this.getRecurrencesForProject(projectId).filter((recurrence) => recurrence.id !== recurrenceId)
      );
      set(this.runsByRecurrenceId, [recurrenceId], EMPTY_RUNS);
      set(this.fetchedRunsByRecurrenceId, [recurrenceId], false);
    });
  };

  fetchRuns = async (
    workspaceSlug: string,
    projectId: string,
    recurrenceId: string
  ): Promise<TRecurringWorkItemRun[]> => {
    runInAction(() => {
      set(this.runsLoadingByRecurrenceId, [recurrenceId], true);
    });

    try {
      const response = await this.recurrenceService.runs(workspaceSlug, projectId, recurrenceId);
      runInAction(() => {
        set(this.runsByRecurrenceId, [recurrenceId], response);
        set(this.fetchedRunsByRecurrenceId, [recurrenceId], true);
        set(this.runsLoadingByRecurrenceId, [recurrenceId], false);
      });
      return response;
    } catch (error) {
      runInAction(() => {
        set(this.runsLoadingByRecurrenceId, [recurrenceId], false);
      });
      throw error;
    }
  };
}
