/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type {
  TEpic,
  TEpicPayload,
  TEpicProgress,
  TEpicPropertyValuesResponse,
  TIssueProperty,
  TStatusUpdate,
  TStatusUpdatePayload,
  TStatusUpdateReaction,
  TStatusUpdateReactionPayload,
} from "@plane/types";
import { APIService } from "../api.service";

export class EpicService extends APIService {
  constructor(BASE_URL?: string) {
    super(BASE_URL || API_BASE_URL);
  }

  async list(workspaceSlug: string, projectId: string): Promise<TEpic[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/epics/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async retrieve(workspaceSlug: string, projectId: string, epicId: string): Promise<TEpic> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/epics/${epicId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(workspaceSlug: string, projectId: string, data: TEpicPayload): Promise<TEpic> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/epics/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async update(workspaceSlug: string, projectId: string, epicId: string, data: TEpicPayload): Promise<TEpic> {
    return this.patch(`/api/workspaces/${workspaceSlug}/projects/${projectId}/epics/${epicId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async destroy(workspaceSlug: string, projectId: string, epicId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/epics/${epicId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getProgress(workspaceSlug: string, projectId: string, epicId: string): Promise<TEpicProgress> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/epics/${epicId}/progress/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async listStatusUpdates(workspaceSlug: string, projectId: string, epicId: string): Promise<TStatusUpdate[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/epics/${epicId}/status-updates/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createStatusUpdate(
    workspaceSlug: string,
    projectId: string,
    epicId: string,
    data: TStatusUpdatePayload
  ): Promise<TStatusUpdate> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/epics/${epicId}/status-updates/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateStatusUpdate(
    workspaceSlug: string,
    projectId: string,
    epicId: string,
    statusUpdateId: string,
    data: Partial<TStatusUpdatePayload>
  ): Promise<TStatusUpdate> {
    return this.patch(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/epics/${epicId}/status-updates/${statusUpdateId}/`,
      data
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteStatusUpdate(
    workspaceSlug: string,
    projectId: string,
    epicId: string,
    statusUpdateId: string
  ): Promise<void> {
    return this.delete(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/epics/${epicId}/status-updates/${statusUpdateId}/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async addStatusUpdateReaction(
    workspaceSlug: string,
    projectId: string,
    epicId: string,
    statusUpdateId: string,
    data: TStatusUpdateReactionPayload
  ): Promise<TStatusUpdateReaction> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/epics/${epicId}/status-updates/${statusUpdateId}/reactions/`,
      data
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async removeStatusUpdateReaction(
    workspaceSlug: string,
    projectId: string,
    epicId: string,
    statusUpdateId: string,
    reactionCode: string
  ): Promise<void> {
    return this.delete(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/epics/${epicId}/status-updates/${statusUpdateId}/reactions/${reactionCode}/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getProperties(workspaceSlug: string, issueTypeId: string): Promise<TIssueProperty[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/issue-types/${issueTypeId}/properties/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getPropertyValues(
    workspaceSlug: string,
    projectId: string,
    epicId: string
  ): Promise<TEpicPropertyValuesResponse> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/epics/${epicId}/property-values/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async setPropertyValue(
    workspaceSlug: string,
    projectId: string,
    epicId: string,
    propertyId: string,
    value: TEpicPropertyValuesResponse["property_values"][string]
  ): Promise<TEpicPropertyValuesResponse> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/epics/${epicId}/property-values/`, {
      property_values: {
        [propertyId]: value,
      },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
