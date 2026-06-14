/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { action, computed, makeObservable, observable, runInAction } from "mobx";
import { InitiativeService } from "@plane/services";
import type {
  TInitiative,
  TInitiativeMemberResponse,
  TInitiativePayload,
  TInitiativeProgress,
  TInitiativeState,
  TInitiativeSummary,
} from "@plane/types";
import type { RootStore } from "@/plane-web/store/root.store";

export interface IInitiativeStore {
  loader: boolean;
  progressLoader: boolean;
  error: unknown | null;
  fetchedMap: Record<string, boolean>;
  initiativesMap: Map<string, TInitiative>;
  progressMap: Map<string, TInitiativeProgress>;
  summaryMap: Map<TInitiativeState, TInitiative[]>;
  initiatives: TInitiative[];
  getInitiativeById: (initiativeId: string) => TInitiative | null;
  fetchInitiatives: (workspaceSlug: string) => Promise<TInitiative[]>;
  fetchInitiative: (workspaceSlug: string, initiativeId: string) => Promise<TInitiative>;
  createInitiative: (workspaceSlug: string, data: TInitiativePayload) => Promise<TInitiative>;
  updateInitiative: (workspaceSlug: string, initiativeId: string, data: TInitiativePayload) => Promise<TInitiative>;
  deleteInitiative: (workspaceSlug: string, initiativeId: string) => Promise<void>;
  fetchProgress: (workspaceSlug: string, initiativeId: string) => Promise<TInitiativeProgress>;
  attachEpic: (workspaceSlug: string, initiativeId: string, epicIds: string[]) => Promise<TInitiativeMemberResponse>;
  detachEpic: (workspaceSlug: string, initiativeId: string, epicIds: string[]) => Promise<TInitiativeMemberResponse>;
  attachProject: (
    workspaceSlug: string,
    initiativeId: string,
    projectIds: string[]
  ) => Promise<TInitiativeMemberResponse>;
  detachProject: (
    workspaceSlug: string,
    initiativeId: string,
    projectIds: string[]
  ) => Promise<TInitiativeMemberResponse>;
  fetchSummary: (workspaceSlug: string) => Promise<TInitiativeSummary>;
}

export class InitiativeStore implements IInitiativeStore {
  loader = false;
  progressLoader = false;
  error: unknown | null = null;
  fetchedMap: Record<string, boolean> = {};
  initiativesMap = new Map<string, TInitiative>();
  progressMap = new Map<string, TInitiativeProgress>();
  summaryMap = new Map<TInitiativeState, TInitiative[]>();
  rootStore;
  initiativeService: InitiativeService;

  constructor(_rootStore?: RootStore) {
    makeObservable(this, {
      loader: observable.ref,
      progressLoader: observable.ref,
      error: observable.ref,
      fetchedMap: observable,
      initiativesMap: observable.shallow,
      progressMap: observable.shallow,
      summaryMap: observable.shallow,
      initiatives: computed,
      fetchInitiatives: action,
      fetchInitiative: action,
      createInitiative: action,
      updateInitiative: action,
      deleteInitiative: action,
      fetchProgress: action,
      attachEpic: action,
      detachEpic: action,
      attachProject: action,
      detachProject: action,
      fetchSummary: action,
    });

    this.rootStore = _rootStore;
    this.initiativeService = new InitiativeService();
  }

  get initiatives() {
    const initiatives = Array.from(this.initiativesMap.values());
    initiatives.sort(
      (firstInitiative: TInitiative, secondInitiative: TInitiative) =>
        (firstInitiative.sort_order ?? Number.MAX_SAFE_INTEGER) -
        (secondInitiative.sort_order ?? Number.MAX_SAFE_INTEGER)
    );
    return initiatives;
  }

  getInitiativeById = (initiativeId: string) => this.initiativesMap.get(initiativeId) ?? null;

  private setInitiative = (initiative: TInitiative) => {
    this.initiativesMap.set(initiative.id, initiative);
    if (initiative.progress) this.progressMap.set(initiative.id, initiative.progress);
    if (initiative.progress_snapshot) this.progressMap.set(initiative.id, initiative.progress_snapshot);
  };

  private setError = (error: unknown) => {
    this.error = error;
    this.loader = false;
    this.progressLoader = false;
  };

