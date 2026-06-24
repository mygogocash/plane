// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { Sparkles } from "lucide-react";
import { cn } from "@plane/utils";
import { AIService } from "@/services/ai.service";
import { isSelfHostedFeatureEnabled } from "@/plane-web/lib/self-host-entitlements";
import {
  deriveContextAssistPayload,
  isAiSurfaceInteractive,
  isAiSurfaceVisible,
  type TAiRouteParams,
  type TContextAssistService,
} from "./shared/ai-surface.utils";

type TAIAssistantButtonProps = {
  className?: string | undefined;
  featureEnabled?: boolean | undefined;
  isProviderConfigured?: boolean | undefined;
  onOpenPanel?:
    | ((args: {
        entityType: ReturnType<typeof deriveContextAssistPayload>["entity_type"];
        entityId: ReturnType<typeof deriveContextAssistPayload>["entity_id"];
      }) => void)
    | undefined;
  routeParams?: TAiRouteParams | undefined;
  service?: TContextAssistService | undefined;
  workspaceSlug: string;
};

const aiService = new AIService();

const defaultContextAssistService: TContextAssistService = {
  contextAssist: (workspaceSlug, payload) => aiService.contextAssist(workspaceSlug, payload),
};

export const AIAssistantButton = ({
  className,
  featureEnabled = isSelfHostedFeatureEnabled("ai_copilot"),
  isProviderConfigured,
  onOpenPanel,
  routeParams = {},
  service = defaultContextAssistService,
  workspaceSlug,
}: TAIAssistantButtonProps) => {
  if (!isAiSurfaceVisible(featureEnabled)) return null;

  const interactive = isAiSurfaceInteractive({ featureEnabled, isProviderConfigured });

  const handleClick = () => {
    if (!interactive) return;
    // Derive the most specific entity from route params (Q15). A list/board view
    // with no entity opens a general assist — never a guess.
    const payload = deriveContextAssistPayload(routeParams);
    onOpenPanel?.({ entityType: payload.entity_type, entityId: payload.entity_id });
    // Fire-and-forget the context-assist prefetch; the panel renders the result.
    void service.contextAssist(workspaceSlug, payload);
  };

  return (
    <button
      type="button"
      data-testid="ai-assistant-button"
      disabled={!interactive}
      title={interactive ? "AI assistant" : "Connect an AI provider in instance settings"}
      aria-label="AI assistant"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-12 font-medium",
        {
          "text-secondary hover:bg-layer-1": interactive,
          "cursor-not-allowed text-placeholder opacity-60": !interactive,
        },
        className
      )}
      onClick={handleClick}
    >
      <Sparkles className="size-3.5" />
      AI assistant
    </button>
  );
};
