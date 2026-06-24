// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { WORKSPACE_SIDEBAR_DYNAMIC_NAVIGATION_ITEMS, type IWorkspaceSidebarNavigationItem } from "@plane/constants";
import type {
  TContextAssistEntityType,
  TContextAssistPayload,
  TContextAssistResponse,
  TCopilotMode,
} from "@/services/ai.service";

/** UI-facing copilot modes surfaced through the Ask/Build dropdown. */
export type TCopilotUiMode = "ask" | "build";

/**
 * Maps the user-facing Ask/Build toggle to a concrete server copilot mode.
 * Ask defaults to `auto` (the server picks answer/command); Build always uses
 * `build_project`. Keeping this in one place prevents every surface from
 * re-deriving the mapping.
 */
export const mapUiModeToCopilotMode = (uiMode: TCopilotUiMode): TCopilotMode =>
  uiMode === "build" ? "build_project" : "auto";

export const mapCopilotModeToUiMode = (mode: TCopilotMode): TCopilotUiMode =>
  mode === "build_project" ? "build" : "ask";

/**
 * Gating order shared by every AI surface (PRD): the self-host entitlement flag
 * gates visibility, then provider configuration gates interactivity. Never a
 * paywall — when the flag is off the surface is hidden, never upsold.
 */
export const isAiSurfaceVisible = (featureEnabled: boolean) => featureEnabled;

/**
 * Returns the `ai_chat` sidebar nav entry when the `ai_copilot` flag is on, or
 * `null` so the item is hidden (not paywalled) when off.
 */
export const getAiChatNavItem = (featureEnabled: boolean): IWorkspaceSidebarNavigationItem | null =>
  featureEnabled ? (WORKSPACE_SIDEBAR_DYNAMIC_NAVIGATION_ITEMS["ai_chat"] ?? null) : null;

export const isAiSurfaceInteractive = ({
  featureEnabled,
  isProviderConfigured,
}: {
  featureEnabled: boolean;
  isProviderConfigured?: boolean;
}) => featureEnabled && isProviderConfigured !== false;

export const getProviderDisabledHint = (isProviderConfigured?: boolean) =>
  isProviderConfigured === false ? "Connect an AI provider in instance settings" : undefined;

/**
 * Derives the most specific entity for one-keystroke context-assist from route
 * params (Q15). Returns `{ entity_type: null }` for list/board views where no
 * entity is in scope — a general assist, never a guess.
 */
export type TAiRouteParams = {
  issueId?: string | null;
  cycleId?: string | null;
  initiativeId?: string | null;
  projectId?: string | null;
};

export const deriveContextAssistPayload = (params: TAiRouteParams): TContextAssistPayload => {
  const ordered: Array<[TContextAssistEntityType, string | null | undefined]> = [
    ["issue", params.issueId],
    ["cycle", params.cycleId],
    ["initiative", params.initiativeId],
    ["project", params.projectId],
  ];

  for (const [entityType, entityId] of ordered) {
    if (entityId) return { entity_type: entityType, entity_id: entityId };
  }

  return { entity_type: null, entity_id: null };
};

export const isGeneralAssist = (payload: TContextAssistPayload) => !payload.entity_type || !payload.entity_id;

/**
 * Controls that look like they should exist in a modern chat composer but have
 * NO fork backend. They are rendered explicitly disabled with a "coming soon"
 * affordance — never as silent no-ops (honesty / no-magic rule).
 */
export type TUnavailableComposerControl = {
  key: "mic" | "attachments" | "web_search";
  label: string;
  disabled: true;
  comingSoon: true;
};

export const AI_COMPOSER_UNAVAILABLE_CONTROLS: TUnavailableComposerControl[] = [
  { key: "mic", label: "Voice input (coming soon)", disabled: true, comingSoon: true },
  { key: "attachments", label: "Add files or photos (coming soon)", disabled: true, comingSoon: true },
  { key: "web_search", label: "Web search (coming soon)", disabled: true, comingSoon: true },
];

export type TContextAssistService = {
  contextAssist: (workspaceSlug: string, payload?: TContextAssistPayload) => Promise<TContextAssistResponse>;
};

export const requestContextAssist = async ({
  workspaceSlug,
  payload,
  service,
}: {
  workspaceSlug: string;
  payload: TContextAssistPayload;
  service: TContextAssistService;
}): Promise<TContextAssistResponse> => service.contextAssist(workspaceSlug, payload);