  fetchInitiatives = async (workspaceSlug: string) => {
    try {
      runInAction(() => {
        this.loader = true;
        this.error = null;
      });

      const initiatives = await this.initiativeService.list(workspaceSlug);

      runInAction(() => {
        this.initiativesMap.clear();
        initiatives.forEach(this.setInitiative);
        this.fetchedMap[workspaceSlug] = true;
        this.loader = false;
      });

      return initiatives;
    } catch (error) {
      runInAction(() => this.setError(error));
      throw error;
    }
  };

  fetchInitiative = async (workspaceSlug: string, initiativeId: string) => {
    try {
      const initiative = await this.initiativeService.retrieve(workspaceSlug, initiativeId);

      runInAction(() => {
        this.setInitiative(initiative);
        this.error = null;
      });

      return initiative;
    } catch (error) {
      runInAction(() => this.setError(error));
      throw error;
    }
  };

  createInitiative = async (workspaceSlug: string, data: TInitiativePayload) => {
    try {
      const initiative = await this.initiativeService.create(workspaceSlug, data);

      runInAction(() => {
        this.setInitiative(initiative);
        this.error = null;
      });

      return initiative;
    } catch (error) {
      runInAction(() => this.setError(error));
      throw error;
    }
  };

  updateInitiative = async (workspaceSlug: string, initiativeId: string, data: TInitiativePayload) => {
    try {
      const initiative = await this.initiativeService.update(workspaceSlug, initiativeId, data);

      runInAction(() => {
        this.setInitiative(initiative);
        this.error = null;
      });

      return initiative;
    } catch (error) {
      runInAction(() => this.setError(error));
      throw error;
    }
  };

  deleteInitiative = async (workspaceSlug: string, initiativeId: string) => {
    try {
      await this.initiativeService.destroy(workspaceSlug, initiativeId);

      runInAction(() => {
        this.initiativesMap.delete(initiativeId);
        this.progressMap.delete(initiativeId);
        this.error = null;
      });
    } catch (error) {
      runInAction(() => this.setError(error));
      throw error;
    }
  };

  fetchProgress = async (workspaceSlug: string, initiativeId: string) => {
    try {
      runInAction(() => {
        this.progressLoader = true;
        this.error = null;
      });

      const progress = await this.initiativeService.getProgress(workspaceSlug, initiativeId);

      runInAction(() => {
        this.progressMap.set(initiativeId, progress);
        const initiative = this.initiativesMap.get(initiativeId);
        if (initiative) this.initiativesMap.set(initiativeId, { ...initiative, progress_snapshot: progress });
        this.progressLoader = false;
      });

      return progress;
    } catch (error) {
      runInAction(() => this.setError(error));
      throw error;
    }
  };

  attachEpic = async (workspaceSlug: string, initiativeId: string, epicIds: string[]) => {
    try {
      const response = await this.initiativeService.attachEpic(workspaceSlug, initiativeId, epicIds);
      await this.fetchProgress(workspaceSlug, initiativeId);
      return response;
    } catch (error) {
      runInAction(() => this.setError(error));
      throw error;
    }
  };

  detachEpic = async (workspaceSlug: string, initiativeId: string, epicIds: string[]) => {
    try {
      const response = await this.initiativeService.detachEpic(workspaceSlug, initiativeId, epicIds);
      await this.fetchProgress(workspaceSlug, initiativeId);
      return response;
    } catch (error) {
      runInAction(() => this.setError(error));
      throw error;
    }
  };

  attachProject = async (workspaceSlug: string, initiativeId: string, projectIds: string[]) => {
    try {
      const response = await this.initiativeService.attachProject(workspaceSlug, initiativeId, projectIds);
      await this.fetchProgress(workspaceSlug, initiativeId);
      return response;
    } catch (error) {
      runInAction(() => this.setError(error));
      throw error;
    }
  };

  detachProject = async (workspaceSlug: string, initiativeId: string, projectIds: string[]) => {
    try {
      const response = await this.initiativeService.detachProject(workspaceSlug, initiativeId, projectIds);
      await this.fetchProgress(workspaceSlug, initiativeId);
      return response;
    } catch (error) {
      runInAction(() => this.setError(error));
      throw error;
    }
  };

  fetchSummary = async (workspaceSlug: string) => {
    try {
      const summary = await this.initiativeService.summary(workspaceSlug);

      runInAction(() => {
        this.summaryMap.clear();
        Object.entries(summary).forEach(([state, initiatives]) => {
          this.summaryMap.set(state as TInitiativeState, initiatives);
          initiatives.forEach(this.setInitiative);
        });
        this.error = null;
      });

      return summary;
    } catch (error) {
      runInAction(() => this.setError(error));
      throw error;
    }
  };
}
