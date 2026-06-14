/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import type { IWorkflowTransition, TWorkflowStatus } from "@plane/types";

export const DEFAULT_WORKFLOW_ISSUE_TYPE_ID = "__default__";

export type TWorkflowBuilderMode = "active" | "disabled" | "paused" | "unrestricted";

type TBuilderModeInput = {
  featureEnabled: boolean;
  workflowStatus?: TWorkflowStatus;
  transitions: IWorkflowTransition[];
};

type TTransitionPayloadInput = {
  fromStateId: string;
  toStateId: string;
  selectedIssueTypeId: string;
  allowedRoles: string[];
  approvalRequired: boolean;
  fallbackStateId?: string | null;
  autoAssignMemberId?: string | null;
  autoAssignRole?: string | null;
};

export const getWorkflowBuilderMode = (input: TBuilderModeInput): { kind: TWorkflowBuilderMode } => {
  const { featureEnabled, workflowStatus, transitions } = input;

  if (!featureEnabled) return { kind: "disabled" };
  if (workflowStatus === "paused") return { kind: "paused" };
  if (transitions.length === 0) return { kind: "unrestricted" };

  return { kind: "active" };
};

export const getWorkflowIssueTypeOptions = (
  transitions: IWorkflowTransition[],
  selectedIssueTypeId?: string
): { id: string; label: string }[] => {
  const typedIds = transitions.reduce<string[]>((acc, transition) => {
    if (!transition.issue_type || acc.includes(transition.issue_type)) return acc;
    acc.push(transition.issue_type);
    return acc;
  }, []);
  const options = [
    { id: DEFAULT_WORKFLOW_ISSUE_TYPE_ID, label: "Default workflow" },
    ...typedIds.map((id) => ({ id: id as string, label: `Type ${id}` })),
  ];

  if (
    selectedIssueTypeId &&
    selectedIssueTypeId !== DEFAULT_WORKFLOW_ISSUE_TYPE_ID &&
    !options.some((option) => option.id === selectedIssueTypeId)
  ) {
    options.push({ id: selectedIssueTypeId, label: `Type ${selectedIssueTypeId}` });
  }

  return options;
};

export const getWorkflowTransitionsForIssueType = (
  transitions: IWorkflowTransition[],
  selectedIssueTypeId: string
): IWorkflowTransition[] => {
  if (selectedIssueTypeId === DEFAULT_WORKFLOW_ISSUE_TYPE_ID)
    return transitions.filter((transition) => !transition.issue_type);

  return transitions.filter((transition) => transition.issue_type === selectedIssueTypeId);
};

export const groupWorkflowTransitionsByFromState = (
  transitions: IWorkflowTransition[]
): Record<string, IWorkflowTransition[]> =>
  transitions.reduce<Record<string, IWorkflowTransition[]>>((acc, transition) => {
    const sourceTransitions = acc[transition.from_state] ?? [];
    acc[transition.from_state] = [...sourceTransitions, transition];
    return acc;
  }, {});

export const buildWorkflowTransitionPayload = (input: TTransitionPayloadInput): Partial<IWorkflowTransition> => ({
  from_state: input.fromStateId,
  to_state: input.toStateId,
  issue_type: input.selectedIssueTypeId === DEFAULT_WORKFLOW_ISSUE_TYPE_ID ? null : input.selectedIssueTypeId,
  allowed_roles: input.allowedRoles.map((role) => Number(role)).filter((role) => Number.isFinite(role)),
  approval_required: input.approvalRequired,
  fallback_state: input.fallbackStateId || null,
  auto_assign_member: input.autoAssignMemberId || null,
  auto_assign_role: input.autoAssignRole ? Number(input.autoAssignRole) : null,
});
