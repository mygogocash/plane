// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";

import { SimilarIssuesService } from "@/services/similar-issues.service";
import type { TDuplicateIssueCheckResult, TSimilarIssue } from "@/types/similar-issue";

import { isSelfHostedFeatureEnabled } from "@/plane-web/lib/self-host-entitlements";

export const MIN_DUPLICATE_TITLE_LENGTH = 4;
export const DUPLICATE_QUERY_DEBOUNCE_MS = 300;

type TDuplicateIssueFormData = {
  name?: string | null;
  description_html?: string | null;
  issueId?: string | null;
};

const similarIssuesService = new SimilarIssuesService();

export const shouldQueryDuplicateIssues = (
  workspaceSlug: string | undefined,
  projectId: string | undefined,
  title: string | undefined
) =>
  isSelfHostedFeatureEnabled("ai_copilot") &&
  !!workspaceSlug &&
  !!projectId &&
  (title?.trim().length ?? 0) >= MIN_DUPLICATE_TITLE_LENGTH;

export const shouldQuerySimilarIssues = shouldQueryDuplicateIssues;

export const useDebouncedDuplicateIssues = (
  workspaceSlug: string | undefined,
  _workspaceId: string | undefined,
  projectId: string | undefined,
  formData: TDuplicateIssueFormData
) => {
  const [duplicateIssues, setDuplicateIssues] = useState<TSimilarIssue[]>([]);
  const [duplicateCheck, setDuplicateCheck] = useState<TDuplicateIssueCheckResult | null>(null);
  const title = formData.name?.trim() ?? "";
  const description = formData.description_html?.trim() ?? "";
  const issueId = formData.issueId;

  useEffect(() => {
    if (!shouldQueryDuplicateIssues(workspaceSlug, projectId, title)) {
      setDuplicateIssues([]);
      setDuplicateCheck(null);
      return;
    }

    const timeout = window.setTimeout(() => {
      similarIssuesService
        .checkDuplicateIssues(workspaceSlug as string, projectId as string, {
          title,
          description,
          project_id: projectId as string,
        })
        .then((result) => {
          const issues = result.issues.filter((issue) => issue.id !== issueId);
          const highConfidence = issues.some((issue) => issue.is_high_confidence);

          setDuplicateIssues(issues);
          setDuplicateCheck({ ...result, issues, high_confidence: highConfidence });
          return undefined;
        })
        .catch(() => {
          setDuplicateIssues([]);
          setDuplicateCheck(null);
        });
    }, DUPLICATE_QUERY_DEBOUNCE_MS);

    return () => window.clearTimeout(timeout);
  }, [description, issueId, projectId, title, workspaceSlug]);

  return {
    duplicateIssues,
    duplicateCheck,
    hasHighConfidenceDuplicate: duplicateCheck?.high_confidence ?? false,
    duplicateThreshold: duplicateCheck?.threshold ?? null,
  };
};
