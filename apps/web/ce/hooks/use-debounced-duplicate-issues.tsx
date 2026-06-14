/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
// services
import { SimilarIssuesService } from "@/services/similar-issues.service";
// types
import type { TSimilarIssue } from "@/types/similar-issue";
// helpers
import { isSelfHostedFeatureEnabled } from "@/plane-web/lib/self-host-entitlements";

const similarIssuesService = new SimilarIssuesService();

export const MIN_DUPLICATE_TITLE_LENGTH = 4;
export const DUPLICATE_QUERY_DEBOUNCE_MS = 300;

export const shouldQuerySimilarIssues = (
  workspaceSlug: string | undefined,
  projectId: string | undefined,
  title: string | undefined
) =>
  isSelfHostedFeatureEnabled("work_item_types") &&
  !!workspaceSlug &&
  !!projectId &&
  (title?.trim().length ?? 0) >= MIN_DUPLICATE_TITLE_LENGTH;

export const useDebouncedDuplicateIssues = (
  workspaceSlug: string | undefined,
  _workspaceId: string | undefined,
  projectId: string | undefined,
  formData: { name: string | undefined; description_html?: string | undefined; issueId?: string | undefined }
) => {
  const [duplicateIssues, setDuplicateIssues] = useState<TSimilarIssue[]>([]);
  const title = formData.name?.trim() ?? "";
  const issueId = formData.issueId;

  useEffect(() => {
    if (!shouldQuerySimilarIssues(workspaceSlug, projectId, title)) {
      setDuplicateIssues([]);
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(() => {
      const fetchSimilarIssues = async () => {
        try {
          const issues = await similarIssuesService.list(workspaceSlug as string, projectId as string, title);
          if (!cancelled) setDuplicateIssues(issues.filter((issue) => issue.id !== issueId));
        } catch {
          if (!cancelled) setDuplicateIssues([]);
        }
      };

      void fetchSimilarIssues();
    }, DUPLICATE_QUERY_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [workspaceSlug, projectId, title, issueId]);

  return { duplicateIssues };
};
