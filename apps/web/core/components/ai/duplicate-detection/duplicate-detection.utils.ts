// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import type { TSimilarIssue } from "@/types/similar-issue";

export const formatDuplicateScore = (confidence: number) => `${Math.round(confidence * 100)}%`;

export const formatMatchedOn = (matchedOn: string[] = []) => {
  const labels = matchedOn.map((field) => field.replace(/_/g, " ")).filter(Boolean);
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
};

export const shouldShowDuplicateWarning = ({
  featureEnabled,
  isProviderConfigured,
  candidates,
}: {
  featureEnabled: boolean;
  isProviderConfigured?: boolean;
  candidates: TSimilarIssue[];
}) => featureEnabled && isProviderConfigured !== false && candidates.length > 0;

export const isDuplicateSubmitBlocked = (highConfidence: boolean, hasAcknowledgedOverride: boolean) =>
  highConfidence && !hasAcknowledgedOverride;

export const hasHighConfidenceCandidate = (candidates: TSimilarIssue[]) =>
  candidates.some((candidate) => candidate.is_high_confidence);
