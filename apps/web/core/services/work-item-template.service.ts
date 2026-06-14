/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";
import type { TWorkItemTemplate, TWorkItemTemplatePayload } from "@plane/types";
// services
import { APIService } from "@/services/api.service";

export type TWorkItemTemplateListParams = {
  includeInactive?: boolean;
  issueTypeId?: string | null;
};

export class WorkItemTemplateService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(
    workspaceSlug: string,
    projectId: string,
    params: TWorkItemTemplateListParams = {}
  ): Promise<TWorkItemTemplate[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/work-item-templates/`, {
      params: {
        include_inactive: params.includeInactive ? "true" : undefined,
        issue_type: params.issueTypeId || undefined,
      },
    })
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async create(workspaceSlug: string, projectId: string, data: TWorkItemTemplatePayload): Promise<TWorkItemTemplate> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/work-item-templates/`, data)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async update(
    workspaceSlug: string,
    projectId: string,
    templateId: string,
    data: Partial<TWorkItemTemplatePayload>
  ): Promise<TWorkItemTemplate> {
    return this.patch(`/api/workspaces/${workspaceSlug}/projects/${projectId}/work-item-templates/${templateId}/`, data)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async deleteTemplate(workspaceSlug: string, projectId: string, templateId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/work-item-templates/${templateId}/`)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }
}
