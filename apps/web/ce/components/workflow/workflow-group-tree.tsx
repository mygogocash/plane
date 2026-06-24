/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useContext } from "react";
import { observer } from "mobx-react";
import type { TIssueGroupByOptions } from "@plane/types";
import { cn } from "@plane/utils";
// hooks
import { useProjectState } from "@/hooks/store/use-project-state";
// store
import { StoreContext } from "@/lib/store-context";
// local imports
import { isSelfHostedFeatureEnabled } from "@/plane-web/lib/self-host-entitlements";

type Props = {
  className?: string;
  groupBy?: TIssueGroupByOptions;
  groupId: string | undefined;
};

export const WorkFlowGroupTree = observer(function WorkFlowGroupTree(props: Props) {
  const { className, groupBy, groupId } = props;
  const store = useContext(StoreContext);
  const { getStateById } = useProjectState();
  const projectId = store.router.projectId;

  if (!isSelfHostedFeatureEnabled("workflows_approvals") || groupBy !== "state" || !projectId || !groupId) return null;

  const targetStateIds = store.workflow.getLegalTargetStateIds(projectId, groupId);

  if (targetStateIds.length === 0) return null;

  return (
    <ul className={cn("space-y-1 text-12 text-secondary", className)} aria-label="Allowed workflow targets">
      {targetStateIds.map((stateId) => (
        <li key={stateId}>{getStateById(stateId)?.name ?? stateId}</li>
      ))}
    </ul>
  );
});
