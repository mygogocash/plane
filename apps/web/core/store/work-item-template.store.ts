/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { set } from "lodash-es";
import { action, makeObservable, observable, runInAction } from "mobx";
// plane imports
import type { TWorkItemTemplate, TWorkItemTemplatePayload } from "@plane/types";
// services
import { WorkItemTemplateService, type TWorkItemTemplateListParams } from "@/services/work-item-template.service";
// store
import type { CoreRootStore } from "./root.store";

const EMPTY_TEMPLATES: TWorkItemTemplate[] = [];

export interface IWorkItemTemplateStore {
  templatesByProjectId: Record<string, TWorkItemTemplate[]>;
  loadingByProjectId: Record<string, boolean>;
  fetchedActiveProjectIds: Record<string, boolean>;
  fetchedAllProjectIds: Record<string, boolean>;
  getTemplatesForProject: (projectId: string) => TWorkItemTemplate[];
  getTemplateById: (templateId: string) => TWorkItemTemplate | undefined;
  getActiveTemplatesForProject: (projectId: string, issueTypeId?: string | null) => TWorkItemTemplate[];
  getTemplatesLoadingForProject: (projectId: string) => boolean;
  hasFetchedTemplatesForProject: (projectId: string, includeInactive?: boolean) => boolean;
  fetchTemplates: (
    workspaceSlug: string,
    projectId: string,
    params?: TWorkItemTemplateListParams
  ) => Promise<TWorkItemTemplate[]>;
  createTemplate: (
    workspaceSlug: string,
    projectId: string,
    data: TWorkItemTemplatePayload
  ) => Promise<TWorkItemTemplate>;
  updateTemplate: (
    workspaceSlug: string,
    projectId: string,
    templateId: string,
    data: Partial<TWorkItemTemplatePayload>
  ) => Promise<TWorkItemTemplate>;
  deleteTemplate: (workspaceSlug: string, projectId: string, templateId: string) => Promise<void>;
}

export class WorkItemTemplateStore implements IWorkItemTemplateStore {
  templatesByProjectId: Record<string, TWorkItemTemplate[]> = {};
  loadingByProjectId: Record<string, boolean> = {};
  fetchedActiveProjectIds: Record<string, boolean> = {};
  fetchedAllProjectIds: Record<string, boolean> = {};
  rootStore: CoreRootStore;
  templateService: WorkItemTemplateService;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      templatesByProjectId: observable,
      loadingByProjectId: observable,
      fetchedActiveProjectIds: observable,
      fetchedAllProjectIds: observable,
      fetchTemplates: action,
      createTemplate: action,
      updateTemplate: action,
      deleteTemplate: action,
    });
    this.rootStore = _rootStore;
    this.templateService = new WorkItemTemplateService();
  }

  getTemplatesForProject = (projectId: string): TWorkItemTemplate[] =>
    this.templatesByProjectId[projectId] ?? EMPTY_TEMPLATES;

  getTemplateById = (templateId: string): TWorkItemTemplate | undefined =>
    Object.values(this.templatesByProjectId)
      .flat()
      .find((template) => template.id === templateId);

  getActiveTemplatesForProject = (projectId: string, issueTypeId?: string | null): TWorkItemTemplate[] =>
    this.getTemplatesForProject(projectId).filter((template) => {
      if (!template.is_active) return false;
      if (!issueTypeId || !template.issue_type) return true;
      return template.issue_type === issueTypeId;
    });

  getTemplatesLoadingForProject = (projectId: string): boolean => this.loadingByProjectId[projectId] ?? false;

  hasFetchedTemplatesForProject = (projectId: string, includeInactive = false): boolean =>
    includeInactive ? this.fetchedAllProjectIds[projectId] === true : this.fetchedActiveProjectIds[projectId] === true;

  fetchTemplates = async (
    workspaceSlug: string,
    projectId: string,
    params: TWorkItemTemplateListParams = {}
  ): Promise<TWorkItemTemplate[]> => {
    runInAction(() => {
      set(this.loadingByProjectId, [projectId], true);
    });

    try {
      const response = await this.templateService.list(workspaceSlug, projectId, params);
      runInAction(() => {
        const nextTemplates = params.includeInactive
          ? response
          : [
              ...response,
              ...this.getTemplatesForProject(projectId).filter(
                (template) => !template.is_active && !response.some((row) => row.id === template.id)
              ),
            ];
        set(this.templatesByProjectId, [projectId], nextTemplates);
        set(this.fetchedActiveProjectIds, [projectId], true);
        if (params.includeInactive) set(this.fetchedAllProjectIds, [projectId], true);
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

  createTemplate = async (
    workspaceSlug: string,
    projectId: string,
    data: TWorkItemTemplatePayload
  ): Promise<TWorkItemTemplate> => {
    const response = await this.templateService.create(workspaceSlug, projectId, data);
    runInAction(() => {
      set(this.templatesByProjectId, [projectId], [...this.getTemplatesForProject(projectId), response]);
    });
    return response;
  };

  updateTemplate = async (
    workspaceSlug: string,
    projectId: string,
    templateId: string,
    data: Partial<TWorkItemTemplatePayload>
  ): Promise<TWorkItemTemplate> => {
    const response = await this.templateService.update(workspaceSlug, projectId, templateId, data);
    runInAction(() => {
      set(
        this.templatesByProjectId,
        [projectId],
        this.getTemplatesForProject(projectId).map((template) => (template.id === templateId ? response : template))
      );
    });
    return response;
  };

  deleteTemplate = async (workspaceSlug: string, projectId: string, templateId: string): Promise<void> => {
    await this.templateService.deleteTemplate(workspaceSlug, projectId, templateId);
    runInAction(() => {
      set(
        this.templatesByProjectId,
        [projectId],
        this.getTemplatesForProject(projectId).filter((template) => template.id !== templateId)
      );
    });
  };
}
