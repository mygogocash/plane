/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TIssue, TWorkflowStatus } from "@plane/types";

import { isSelfHostedFeatureEnabled } from "@/plane-web/lib/self-host-entitlements";

const WORKFLOW_STATE_UPDATE_KEYS = new Set(["state_id", "sort_order"]);

export type TWorkflowStateChange = {
  fromStateId: string;
  toStateId: string;
};

export type TWorkflowTransitionResult =
  | { kind: "transitioned"; issue: Partial<TIssue> }
  | { kind: "approval_required"; approvalId: string };

export const shouldRouteStateChangeThroughWorkflow = ({
  data,
  featureEnabled = isSelfHostedFeatureEnabled("workflows_approvals"),
  issueBeforeUpdate,
  workflowStatus,
}: {
  data: Partial<TIssue>;
  featureEnabled?: boolean;
  issueBeforeUpdate: Partial<TIssue> | undefined;
  workflowStatus: TWorkflowStatus | undefined;
}): TWorkflowStateChange | null => {
  if (!featureEnabled || workflowStatus !== "enabled") return null;
  if (!issueBeforeUpdate?.state_id || !data.state_id) return null;
  if (data.state_id === issueBeforeUpdate.state_id) return null;
  if (!Object.keys(data).every((key) => WORKFLOW_STATE_UPDATE_KEYS.has(key))) return null;

  return {
    fromStateId: issueBeforeUpdate.state_id,
    toStateId: data.state_id,
  };
};

export const parseWorkflowTransitionResponse = (status: number, data: unknown): TWorkflowTransitionResult => {
  if (status === 202 && data && typeof data === "object" && "approval_id" in data) {
    const approvalId = (data as { approval_id?: unknown }).approval_id;
    if (typeof approvalId === "string" && approvalId.length > 0) {
      return { kind: "approval_required", approvalId };
    }
  }

  return { kind: "transitioned", issue: (data ?? {}) as Partial<TIssue> };
};
