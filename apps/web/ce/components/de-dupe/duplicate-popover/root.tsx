/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// types
import type { TIssueOperations } from "@/components/issues/issue-detail";
import type { TSimilarIssue } from "@/types/similar-issue";
// components
import { DuplicateModalRoot } from "../duplicate-modal";

type TDeDupeIssuePopoverRootProps = {
  workspaceSlug: string;
  projectId: string;
  rootIssueId: string;
  issues: TSimilarIssue[];
  issueOperations: TIssueOperations;
  disabled?: boolean;
  renderDeDupeActionModals?: boolean;
  isIntakeIssue?: boolean;
};

export const DeDupeIssuePopoverRoot = observer(function DeDupeIssuePopoverRoot(props: TDeDupeIssuePopoverRootProps) {
  const { workspaceSlug, projectId, rootIssueId, issues, disabled } = props;

  if (disabled) return null;

  return (
    <div className="rounded-lg border border-subtle bg-surface-1 p-3">
      <DuplicateModalRoot
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        rootIssueId={rootIssueId}
        issues={issues}
        handleDuplicateIssueModal={() => {}}
      />
    </div>
  );
});
