// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import type { TApplyBuildDraftResponse, TBuildProjectDraft, TBuildProjectWorkItemDraft } from "@/services/ai.service";

export type { TApplyBuildDraftResponse, TBuildProjectDraft, TBuildProjectWorkItemDraft };

export type TBuildDraftService = {
  applyBuildDraft: (
    workspaceSlug: string,
    projectId: string,
    payload: { draft_token: string; project_draft: TBuildProjectDraft }
  ) => Promise<TApplyBuildDraftResponse>;
};

export type TBuildApplyStatus = "idle" | "applying" | "applied" | "error";

export const formatWorkItemPriority = (priority?: string) => {
  if (!priority || priority === "none") return "No priority";
  return priority.charAt(0).toUpperCase() + priority.slice(1);
};

export const formatEstimate = (estimate?: number | null) =>
  estimate === null || estimate === undefined ? "—" : String(estimate);

export const countDraftWorkItems = (draft: TBuildProjectDraft | null) => draft?.work_items?.length ?? 0;

/** Updates a single work item by index, returning a new draft (immutably). */
export const updateWorkItem = (
  draft: TBuildProjectDraft,
  index: number,
  patch: Partial<TBuildProjectWorkItemDraft>
): TBuildProjectDraft => ({
  ...draft,
  work_items: draft.work_items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
});

export const removeWorkItem = (draft: TBuildProjectDraft, index: number): TBuildProjectDraft => ({
  ...draft,
  work_items: draft.work_items.filter((_, i) => i !== index),
});

export type TApplyBuildDraftResult =
  | { status: "applied"; response: TApplyBuildDraftResponse; warnings: string[] }
  | { status: "error"; message: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getErrorMessage = (error: unknown) => {
  if (!isRecord(error)) return "Failed to apply draft.";
  const message = error.error ?? error.message;
  return typeof message === "string" && message.trim() ? message : "Failed to apply draft.";
};

/**
 * Applies an editable build draft. Nothing is persisted until this runs — the
 * editor only mutates local state. Per-item warnings from the server are surfaced
 * to the caller so the UI can render create-or-skip outcomes.
 */
export const applyBuildDraft = async ({
  workspaceSlug,
  projectId,
  draftToken,
  draft,
  service,
}: {
  workspaceSlug: string;
  projectId: string;
  draftToken: string;
  draft: TBuildProjectDraft;
  service: TBuildDraftService;
}): Promise<TApplyBuildDraftResult> => {
  try {
    const response = await service.applyBuildDraft(workspaceSlug, projectId, {
      draft_token: draftToken,
      project_draft: draft,
    });
    return { status: "applied", response, warnings: response.warnings ?? [] };
  } catch (error) {
    return { status: "error", message: getErrorMessage(error) };
  }
};
