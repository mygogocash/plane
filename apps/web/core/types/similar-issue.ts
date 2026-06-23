// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TDeDupeIssue } from "@plane/types";

export type TSimilarIssue = Pick<TDeDupeIssue, "id" | "name"> &
  Partial<Omit<TDeDupeIssue, "id" | "name">> & {
    confidence: number;
    matched_on?: string[];
    is_high_confidence?: boolean;
    duplicate_threshold?: number;
  };

export type TDuplicateCheckCandidate = {
  issue_id: string;
  name: string;
  score: number;
  matched_on: string[];
};

export type TDuplicateCheckResponse = {
  candidates: TDuplicateCheckCandidate[];
  high_confidence: boolean;
  threshold: number;
  retrieval: "keyword" | "relevance";
};

export type TDuplicateIssueCheckResult = {
  issues: TSimilarIssue[];
  high_confidence: boolean;
  threshold: number;
  retrieval: TDuplicateCheckResponse["retrieval"];
};

export type TDuplicateCheckPayload = {
  title: string;
  description?: string;
  project_id?: string;
};
