/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { cn } from "@plane/utils";
// local imports
import { isSelfHostedFeatureEnabled } from "@/plane-web/lib/self-host-entitlements";
import { WORKFLOW_TRANSITION_NOT_ALLOWED_MESSAGE } from "./workflow-enforcement";

type Props = {
  parentStateId: string;
  className?: string;
};

export function WorkFlowDisabledMessage(props: Props) {
  const { parentStateId, className } = props;

  if (!isSelfHostedFeatureEnabled("workflows_approvals")) return null;

  return (
    <p data-state-id={parentStateId} className={cn("text-12 text-danger-secondary", className)}>
      {WORKFLOW_TRANSITION_NOT_ALLOWED_MESSAGE}
    </p>
  );
}
