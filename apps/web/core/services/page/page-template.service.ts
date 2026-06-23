/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type { TPage, TPageTemplate, TPageTemplateApplyPayload, TPageTemplatePayload } from "@plane/types";

import { APIService } from "@/services/api.service";

export class PageTemplateService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(workspaceSlug: string, projectId?: string): Promise<TPageTemplate[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/page-templates/`, {
      params: projectId ? { project_id: projectId } : undefined,
    }).then((response) => response?.data);
  }

  async create(workspaceSlug: string, payload: TPageTemplatePayload): Promise<TPageTemplate> {
    return this.post(`/api/workspaces/${workspaceSlug}/page-templates/`, payload).then((response) => response?.data);
  }

  async update(
    workspaceSlug: string,
    templateId: string,
    payload: Partial<TPageTemplatePayload>
  ): Promise<TPageTemplate> {
    return this.patch(`/api/workspaces/${workspaceSlug}/page-templates/${templateId}/`, payload).then(
      (response) => response?.data
    );
  }

  async remove(workspaceSlug: string, templateId: string): Promise<void> {
    await this.delete(`/api/workspaces/${workspaceSlug}/page-templates/${templateId}/`);
  }

  async apply(workspaceSlug: string, templateId: string, payload: TPageTemplateApplyPayload): Promise<TPage> {
    return this.post(`/api/workspaces/${workspaceSlug}/page-templates/${templateId}/apply/`, payload).then(
      (response) => response?.data
    );
  }
}

export const pageTemplateService = new PageTemplateService();
