// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { Check, Sparkles, X } from "lucide-react";
import { cn } from "@plane/utils";
import {
  formatConfidence,
  isLowConfidence,
  shouldShowTriageChips,
  type TTriageSuggestion,
} from "./intake-triage.utils";

type TTriageReviewChipsProps = {
  className?: string | undefined;
  suggestion: TTriageSuggestion;
  intakeEnabled: boolean;
  aiEnabled: boolean;
  isProviderConfigured?: boolean | undefined;
  onApply?: ((suggestion: TTriageSuggestion) => void) | undefined;
  onReject?: ((suggestion: TTriageSuggestion) => void) | undefined;
};

const Chip = ({ testId, label }: { testId: string; label: string }) => (
  <span
    data-testid={testId}
    className="inline-flex items-center rounded-full bg-layer-2 px-2 py-0.5 text-11 text-secondary"
  >
    {label}
  </span>
);

/**
 * Renders AI triage suggestions (labels/assignee/priority/project) as review
 * chips with confidence. Suggestions are drafts — nothing mutates the intake
 * item until a member explicitly applies them.
 */
export const TriageReviewChips = ({
  className,
  suggestion,
  intakeEnabled,
  aiEnabled,
  isProviderConfigured,
  onApply,
  onReject,
}: TTriageReviewChipsProps) => {
  if (!shouldShowTriageChips({ intakeEnabled, aiEnabled, isProviderConfigured })) return null;

  const lowConfidence = isLowConfidence(suggestion.confidence);
  const isPending = suggestion.status === "pending";

  return (
    <div
      className={cn("flex flex-col gap-2 rounded-md border border-subtle bg-layer-1 p-3", className)}
      data-testid={`triage-suggestion-${suggestion.id}`}
    >
      <div className="flex items-center gap-1.5">
        <Sparkles className="size-3.5 text-accent-primary" />
        <span className="text-11 font-semibold tracking-wide text-tertiary uppercase">AI triage</span>
        <span
          data-testid="triage-confidence"
          className={cn("rounded-full px-1.5 py-0.5 text-10", {
            "bg-warning-component-surface-dark text-warning-primary": lowConfidence,
            "bg-accent-component-surface-dark text-accent-primary": !lowConfidence,
          })}
        >
          {formatConfidence(suggestion.confidence)}
          {lowConfidence ? " · low confidence" : ""}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {suggestion.suggested_labels.map((label) => (
          <Chip key={label.id} testId={`triage-label-${label.id}`} label={label.name} />
        ))}
        {suggestion.suggested_assignee ? (
          <Chip testId="triage-assignee" label={`@${suggestion.suggested_assignee.display_name}`} />
        ) : null}
        {suggestion.suggested_priority ? <Chip testId="triage-priority" label={suggestion.suggested_priority} /> : null}
        {suggestion.suggested_project ? (
          <Chip testId="triage-project" label={suggestion.suggested_project.name} />
        ) : null}
      </div>

      {isPending ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="triage-apply"
            className="inline-flex items-center gap-1 rounded-md bg-accent-primary px-2 py-1 text-11 text-white hover:opacity-90"
            onClick={() => onApply?.(suggestion)}
          >
            <Check className="size-3" />
            Apply
          </button>
          <button
            type="button"
            data-testid="triage-reject"
            className="inline-flex items-center gap-1 rounded-md bg-layer-2 px-2 py-1 text-11 text-tertiary hover:text-secondary"
            onClick={() => onReject?.(suggestion)}
          >
            <X className="size-3" />
            Dismiss
          </button>
        </div>
      ) : (
        <span className="text-10 text-tertiary" data-testid="triage-status">
          {suggestion.status === "applied" ? "Applied" : "Dismissed"}
        </span>
      )}
    </div>
  );
};
