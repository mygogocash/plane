/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";
import type {
  IApprovalDecisionPayload,
  ISuggestedTransition,
  IWorkflowConfig,
  IWorkflowTransition,
  IWorkflowTransitionFilters,
  IWorkItemApproval,
  TWorkflowStatus,
} from "@plane/types";
// services
import { APIService } from "@/services/api.service";

/**
 * Client for the Workflows & Approvals API (WF-T4–T9). All routes are scoped to
 * ``workspaces/<slug>/projects/<projectId>/``. The server is authoritative — the store
 * layered on top (WF-T10) treats every rejection (403/409) as the source of truth.
 */
export class WorkflowService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async listTransitions(
    workspaceSlug: string,
    projectId: string,
    filters?: IWorkflowTransitionFilters
  ): Promise<IWorkflowTransition[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/workflow-transitions/`, {
      params: filters,
    })
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async createTransition(
    workspaceSlug: string,
    projectId: string,
    data: Partial<IWorkflowTransition>
  ): Promise<IWorkflowTransition> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/workflow-transitions/`, data)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async updateTransition(
    workspaceSlug: string,
    projectId: string,
    transitionId: string,
    data: Partial<IWorkflowTransition>
  ): Promise<IWorkflowTransition> {
    return this.patch(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/workflow-transitions/${transitionId}/`,
      data
    )
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async deleteTransition(workspaceSlug: string, projectId: string, transitionId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/workflow-transitions/${transitionId}/`)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  /** Move a work item to ``toState`` through the enforcement gate. May 200 (moved),
   *  202 (approval required → returns ``{ approval_id }``), 403, or 409. */
  async stateTransition(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    toState: string
  ): Promise<{ status: number; data: unknown }> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/state-transition/`, {
      to_state: toState,
    })
      .then((res) => ({ status: res.status, data: res?.data }))
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async listApprovals(workspaceSlug: string, projectId: string, issueId: string): Promise<IWorkItemApproval[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/approvals/`)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async decideApproval(
    workspaceSlug: string,
    projectId: string,
    approvalId: string,
    payload: IApprovalDecisionPayload
  ): Promise<IWorkItemApproval> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/approvals/${approvalId}/decision/`,
      payload
    )
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async getConfig(workspaceSlug: string, projectId: string): Promise<IWorkflowConfig> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/workflow-config/`)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async updateConfig(
    workspaceSlug: string,
    projectId: string,
    data: { workflow_status: TWorkflowStatus }
  ): Promise<IWorkflowConfig> {
    return this.patch(`/api/workspaces/${workspaceSlug}/projects/${projectId}/workflow-config/`, data)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async suggestedTransition(workspaceSlug: string, projectId: string, issueId: string): Promise<ISuggestedTransition> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/suggested-transition/`)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }
}
