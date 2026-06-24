// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { useState } from "react";
import { AlertTriangle, Check, Pencil } from "lucide-react";
import { Button } from "@plane/propel/button";
import { cn } from "@plane/utils";
import {
  buildTriageApplyPayload,
  formatConfidence,
  isLowConfidence,
  shouldShowTriageChips,
  type TTriageApplyPayload,
  type TTriageSuggestion,
} from "./intake-triage.utils";

type TTriageSuggestionChipsProps = {
  aiEnabled: boolean;
  className?: string | undefined;
  intakeEnabled: boolean;
  isProviderConfigured?: boolean | undefined;
  onApply?: ((suggestionId: string, payload?: TTriageApplyPayload) => void) | undefined;
  suggestion: TTriageSuggestion;
};

export const TriageSuggestionChips = ({
  aiEnabled,
  className,
  intakeEnabled,
  isProviderConfigured,
  onApply,
  suggestion,
}: TTriageSuggestionChipsProps) => {
  const [isCorrecting, setIsCorrecting] = useState(false);

  if (!shouldShowTriageChips({ intakeEnabled, aiEnabled, isProviderConfigured })) return null;

  const lowConfidence = isLowConfidence(suggestion.confidence);
  const isResolved = suggestion.status !== "pending";

  const handleApprove = () => {
    if (isResolved) return;
    onApply?.(suggestion.id);
  };

  const handleCorrectApply = () => {
    if (isResolved) return;
    // Member-corrected values would be collected here; we forward an explicit
    // (possibly empty) correction payload so the server treats it as a human apply.
    onApply?.(suggestion.id, buildTriageApplyPayload({}));
    setIsCorrecting(false);
  };

  return (
    <div className={cn("flex flex-col gap-2", className)} data-testid={`triage-suggestion-${suggestion.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        {suggestion.suggested_labels.map((label) => (
          <span
            key={label.id}
            data-testid={`triage-label-${label.id}`}
            className="rounded-full bg-layer-1 px-2 py-0.5 text-11 text-secondary"
          >
            {label.name}
          </span>
        ))}
        {suggestion.suggested_assignee ? (
          <span data-testid="triage-assignee" className="rounded-full bg-layer-1 px-2 py-0.5 text-11 text-secondary">
            @{suggestion.suggested_assignee.display_name}
          </span>
        ) : null}
        {suggestion.suggested_priority ? (
          <span data-testid="triage-priority" className="rounded-full bg-layer-1 px-2 py-0.5 text-11 text-secondary">
            {suggestion.suggested_priority}
          </span>
        ) : null}
        {suggestion.suggested_project ? (
          <span data-testid="triage-project" className="rounded-full bg-layer-1 px-2 py-0.5 text-11 text-secondary">
            {suggestion.suggested_project.name}
          </span>
        ) : null}

        <span
          data-testid="triage-confidence-badge"
          className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-10", {
            "bg-warning-component-surface-dark text-warning-primary": lowConfidence,
            "bg-layer-2 text-tertiary": !lowConfidence,
          })}
        >
          {lowConfidence ? <AlertTriangle className="size-3" /> : null}
          {lowConfidence ? "Low confidence" : "AI"} {formatConfidence(suggestion.confidence)}
        </span>
      </div>

      {isResolved ? (
        <span className="text-11 text-tertiary">{suggestion.status === "applied" ? "Applied" : "Dismissed"}</span>
      ) : (
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            data-testid="triage-approve"
            prependIcon={<Check className="size-3.5" />}
            onClick={handleApprove}
          >
            Approve
          </Button>
          <Button
            variant="secondary"
            size="sm"
            data-testid="triage-correct"
            prependIcon={<Pencil className="size-3.5" />}
            onClick={() => setIsCorrecting((prev) => !prev)}
          >
            Correct
          </Button>
          {isCorrecting ? (
            <Button variant="secondary" size="sm" data-testid="triage-correct-apply" onClick={handleCorrectApply}>
              Apply correction
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
};
