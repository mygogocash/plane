/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { IWorkflowTransition, TIssueGroupByOptions, TWorkflowStatus } from "@plane/types";

export const WORKFLOW_TRANSITION_NOT_ALLOWED_MESSAGE = "This transition is not allowed by the workflow.";
export const WORKFLOW_APPROVAL_REQUIRED_MESSAGE = "This transition requires approval.";

type TWorkflowDecision = {
  disabled: boolean;
  reason?: string;
};

type TStateOptionDecision = {
  alwaysAllowStateChange?: boolean;
  featureEnabled: boolean;
  filterAvailableStateIds?: boolean;
  hasTransitionRules?: boolean;
  legalTargetStateIds: string[];
  optionStateId: string | null | undefined;
  selectedStateId: string | null | undefined;
  workflowStatus: TWorkflowStatus | undefined;
};

type TTransitionDecision = {
  featureEnabled: boolean;
  hasTransitionRules?: boolean;
  legalTargetStateIds: string[];
  sourceStateId: string | undefined;
  targetStateId: string | undefined;
  transition?: IWorkflowTransition;
  workflowStatus: TWorkflowStatus | undefined;
};

const isPresentStateId = (stateId: string | null | undefined): stateId is string =>
  !!stateId && stateId !== "null" && stateId !== "None";

export const isWorkflowPresentationEnabled = (
  featureEnabled: boolean,
  workflowStatus: TWorkflowStatus | undefined
): boolean => featureEnabled && workflowStatus === "enabled";

export const getWorkflowStateIdFromGrouping = (
  groupBy: TIssueGroupByOptions | null | undefined,
  subGroupBy: TIssueGroupByOptions | null | undefined,
  groupId: string | undefined,
  subGroupId: string | undefined
): string | undefined => {
  if (groupBy === "state" && isPresentStateId(groupId)) return groupId;
  if (subGroupBy === "state" && isPresentStateId(subGroupId)) return subGroupId;
  return undefined;
};

const getGoverningTransitions = (
  transitions: IWorkflowTransition[],
  fromStateId: string,
  issueTypeId?: string | null
): IWorkflowTransition[] => {
  const sourceTransitions = transitions.filter((transition) => transition.from_state === fromStateId);
  const typedTransitions = issueTypeId
    ? sourceTransitions.filter((transition) => transition.issue_type === issueTypeId)
    : [];

  return typedTransitions.length > 0
    ? typedTransitions
    : sourceTransitions.filter((transition) => !transition.issue_type);
};

export const getWorkflowTransitionForTarget = (
  transitions: IWorkflowTransition[],
  fromStateId: string | undefined,
  targetStateId: string | undefined,
  issueTypeId?: string | null
): IWorkflowTransition | undefined => {
  if (!fromStateId || !targetStateId) return undefined;
  return getGoverningTransitions(transitions, fromStateId, issueTypeId).find(
    (transition) => transition.to_state === targetStateId
  );
};

export const shouldFilterStateOption = ({
  alwaysAllowStateChange = false,
  featureEnabled,
  filterAvailableStateIds = false,
  hasTransitionRules,
  legalTargetStateIds,
  optionStateId,
  selectedStateId,
  workflowStatus,
}: TStateOptionDecision): boolean => {
  if (
    !isWorkflowPresentationEnabled(featureEnabled, workflowStatus) ||
    !filterAvailableStateIds ||
    alwaysAllowStateChange ||
    !isPresentStateId(optionStateId) ||
    !isPresentStateId(selectedStateId) ||
    optionStateId === selectedStateId
  )
    return false;

  if (!(hasTransitionRules ?? legalTargetStateIds.length > 0)) return false;

  return !legalTargetStateIds.includes(optionStateId);
};

export const getWorkflowTransitionDecision = ({
  featureEnabled,
  hasTransitionRules,
  legalTargetStateIds,
  sourceStateId,
  targetStateId,
  transition: _transition,
  workflowStatus,
}: TTransitionDecision): TWorkflowDecision => {
  if (
    !isWorkflowPresentationEnabled(featureEnabled, workflowStatus) ||
    !isPresentStateId(sourceStateId) ||
    !isPresentStateId(targetStateId) ||
    sourceStateId === targetStateId
  )
    return { disabled: false };

  if (!(hasTransitionRules ?? legalTargetStateIds.length > 0)) return { disabled: false };

  if (!legalTargetStateIds.includes(targetStateId)) {
    return { disabled: true, reason: WORKFLOW_TRANSITION_NOT_ALLOWED_MESSAGE };
  }

  return { disabled: false };
};
