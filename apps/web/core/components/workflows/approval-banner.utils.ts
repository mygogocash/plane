/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import type { IWorkItemApproval } from "@plane/types";

export type TApprovalBannerModel = {
  canDecide: boolean;
  comment: string;
  fallbackStateName: string;
  requesterName: string;
  targetStateName: string;
};

export const sanitizeApprovalComment = (comment: string): string => comment.replace(/<[^>]*>/g, "").trim();

export const getApprovalBannerModel = ({
  approval,
  currentProjectMemberId,
  getStateName,
  getUserName,
}: {
  approval: IWorkItemApproval | null | undefined;
  currentProjectMemberId: string | null | undefined;
  getStateName: (stateId: string) => string;
  getUserName: (userId: string) => string;
}): TApprovalBannerModel | null => {
  if (!approval || approval.status !== "pending") return null;

  const canDecide = Boolean(
    currentProjectMemberId &&
    approval.approvers.some((approver) => approver.member === currentProjectMemberId && !approver.responded)
  );

  return {
    canDecide,
    comment: sanitizeApprovalComment(approval.comment),
    fallbackStateName: approval.fallback_state ? getStateName(approval.fallback_state) : "No fallback",
    requesterName: getUserName(approval.requested_by),
    targetStateName: approval.target_state ? getStateName(approval.target_state) : "Unknown state",
  };
};
