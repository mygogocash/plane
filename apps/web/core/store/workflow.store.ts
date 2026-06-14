/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { set } from "lodash-es";
import { action, makeObservable, observable, runInAction } from "mobx";
// plane imports
import type {
  IApprovalDecisionPayload,
  ISuggestedTransition,
  IWorkflowTransition,
  IWorkflowTransitionFilters,
  IWorkItemApproval,
  TWorkflowStatus,
} from "@plane/types";
// services
import { WorkflowService } from "@/services/workflow.service";
// store
import type { CoreRootStore } from "./root.store";

export interface IWorkflowStore {
  // observables
  loader: boolean;
  transitionMap: Record<string, IWorkflowTransition[]>; // keyed by projectId
  approvalMap: Record<string, IWorkItemApproval[]>; // keyed by issueId
  workflowStatusMap: Record<string, TWorkflowStatus>; // keyed by projectId
  workItemStateMap: Record<string, string>; // optimistic issue state, keyed by issueId
  suggestionMap: Record<string, ISuggestedTransition>; // keyed by issueId
  // reads
  getTransitionsByProject: (projectId: string) => IWorkflowTransition[];
  getWorkflowStatus: (projectId: string) => TWorkflowStatus | undefined;
  getWorkItemState: (issueId: string) => string | undefined;
  getApprovalsByIssue: (issueId: string) => IWorkItemApproval[];
  getSuggestion: (issueId: string) => ISuggestedTransition | undefined;
  getLegalTargetStateIds: (projectId: string, fromStateId: string, issueTypeId?: string | null) => string[];
  // transition-rule CRUD
  fetchTransitions: (
    workspaceSlug: string,
    projectId: string,
    filters?: IWorkflowTransitionFilters
  ) => Promise<IWorkflowTransition[]>;
  createTransition: (
    workspaceSlug: string,
    projectId: string,
    data: Partial<IWorkflowTransition>
  ) => Promise<IWorkflowTransition>;
  updateTransition: (
    workspaceSlug: string,
    projectId: string,
    transitionId: string,
    data: Partial<IWorkflowTransition>
  ) => Promise<IWorkflowTransition>;
  deleteTransition: (workspaceSlug: string, projectId: string, transitionId: string) => Promise<void>;
  // work-item transition (optimistic + rollback)
  transitionWorkItem: (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    fromStateId: string,
    toStateId: string
  ) => Promise<unknown>;
  // approvals
  fetchApprovals: (workspaceSlug: string, projectId: string, issueId: string) => Promise<IWorkItemApproval[]>;
  decideApproval: (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    approvalId: string,
    payload: IApprovalDecisionPayload
  ) => Promise<IWorkItemApproval>;
  // lifecycle config
  fetchConfig: (workspaceSlug: string, projectId: string) => Promise<TWorkflowStatus>;
  setWorkflowStatus: (workspaceSlug: string, projectId: string, status: TWorkflowStatus) => Promise<TWorkflowStatus>;
  // suggestion
  fetchSuggestedTransition: (
    workspaceSlug: string,
    projectId: string,
    issueId: string
  ) => Promise<ISuggestedTransition>;
}

