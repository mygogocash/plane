// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { Link2, X } from "lucide-react";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// services
import { IssueRelationService } from "@/services/issue/issue_relation.service";
// types
import type { TSimilarIssue } from "@/types/similar-issue";

const issueRelationService = new IssueRelationService();

type TCreateIssueRelations = IssueRelationService["createIssueRelations"];

type TLinkDuplicateIssueArgs = {
  workspaceSlug: string;
  projectId: string;
  rootIssueId: string;
  duplicateIssueId: string;
  createIssueRelations?: TCreateIssueRelations;
};

type TDuplicateModalRootProps = {
  workspaceSlug: string;
  projectId?: string;
  rootIssueId?: string;
  issues: TSimilarIssue[];
  queuedIssueIds?: string[];
  handleDuplicateIssueModal: (value: boolean) => void;
  onQueueDuplicateRelation?: (issueId: string) => void;
};

export const shouldRenderDuplicateBanner = (issues: TSimilarIssue[], isDismissed: boolean) =>
  issues.length > 0 && !isDismissed;

export const formatConfidence = (confidence: number) => `${Math.round(confidence * 100)}%`;

const MATCHED_FIELD_LABELS: Record<string, string> = {
  title: "title",
  description: "description",
};

export const formatMatchedFields = (matchedOn: string[] = []) => {
  const labels = matchedOn.map((field) => MATCHED_FIELD_LABELS[field] ?? field.replace(/_/g, " ")).filter(Boolean);

  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];

  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
};

export const linkDuplicateIssue = async ({
  workspaceSlug,
  projectId,
  rootIssueId,
  duplicateIssueId,
  createIssueRelations = issueRelationService.createIssueRelations.bind(issueRelationService),
}: TLinkDuplicateIssueArgs) =>
  await createIssueRelations(workspaceSlug, projectId, rootIssueId, {
    relation_type: "duplicate",
    issues: [duplicateIssueId],
  });

export function DuplicateModalRoot(props: TDuplicateModalRootProps) {
  const {
    workspaceSlug,
    projectId,
    rootIssueId,
    issues,
    queuedIssueIds = [],
    handleDuplicateIssueModal,
    onQueueDuplicateRelation,
  } = props;
  const [isDismissed, setIsDismissed] = useState(false);
  const [linkedIssueIds, setLinkedIssueIds] = useState<string[]>([]);

  if (!shouldRenderDuplicateBanner(issues, isDismissed)) return null;

  const handleDismiss = () => {
    setIsDismissed(true);
    handleDuplicateIssueModal(false);
  };

  const handleLinkDuplicate = async (issueId: string) => {
    if (rootIssueId && projectId) {
      try {
        await linkDuplicateIssue({
          workspaceSlug,
          projectId,
          rootIssueId,
          duplicateIssueId: issueId,
        });
        setLinkedIssueIds((current) => [...new Set([...current, issueId])]);
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: "Duplicate linked",
          message: "The work item was linked as a duplicate.",
        });
      } catch {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "Could not link duplicate",
          message: "Please try again.",
        });
      }
      return;
    }

    onQueueDuplicateRelation?.(issueId);
  };

  return (
    <aside aria-live="polite" className="text-sm flex min-w-80 flex-col gap-3 text-primary">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-medium text-primary">Similar work items</h4>
          <p className="text-xs mt-1 text-secondary">Review possible duplicates before continuing.</p>
        </div>
        <button
          type="button"
          aria-label="Dismiss similar work items"
          onClick={handleDismiss}
          className="inline-flex h-6 w-6 items-center justify-center rounded text-secondary hover:bg-surface-2"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {issues.map((issue) => {
          const isLinked = linkedIssueIds.includes(issue.id);
          const isQueued = queuedIssueIds.includes(issue.id);

          return (
            <div key={issue.id} className="rounded border border-subtle bg-surface-1 p-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs truncate font-medium text-primary">{issue.name}</div>
                  <div className="text-xs mt-1 text-secondary">{formatConfidence(issue.confidence)} confidence</div>
                  {issue.matched_on?.length ? (
                    <div className="text-xs mt-1 text-secondary">
                      Matched on {formatMatchedFields(issue.matched_on)}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => void handleLinkDuplicate(issue.id)}
                  disabled={isLinked || isQueued}
                  className="text-xs inline-flex flex-shrink-0 items-center gap-1 rounded border border-subtle px-2 py-1 font-medium text-secondary hover:bg-surface-2 disabled:cursor-default disabled:opacity-60"
                >
                  <Link2 className="h-3 w-3" aria-hidden="true" />
                  {isLinked ? "Linked" : isQueued ? "Queued" : "Link as duplicate"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
