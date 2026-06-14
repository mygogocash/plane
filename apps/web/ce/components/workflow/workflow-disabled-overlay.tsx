/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { AlertCircle } from "lucide-react";

export type TWorkflowDisabledOverlayProps = {
  messageContainerRef: React.RefObject<HTMLDivElement | null>;
  workflowDisabledSource: string;
  shouldOverlayBeVisible: boolean;
};

export const WorkFlowDisabledOverlay = observer(function WorkFlowDisabledOverlay(props: TWorkflowDisabledOverlayProps) {
  const { workflowDisabledSource, shouldOverlayBeVisible } = props;

  if (!shouldOverlayBeVisible) return null;

  return (
    <div className="my-8 flex items-center gap-1.5 rounded-sm p-3 text-danger-secondary">
      <AlertCircle width={13} height={13} aria-hidden="true" />
      <span>{workflowDisabledSource}</span>
    </div>
  );
});
