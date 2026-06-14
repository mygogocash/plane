/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";
import type {
  TRecurringWorkItem,
  TRecurringWorkItemCreatePayload,
  TRecurringWorkItemRun,
  TRecurringWorkItemUpdatePayload,
} from "@/types/recurring-work-item";
// services
import { APIService } from "@/services/api.service";

export class RecurringWorkItemService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(workspaceSlug: string, projectId: string): Promise<TRecurringWorkItem[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/recurring-work-items/`)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async create(
    workspaceSlug: string,
    projectId: string,
    data: TRecurringWorkItemCreatePayload
  ): Promise<TRecurringWorkItem> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/recurring-work-items/`, data)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async update(
    workspaceSlug: string,
    projectId: string,
    recurrenceId: string,
    data: TRecurringWorkItemUpdatePayload
  ): Promise<TRecurringWorkItem> {
    return this.patch(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/recurring-work-items/${recurrenceId}/`,
      data
    )
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async deleteRecurrence(workspaceSlug: string, projectId: string, recurrenceId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/recurring-work-items/${recurrenceId}/`)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async runs(workspaceSlug: string, projectId: string, recurrenceId: string): Promise<TRecurringWorkItemRun[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/recurring-work-items/${recurrenceId}/runs/`)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }
}
