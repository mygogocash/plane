/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { decode } from "html-entities";
// plane imports
import type { IWorkItemApproval } from "@plane/types";
import { sanitizeRichHTML } from "@plane/utils";

export type TApprovalBannerModel = {
  canDecide: boolean;
  comment: string;
  fallbackStateName: string;
  requesterName: string;
  targetStateName: string;
};

const APPROVAL_COMMENT_TEXT_TAGS = new Set(["blockquote", "div", "li", "p", "pre"]);

const normalizeCommentText = (value: string) =>
  value
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export const sanitizeApprovalComment = (comment: string): string => {
  const textParts: string[] = [];
  const appendLineBreak = () => {
    const previousPart = textParts.at(-1);
    if (previousPart && !previousPart.endsWith("\n")) textParts.push("\n");
  };

  sanitizeRichHTML(comment || "", {
    allowedTags: [...APPROVAL_COMMENT_TEXT_TAGS, "br"],
    allowedAttributes: {},
    disallowedTagsMode: "discard",
    nonTextTags: ["script", "style", "textarea"],
    onOpenTag: (name) => {
      if (name === "br" || APPROVAL_COMMENT_TEXT_TAGS.has(name)) appendLineBreak();
    },
    onCloseTag: (name) => {
      if (APPROVAL_COMMENT_TEXT_TAGS.has(name)) appendLineBreak();
    },
    textFilter: (text) => {
      textParts.push(decode(text));
      return text;
    },
  });

  return normalizeCommentText(textParts.join(""));
};

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
