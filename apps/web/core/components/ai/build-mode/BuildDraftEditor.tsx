// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@plane/propel/button";
import { cn } from "@plane/utils";
import { AIService } from "@/services/ai.service";
import type { TBuildProjectDraft } from "@/services/ai.service";
import {
  applyBuildDraft as applyBuildDraftRequest,
  countDraftWorkItems,
  type TBuildApplyStatus,
  type TBuildDraftService,
} from "./build-draft.utils";
import { BuildCyclePicker } from "./BuildCyclePicker";
import { BuildWorkItemRow } from "./BuildWorkItemRow";

export type { TBuildApplyStatus, TBuildDraftService } from "./build-draft.utils";

type TBuildDraftEditorProps = {
  className?: string | undefined;
  draft: TBuildProjectDraft | null;
  draftToken: string | null;
  initialStatus?: TBuildApplyStatus | undefined;
  initialWarnings?: string[] | undefined;
  onApplied?: ((response: unknown) => void) | undefined;
  projectId: string;
  service?: TBuildDraftService | undefined;
  workspaceSlug: string;
};

const aiService = new AIService();

const defaultBuildDraftService: TBuildDraftService = {
  applyBuildDraft: (workspaceSlug, projectId, payload) => aiService.applyBuildDraft(workspaceSlug, projectId, payload),
};

export const BuildDraftEditor = ({
  className,
  draft,
  draftToken,
  initialStatus = "idle",
  initialWarnings = [],
  onApplied,
  projectId,
  service = defaultBuildDraftService,
  workspaceSlug,
}: TBuildDraftEditorProps) => {
  const [status, setStatus] = useState<TBuildApplyStatus>(initialStatus);
  const [warnings, setWarnings] = useState<string[]>(initialWarnings);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!draft) {
    return (
      <div className={cn("text-12 text-tertiary", className)} data-testid="build-draft-empty">
        No draft yet. Describe a project in Build mode to generate one.
      </div>
    );
  }

  const isApplying = status === "applying";
  const canApply = Boolean(draftToken) && status !== "applied";

  const handleApply = async () => {
    if (!draftToken || isApplying) return;

    setStatus("applying");
    setErrorMessage(null);

    const result = await applyBuildDraftRequest({
      workspaceSlug,
      projectId,
      draftToken,
      draft,
      service,
    });

    if (result.status === "applied") {
      setStatus("applied");
      setWarnings(result.warnings);
      onApplied?.(result.response);
      return;
    }

    setStatus("error");
    setErrorMessage(result.message);
  };

  return (
    <div className={cn("flex flex-col gap-3", className)} data-testid="build-draft-editor">
      <div className="flex flex-col gap-1">
        <span className="text-14 font-semibold text-primary">{draft.name}</span>
        {draft.description ? <p className="text-12 text-secondary">{draft.description}</p> : null}
      </div>

      <BuildCyclePicker suggestedCycle={draft.suggested_cycle} />

      <div className="flex flex-col gap-2">
        <span className="text-12 font-medium text-tertiary">{countDraftWorkItems(draft)} work items</span>
        {draft.work_items.map((item, index) => (
          <BuildWorkItemRow
            key={`${item.name}-${item.description ?? ""}-${item.priority ?? ""}`}
            index={index}
            item={item}
            warning={warnings[index]}
          />
        ))}
      </div>

      {warnings.length > 0 ? (
        <ul className="flex flex-col gap-1" data-testid="build-draft-warnings">
          {warnings.map((warning) => (
            <li key={warning} className="text-11 text-warning-primary">
              {warning}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex items-center gap-2">
        <Button
          variant="primary"
          size="sm"
          disabled={!canApply || isApplying}
          prependIcon={isApplying ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
          onClick={handleApply}
        >
          {status === "applied" ? "Draft applied" : "Apply draft"}
        </Button>
        <Button variant="secondary" size="sm" disabled={isApplying}>
          Cancel
        </Button>
      </div>

      {errorMessage ? <span className="text-11 text-danger-primary">{errorMessage}</span> : null}
    </div>
  );
};
