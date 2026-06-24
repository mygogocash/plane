// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import type { TSimilarIssue } from "@/types/similar-issue";
import {
  formatDuplicateScore,
  formatMatchedOn,
  isDuplicateSubmitBlocked,
  shouldShowDuplicateWarning,
} from "./duplicate-detection.utils";

type TDuplicateWarningProps = {
  acknowledgedOverride: boolean;
  candidates: TSimilarIssue[];
  featureEnabled?: boolean;
  highConfidence?: boolean;
  isProviderConfigured?: boolean;
  maxInlineCandidates?: number;
  onAcknowledgedOverrideChange: (checked: boolean) => void;
  threshold?: number | null;
};

export const DUPLICATE_WARNING_TITLE = "Similar issues found";
export const DUPLICATE_OVERRIDE_LABEL = "Create anyway after reviewing duplicate matches";

export function DuplicateWarning({
  acknowledgedOverride,
  candidates,
  featureEnabled = true,
  highConfidence = false,
  isProviderConfigured,
  maxInlineCandidates = 3,
  onAcknowledgedOverrideChange,
  threshold,
}: TDuplicateWarningProps) {
  if (!shouldShowDuplicateWarning({ featureEnabled, isProviderConfigured, candidates })) {
    return null;
  }

  const visibleCandidates = candidates.slice(0, maxInlineCandidates);
  const submitBlocked = isDuplicateSubmitBlocked(highConfidence, acknowledgedOverride);

  return (
    <section
      aria-live="polite"
      className="rounded-md border border-subtle bg-layer-1 p-3"
      data-submit-blocked={submitBlocked ? "true" : "false"}
    >
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-12 font-medium text-primary">{DUPLICATE_WARNING_TITLE}</h4>
        {typeof threshold === "number" ? (
          <span className="text-11 text-tertiary">Threshold {Math.round(threshold * 100)}%</span>
        ) : null}
      </div>

      <ul className="mt-3 space-y-2">
        {visibleCandidates.map((candidate) => (
          <li key={candidate.id} className="rounded bg-layer-2 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-12 text-primary">{candidate.name}</span>
              <span className="shrink-0 rounded bg-surface-2 px-2 py-0.5 text-11 font-medium text-secondary">
                {formatDuplicateScore(candidate.confidence)}
              </span>
            </div>
            {candidate.matched_on?.length ? (
              <p className="mt-1 text-11 text-tertiary">Matched on {formatMatchedOn(candidate.matched_on)}</p>
            ) : null}
          </li>
        ))}
      </ul>

      {highConfidence ? (
        <label className="border-amber-300 bg-amber-50 text-amber-900 mt-3 flex items-start gap-2 rounded border px-3 py-2 text-12">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={acknowledgedOverride}
            aria-label={DUPLICATE_OVERRIDE_LABEL}
            onChange={(event) => onAcknowledgedOverrideChange(event.target.checked)}
          />
          <span>{DUPLICATE_OVERRIDE_LABEL}</span>
        </label>
      ) : null}
    </section>
  );
}

export { isDuplicateSubmitBlocked, shouldShowDuplicateWarning };