export class WorkflowStore implements IWorkflowStore {
  // observables
  loader = false;
  transitionMap: Record<string, IWorkflowTransition[]> = {};
  approvalMap: Record<string, IWorkItemApproval[]> = {};
  workflowStatusMap: Record<string, TWorkflowStatus> = {};
  workItemStateMap: Record<string, string> = {};
  suggestionMap: Record<string, ISuggestedTransition> = {};
  // dependencies
  rootStore: CoreRootStore;
  workflowService: WorkflowService;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      loader: observable.ref,
      transitionMap: observable,
      approvalMap: observable,
      workflowStatusMap: observable,
      workItemStateMap: observable,
      suggestionMap: observable,
      fetchTransitions: action,
      createTransition: action,
      updateTransition: action,
      deleteTransition: action,
      transitionWorkItem: action,
      fetchApprovals: action,
      decideApproval: action,
      fetchConfig: action,
      setWorkflowStatus: action,
      fetchSuggestedTransition: action,
    });
    this.rootStore = _rootStore;
    this.workflowService = new WorkflowService();
  }

  // ---------------------------------------------------------------- reads
  getTransitionsByProject = (projectId: string): IWorkflowTransition[] => this.transitionMap[projectId] ?? [];

  getWorkflowStatus = (projectId: string): TWorkflowStatus | undefined => this.workflowStatusMap[projectId];

  getWorkItemState = (issueId: string): string | undefined => this.workItemStateMap[issueId];

  getApprovalsByIssue = (issueId: string): IWorkItemApproval[] => this.approvalMap[issueId] ?? [];

  getSuggestion = (issueId: string): ISuggestedTransition | undefined => this.suggestionMap[issueId];

  /**
   * Legal next-state ids from the current state, mirroring the server's typed-vs-default
   * resolution for presentation only (the server stays authoritative). When the item has a
   * bound type and typed rules exist for it, those govern; otherwise the default (no-type)
   * rule set governs.
   */
  getLegalTargetStateIds = (projectId: string, fromStateId: string, issueTypeId?: string | null): string[] => {
    const rules = this.getTransitionsByProject(projectId).filter((r) => r.from_state === fromStateId);
    const typedRules = issueTypeId ? rules.filter((r) => r.issue_type === issueTypeId) : [];
    const governing = typedRules.length > 0 ? typedRules : rules.filter((r) => !r.issue_type);
    return Array.from(new Set(governing.map((r) => r.to_state)));
  };

  // ----------------------------------------------------- transition-rule CRUD
  fetchTransitions = async (
    workspaceSlug: string,
    projectId: string,
    filters?: IWorkflowTransitionFilters
  ): Promise<IWorkflowTransition[]> => {
    try {
      this.loader = true;
      const response = await this.workflowService.listTransitions(workspaceSlug, projectId, filters);
      runInAction(() => {
        set(this.transitionMap, [projectId], response);
        this.loader = false;
      });
      return response;
    } catch (error) {
      runInAction(() => {
        this.loader = false;
      });
      throw error;
    }
  };

  createTransition = async (
    workspaceSlug: string,
    projectId: string,
    data: Partial<IWorkflowTransition>
  ): Promise<IWorkflowTransition> => {
    const response = await this.workflowService.createTransition(workspaceSlug, projectId, data);
    runInAction(() => {
      set(this.transitionMap, [projectId], [...this.getTransitionsByProject(projectId), response]);
    });
    return response;
  };

  updateTransition = async (
    workspaceSlug: string,
    projectId: string,
    transitionId: string,
    data: Partial<IWorkflowTransition>
  ): Promise<IWorkflowTransition> => {
    const response = await this.workflowService.updateTransition(workspaceSlug, projectId, transitionId, data);
    runInAction(() => {
      const next = this.getTransitionsByProject(projectId).map((r) => (r.id === transitionId ? response : r));
      set(this.transitionMap, [projectId], next);
    });
    return response;
  };

  deleteTransition = async (workspaceSlug: string, projectId: string, transitionId: string): Promise<void> => {
    await this.workflowService.deleteTransition(workspaceSlug, projectId, transitionId);
    runInAction(() => {
      const next = this.getTransitionsByProject(projectId).filter((r) => r.id !== transitionId);
      set(this.transitionMap, [projectId], next);
    });
  };

  // ------------------------------------------- work-item transition (optimistic)
  transitionWorkItem = async (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    fromStateId: string,
    toStateId: string
  ): Promise<unknown> => {
    // Optimistically apply the new state immediately.
    runInAction(() => {
      set(this.workItemStateMap, [issueId], toStateId);
    });
    try {
      return await this.workflowService.stateTransition(workspaceSlug, projectId, issueId, toStateId);
    } catch (error) {
      // Server is authoritative: roll back to the previous state on any rejection (403/409/…).
      runInAction(() => {
        set(this.workItemStateMap, [issueId], fromStateId);
      });
      throw error;
    }
  };

  // ------------------------------------------------------------- approvals
  fetchApprovals = async (workspaceSlug: string, projectId: string, issueId: string): Promise<IWorkItemApproval[]> => {
    const response = await this.workflowService.listApprovals(workspaceSlug, projectId, issueId);
    runInAction(() => {
      set(this.approvalMap, [issueId], response);
    });
    return response;
  };

  decideApproval = async (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    approvalId: string,
    payload: IApprovalDecisionPayload
  ): Promise<IWorkItemApproval> => {
    const response = await this.workflowService.decideApproval(workspaceSlug, projectId, approvalId, payload);
    runInAction(() => {
      const next = this.getApprovalsByIssue(issueId).map((a) => (a.id === approvalId ? response : a));
      set(this.approvalMap, [issueId], next);
    });
    return response;
  };

  // -------------------------------------------------------- lifecycle config
  fetchConfig = async (workspaceSlug: string, projectId: string): Promise<TWorkflowStatus> => {
    const response = await this.workflowService.getConfig(workspaceSlug, projectId);
    runInAction(() => {
      set(this.workflowStatusMap, [projectId], response.workflow_status);
    });
    return response.workflow_status;
  };

  setWorkflowStatus = async (
    workspaceSlug: string,
    projectId: string,
    status: TWorkflowStatus
  ): Promise<TWorkflowStatus> => {
    const response = await this.workflowService.updateConfig(workspaceSlug, projectId, {
      workflow_status: status,
    });
    runInAction(() => {
      set(this.workflowStatusMap, [projectId], response.workflow_status);
    });
    return response.workflow_status;
  };

  // ------------------------------------------------------------ suggestion
  fetchSuggestedTransition = async (
    workspaceSlug: string,
    projectId: string,
    issueId: string
  ): Promise<ISuggestedTransition> => {
    const response = await this.workflowService.suggestedTransition(workspaceSlug, projectId, issueId);
    runInAction(() => {
      set(this.suggestionMap, [issueId], response);
    });
    return response;
  };
}
