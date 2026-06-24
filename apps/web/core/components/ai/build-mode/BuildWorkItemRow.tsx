// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { cn } from "@plane/utils";
import type { TBuildProjectWorkItemDraft } from "@/services/ai.service";
import { formatEstimate, formatWorkItemPriority } from "./build-draft.utils";

type TBuildWorkItemRowProps = {
  className?: string | undefined;
  index: number;
  item: TBuildProjectWorkItemDraft;
  readOnly?: boolean | undefined;
  warning?: string | undefined;
};

export const BuildWorkItemRow = ({ className, index, item, readOnly = false, warning }: TBuildWorkItemRowProps) => (
  <div
    className={cn("flex flex-col gap-1 rounded-md border border-subtle p-3", className)}
    data-testid={`build-work-item-${index}`}
  >
    <div className="flex items-center justify-between gap-2">
      <span className="text-13 font-medium text-primary">{item.name}</span>
      <span className="text-11 text-tertiary">{formatWorkItemPriority(item.priority)}</span>
    </div>
    {item.description ? <p className="text-12 text-secondary">{item.description}</p> : null}
    <div className="flex flex-wrap items-center gap-2 text-11 text-tertiary">
      <span>Estimate: {formatEstimate(item.estimate)}</span>
      {item.assignee_suggestion ? <span>Suggested: {item.assignee_suggestion}</span> : null}
      {(item.labels ?? []).map((label) => (
        <span key={label} className="rounded-full bg-layer-1 px-2 py-0.5">
          {label}
        </span>
      ))}
      {readOnly ? <span className="italic">read-only</span> : null}
    </div>
    {warning ? (
      <span className="text-11 text-warning-primary" data-testid={`build-work-item-warning-${index}`}>
        {warning}
      </span>
    ) : null}
  </div>
);
