// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

/* SPDX-FileCopyrightText: 2023-present 650 Industries, Inc. <https://650.io/> */
/* SPDX-License-Identifier: AGPL-3.0-only */

export const DUPLICATE_OVERRIDE_WARNING_TEXT =
  "High-confidence duplicate found. Create anyway after reviewing the matches.";

import type { TSimilarIssue } from "@/types/similar-issue";

type TDuplicateOverrideWarningProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
};

export const shouldRequireDuplicateOverride = (hasHighConfidenceDuplicate: boolean, hasAcknowledgedOverride: boolean) =>
  hasHighConfidenceDuplicate && !hasAcknowledgedOverride;

export const buildDuplicateOverridePayload = (
  duplicateIssues: Pick<TSimilarIssue, "id" | "is_high_confidence">[],
  hasAcknowledgedOverride: boolean,
  hasHighConfidenceDuplicate: boolean,
  duplicateThreshold?: number | null
) => {
  if (!hasAcknowledgedOverride || !hasHighConfidenceDuplicate) return undefined;

  return {
    acknowledged: true,
    candidate_issue_ids: duplicateIssues.filter((issue) => issue.is_high_confidence).map((issue) => issue.id),
    threshold: duplicateThreshold ?? null,
  };
};

export function DuplicateOverrideWarning(props: TDuplicateOverrideWarningProps) {
  const { checked, onCheckedChange } = props;

  return (
    <label className="border-amber-300 bg-amber-50 text-xs text-amber-900 flex items-start gap-2 rounded border px-3 py-2">
      <input
        type="checkbox"
        className="mt-0.5"
        checked={checked}
        aria-label="Create anyway after reviewing duplicate matches"
        onChange={(event) => onCheckedChange(event.target.checked)}
      />
      <span>{DUPLICATE_OVERRIDE_WARNING_TEXT}</span>
    </label>
  );
}
