// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

export type TTriageSuggestionStatus = "pending" | "applied" | "rejected";

export type TTriageSuggestedLabel = { id: string; name: string };
export type TTriageSuggestedAssignee = { id: string; display_name: string };
export type TTriageSuggestedProject = { id: string; name: string };

export type TTriageSuggestion = {
  id: string;
  intake_issue: string;
  suggested_labels: TTriageSuggestedLabel[];
  suggested_assignee?: TTriageSuggestedAssignee | null;
  suggested_priority?: string | null;
  suggested_project?: TTriageSuggestedProject | null;
  confidence: number;
  status: TTriageSuggestionStatus;
};

export type TTriageApplyPayload = {
  /** Member-corrected values override the AI suggestion when supplied. */
  label_ids?: string[];
  assignee_id?: string | null;
  priority?: string | null;
  project_id?: string | null;
};

export type TTriageService = {
  listSuggestions: (workspaceSlug: string, intakeId: string) => Promise<TTriageSuggestion[]>;
  applySuggestion: (
    workspaceSlug: string,
    suggestionId: string,
    payload?: TTriageApplyPayload
  ) => Promise<TTriageSuggestion>;
};

/** Q13 default: suggestions below this confidence are flagged low-confidence. */
export const LOW_CONFIDENCE_THRESHOLD = 0.5;

export const isLowConfidence = (confidence: number) => confidence < LOW_CONFIDENCE_THRESHOLD;

export const formatConfidence = (confidence: number) => `${Math.round(confidence * 100)}%`;

/**
 * Triage chips require the intake queue (`intake`), AI suggestions (`ai_copilot`),
 * AND a configured provider. When any is missing the chips are absent and manual
 * triage is unchanged (never a paywall).
 */
export const shouldShowTriageChips = ({
  intakeEnabled,
  aiEnabled,
  isProviderConfigured,
}: {
  intakeEnabled: boolean;
  aiEnabled: boolean;
  isProviderConfigured?: boolean;
}) => intakeEnabled && aiEnabled && isProviderConfigured !== false;

/** Builds the apply payload from member-corrected values, omitting untouched fields. */
export const buildTriageApplyPayload = (corrections: TTriageApplyPayload): TTriageApplyPayload => {
  const payload: TTriageApplyPayload = {};
  if (corrections.label_ids !== undefined) payload.label_ids = corrections.label_ids;
  if (corrections.assignee_id !== undefined) payload.assignee_id = corrections.assignee_id;
  if (corrections.priority !== undefined) payload.priority = corrections.priority;
  if (corrections.project_id !== undefined) payload.project_id = corrections.project_id;
  return payload;
};
