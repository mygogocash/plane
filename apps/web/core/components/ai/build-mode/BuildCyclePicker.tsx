// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { CalendarRange } from "lucide-react";
import { cn } from "@plane/utils";
import type { TBuildProjectDraft } from "@/services/ai.service";

type TBuildCyclePickerProps = {
  className?: string | undefined;
  suggestedCycle: TBuildProjectDraft["suggested_cycle"];
};

const formatRange = (start?: string | null, end?: string | null) => {
  if (!start && !end) return null;
  return `${start ?? "?"} → ${end ?? "?"}`;
};

export const BuildCyclePicker = ({ className, suggestedCycle }: TBuildCyclePickerProps) => {
  if (!suggestedCycle?.name) {
    return (
      <div className={cn("flex items-center gap-2 text-12 text-tertiary", className)} data-testid="build-cycle-picker">
        <CalendarRange className="size-3.5" />
        <span>No cycle suggested</span>
      </div>
    );
  }

  const range = formatRange(suggestedCycle.start_date, suggestedCycle.end_date);

  return (
    <div className={cn("flex items-center gap-2 text-12 text-secondary", className)} data-testid="build-cycle-picker">
      <CalendarRange className="size-3.5" />
      <span className="font-medium">{suggestedCycle.name}</span>
      {range ? <span className="text-tertiary">{range}</span> : null}
      <span className="text-11 text-accent-primary">Edit cycle assignment</span>
    </div>
  );
};
