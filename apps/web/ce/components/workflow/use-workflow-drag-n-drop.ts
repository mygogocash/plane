/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useContext, useState } from "react";
import type { TIssueGroupByOptions } from "@plane/types";
// store
import { StoreContext } from "@/lib/store-context";
// local imports
import { isSelfHostedFeatureEnabled } from "@/plane-web/lib/self-host-entitlements";
import {
  getWorkflowStateIdFromGrouping,
  getWorkflowTransitionDecision,
  getWorkflowTransitionForTarget,
} from "./workflow-enforcement";

export const useWorkFlowFDragNDrop = (groupBy: TIssueGroupByOptions | undefined, subGroupBy?: TIssueGroupByOptions) => {
  const store = useContext(StoreContext);
  const [workflowDisabledSource, setWorkflowDisabledSource] = useState<string | undefined>(undefined);
  const [isWorkflowDropDisabled, setIsWorkflowDropDisabled] = useState(false);

  const projectId = store.router.projectId;
  const workflowStatus = projectId ? store.workflow.getWorkflowStatus(projectId) : undefined;
  const featureEnabled = isSelfHostedFeatureEnabled("workflows_approvals");

  const handleWorkFlowState = useCallback(
    (sourceGroupId: string, destinationGroupId: string, sourceSubGroupId?: string, destinationSubGroupId?: string) => {
      const sourceStateId = getWorkflowStateIdFromGrouping(groupBy, subGroupBy, sourceGroupId, sourceSubGroupId);
      const targetStateId = getWorkflowStateIdFromGrouping(
        groupBy,
        subGroupBy,
        destinationGroupId,
        destinationSubGroupId
      );
      const legalTargetStateIds =
        projectId && sourceStateId ? store.workflow.getLegalTargetStateIds(projectId, sourceStateId) : [];
      const transitions = projectId ? store.workflow.getTransitionsByProject(projectId) : [];
      const transition = getWorkflowTransitionForTarget(transitions, sourceStateId, targetStateId);
      const decision = getWorkflowTransitionDecision({
        featureEnabled,
        workflowStatus,
        sourceStateId,
        targetStateId,
        legalTargetStateIds,
        transition,
        hasTransitionRules: transitions.length > 0,
      });

      setIsWorkflowDropDisabled(decision.disabled);
      setWorkflowDisabledSource(decision.reason);
    },
    [featureEnabled, groupBy, projectId, store.workflow, subGroupBy, workflowStatus]
  );

  return {
    workflowDisabledSource,
    isWorkflowDropDisabled,
    getIsWorkflowWorkItemCreationDisabled: (_groupId: string, _subGroupId?: string) => false,
    handleWorkFlowState,
  };
};
