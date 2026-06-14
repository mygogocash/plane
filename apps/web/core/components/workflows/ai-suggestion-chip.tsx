/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useContext, useState } from "react";
import { observer } from "mobx-react";
import { Sparkles } from "lucide-react";
import useSWR from "swr";
// plane imports
import { Button } from "@plane/propel/button";
// hooks
import { useProjectState } from "@/hooks/store/use-project-state";
// store
import { StoreContext } from "@/lib/store-context";
// plane-web
import { isSelfHostedFeatureEnabled } from "@/plane-web/lib/self-host-entitlements";
// local imports
import { acceptSuggestedTransition, getAiSuggestionChipModel } from "./ai-suggestion-chip.utils";

type Props = {
  disabled?: boolean;
  fromStateId: string | null | undefined;
  issueId: string;
  projectId: string;
  workspaceSlug: string;
};

const getWorkflowErrorMessage = (error: unknown): string => {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "detail" in error && typeof error.detail === "string") return error.detail;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string")
    return error.message;
  return "Suggestion could not be applied. Please try again.";
};

export const AiSuggestionChip = observer(function AiSuggestionChip(props: Props) {
  const { disabled = false, fromStateId, issueId, projectId, workspaceSlug } = props;
  const store = useContext(StoreContext);
  if (store === undefined) throw new Error("AiSuggestionChip must be used within StoreProvider");

  const featureEnabled = isSelfHostedFeatureEnabled("workflows_approvals");
  const { getStateById } = useProjectState();
  const [isAccepting, setIsAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useSWR(
    featureEnabled && workspaceSlug && projectId && issueId
      ? `WORK_ITEM_SUGGESTED_TRANSITION_${workspaceSlug}_${projectId}_${issueId}`
      : null,
    () => store.workflow.fetchSuggestedTransition(workspaceSlug, projectId, issueId),
    { revalidateIfStale: false, revalidateOnFocus: false }
  );

  const suggestion = store.workflow.getSuggestion(issueId);
  const model = getAiSuggestionChipModel({
    suggestion,
    getStateName: (stateId) => getStateById(stateId)?.name ?? stateId,
  });

  if (!featureEnabled || !fromStateId || !model) return null;

  const handleAccept = async () => {
    setIsAccepting(true);
    setError(null);
    try {
      await acceptSuggestedTransition({
        fromStateId,
        issueId,
        projectId,
        toStateId: model.targetStateId,
        transitionWorkItem: store.workflow.transitionWorkItem,
        workspaceSlug,
      });
    } catch (acceptError) {
      setError(getWorkflowErrorMessage(acceptError));
    } finally {
      setIsAccepting(false);
    }
  };

  return (
    <div className="space-y-1">
      <Button
        variant="tertiary"
        size="sm"
        className="w-full justify-start rounded-md"
        loading={isAccepting}
        disabled={disabled || isAccepting}
        prependIcon={<Sparkles />}
        onClick={handleAccept}
      >
        <span className="min-w-0 truncate">{model.label}</span>
        <span className="ml-auto flex-shrink-0 rounded-sm bg-accent-subtle px-1 text-caption-sm-medium text-accent-primary">
          {model.source === "ai" ? "AI" : "Rule"}
        </span>
      </Button>
      {error && (
        <div className="rounded-sm bg-danger-subtle p-1.5 text-caption-md-regular break-words text-danger-primary">
          {error}
        </div>
      )}
    </div>
  );
});
