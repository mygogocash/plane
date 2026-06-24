// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type {
  TDuplicateCheckCandidate,
  TDuplicateCheckPayload,
  TDuplicateIssueCheckResult,
  TDuplicateCheckResponse,
  TSimilarIssue,
} from "@/types/similar-issue";

import { APIService } from "@/services/api.service";

type TSimilarIssuesResponse = {
  results?: TSimilarIssue[];
};

export const duplicateCandidateToSimilarIssue = (
  candidate: TDuplicateCheckCandidate,
  threshold?: number
): TSimilarIssue => ({
  id: candidate.issue_id,
  name: candidate.name,
  confidence: candidate.score,
  matched_on: candidate.matched_on,
  is_high_confidence: typeof threshold === "number" ? candidate.score >= threshold : false,
  duplicate_threshold: threshold,
});

export class SimilarIssuesService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(workspaceSlug: string, projectId: string, title: string, limit = 5): Promise<TSimilarIssue[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/similar/`, {
      params: { title, limit },
    })
      .then((res) => {
        const data = res?.data as TSimilarIssuesResponse | undefined;
        return data?.results ?? [];
      })
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async checkDuplicates(
    workspaceSlug: string,
    projectId: string,
    payload: TDuplicateCheckPayload
  ): Promise<TDuplicateCheckResponse> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/duplicate-check/`, payload)
      .then((res) => res.data as TDuplicateCheckResponse)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async checkDuplicateIssues(
    workspaceSlug: string,
    projectId: string,
    payload: TDuplicateCheckPayload
  ): Promise<TDuplicateIssueCheckResult> {
    const data = await this.checkDuplicates(workspaceSlug, projectId, payload);

    return {
      issues: data.candidates.map((candidate) => duplicateCandidateToSimilarIssue(candidate, data.threshold)),
      high_confidence: data.high_confidence,
      threshold: data.threshold,
      retrieval: data.retrieval,
    };
  }

  async listDuplicates(
    workspaceSlug: string,
    projectId: string,
    payload: TDuplicateCheckPayload
  ): Promise<TSimilarIssue[]> {
    const data = await this.checkDuplicateIssues(workspaceSlug, projectId, payload);
    return data.issues;
  }
}
