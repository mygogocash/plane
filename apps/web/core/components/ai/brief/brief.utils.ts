// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import type { TGenerateBriefPayload, TGenerateBriefResponse } from "@/services/ai.service";

export type TBriefService = {
  generateBrief: (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    payload?: TGenerateBriefPayload
  ) => Promise<TGenerateBriefResponse>;
};

export type TBriefStatus = "idle" | "loading" | "success" | "error" | "not_configured";

export type TRequestGenerateBriefResult =
  | {
      status: "success";
      pageId: string;
      regenerated?: boolean;
    }
  | {
      status: Exclude<TBriefStatus, "success" | "idle" | "loading">;
      message: string;
    };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getErrorMessage = (error: unknown) => {
  if (!isRecord(error)) return "Failed to generate brief.";
  const message = error.error ?? error.message;
  return typeof message === "string" && message.trim() ? message : "Failed to generate brief.";
};

const isProviderNotConfiguredError = (error: unknown) => {
  if (!isRecord(error)) return false;
  const message = getErrorMessage(error).toLowerCase();
  return message.includes("llm provider") || message.includes("api key");
};

export const buildBriefPagePath = (workspaceSlug: string, projectId: string, pageId: string) =>
  `/${workspaceSlug}/projects/${projectId}/pages/${pageId}`;

export const getBriefDisabledHint = (isProviderConfigured?: boolean) =>
  isProviderConfigured ? undefined : "Configure AI provider";

export const shouldShowBriefButton = ({ featureEnabled }: { featureEnabled: boolean }) => featureEnabled;

export const requestGenerateBrief = async ({
  workspaceSlug,
  projectId,
  issueId,
  regenerate = false,
  service,
}: {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  regenerate?: boolean;
  service: TBriefService;
}): Promise<TRequestGenerateBriefResult> => {
  try {
    const response = await service.generateBrief(workspaceSlug, projectId, issueId, { regenerate });
    return {
      status: "success",
      pageId: response.page_id,
      regenerated: response.regenerated,
    };
  } catch (error) {
    if (isProviderNotConfiguredError(error)) {
      return {
        status: "not_configured",
        message: "Configure AI provider to generate briefs.",
      };
    }

    return {
      status: "error",
      message: getErrorMessage(error),
    };
  }
};
