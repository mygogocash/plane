/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import type { ISuggestedTransition } from "@plane/types";

export type TAiSuggestionChipModel = {
  label: string;
  source: ISuggestedTransition["source"];
  targetStateId: string;
};

export const getAiSuggestionChipModel = ({
  suggestion,
  getStateName,
}: {
  suggestion: ISuggestedTransition | null | undefined;
  getStateName: (stateId: string) => string;
}): TAiSuggestionChipModel | null => {
  if (!suggestion?.to_state) return null;

  return {
    label: `Suggest ${getStateName(suggestion.to_state)}`,
    source: suggestion.source,
    targetStateId: suggestion.to_state,
  };
};

export const acceptSuggestedTransition = ({
  fromStateId,
  issueId,
  projectId,
  toStateId,
  transitionWorkItem,
  workspaceSlug,
}: {
  fromStateId: string;
  issueId: string;
  projectId: string;
  toStateId: string;
  transitionWorkItem: (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    fromStateId: string,
    toStateId: string
  ) => Promise<unknown>;
  workspaceSlug: string;
}): Promise<unknown> => transitionWorkItem(workspaceSlug, projectId, issueId, fromStateId, toStateId);
