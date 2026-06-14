/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { RefreshCcw } from "lucide-react";
// plane imports
import { Tooltip } from "@plane/propel/tooltip";
// types
import type { TRecurringIssue } from "@/types/recurring-work-item";

type Props = {
  issue: TRecurringIssue;
};

export const IssueRecurrenceBadge = (props: Props) => {
  const { issue } = props;

  if (!issue.is_recurring) return null;

  return (
    <Tooltip tooltipContent="Generated from a recurring work item" renderByDefault={false}>
      <div
        aria-label="Recurring"
        className="flex h-5 flex-shrink-0 items-center justify-center gap-1 overflow-hidden rounded-sm border-[0.5px] border-strong px-2 py-1 text-tertiary"
      >
        <RefreshCcw className="h-3 w-3 flex-shrink-0" strokeWidth={2} />
        <span className="text-caption-sm-regular">Recurring</span>
      </div>
    </Tooltip>
  );
};
