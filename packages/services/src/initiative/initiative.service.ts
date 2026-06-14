/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type {
  TInitiative,
  TInitiativeMemberResponse,
  TInitiativePayload,
  TInitiativeProgress,
  TInitiativeSummary,
} from "@plane/types";
import { APIService } from "../api.service";

export class InitiativeService extends APIService {
  constructor(BASE_URL?: string) {
    super(BASE_URL || API_BASE_URL);
  }

  async list(workspaceSlug: string): Promise<TInitiative[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/initiatives/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async retrieve(workspaceSlug: string, initiativeId: string): Promise<TInitiative> {
    return this.get(`/api/workspaces/${workspaceSlug}/initiatives/${initiativeId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(workspaceSlug: string, data: TInitiativePayload): Promise<TInitiative> {
    return this.post(`/api/workspaces/${workspaceSlug}/initiatives/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async update(workspaceSlug: string, initiativeId: string, data: TInitiativePayload): Promise<TInitiative> {
    return this.patch(`/api/workspaces/${workspaceSlug}/initiatives/${initiativeId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async destroy(workspaceSlug: string, initiativeId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/initiatives/${initiativeId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getProgress(workspaceSlug: string, initiativeId: string): Promise<TInitiativeProgress> {
    return this.get(`/api/workspaces/${workspaceSlug}/initiatives/${initiativeId}/progress/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async attachEpic(workspaceSlug: string, initiativeId: string, epicIds: string[]): Promise<TInitiativeMemberResponse> {
    return this.post(`/api/workspaces/${workspaceSlug}/initiatives/${initiativeId}/epics/`, { epic_ids: epicIds })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async detachEpic(workspaceSlug: string, initiativeId: string, epicIds: string[]): Promise<TInitiativeMemberResponse> {
    return this.delete(`/api/workspaces/${workspaceSlug}/initiatives/${initiativeId}/epics/`, { epic_ids: epicIds })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async attachProject(
    workspaceSlug: string,
    initiativeId: string,
    projectIds: string[]
  ): Promise<TInitiativeMemberResponse> {
    return this.post(`/api/workspaces/${workspaceSlug}/initiatives/${initiativeId}/projects/`, {
      project_ids: projectIds,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async detachProject(
    workspaceSlug: string,
    initiativeId: string,
    projectIds: string[]
  ): Promise<TInitiativeMemberResponse> {
    return this.delete(`/api/workspaces/${workspaceSlug}/initiatives/${initiativeId}/projects/`, {
      project_ids: projectIds,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async summary(workspaceSlug: string): Promise<TInitiativeSummary> {
    return this.get(`/api/workspaces/${workspaceSlug}/initiatives-summary/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
