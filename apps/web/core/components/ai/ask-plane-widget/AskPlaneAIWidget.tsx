// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@plane/propel/button";
import { cn } from "@plane/utils";
import { isSelfHostedFeatureEnabled } from "@/plane-web/lib/self-host-entitlements";
import {
  getProviderDisabledHint,
  isAiSurfaceInteractive,
  isAiSurfaceVisible,
  mapUiModeToCopilotMode,
  type TCopilotUiMode,
} from "../shared/ai-surface.utils";
import { CopilotModeDropdown } from "./CopilotModeDropdown";

type TAskPlaneAIWidgetProps = {
  className?: string | undefined;
  featureEnabled?: boolean | undefined;
  initialMode?: TCopilotUiMode | undefined;
  isProviderConfigured?: boolean | undefined;
  onActivate?:
    | ((args: { uiMode: TCopilotUiMode; copilotMode: ReturnType<typeof mapUiModeToCopilotMode> }) => void)
    | undefined;
  workspaceLabel?: string | undefined;
};

export const AskPlaneAIWidget = ({
  className,
  featureEnabled = isSelfHostedFeatureEnabled("ai_copilot"),
  initialMode = "ask",
  isProviderConfigured,
  onActivate,
  workspaceLabel,
}: TAskPlaneAIWidgetProps) => {
  const [uiMode, setUiMode] = useState<TCopilotUiMode>(initialMode);

  if (!isAiSurfaceVisible(featureEnabled)) return null;

  const interactive = isAiSurfaceInteractive({ featureEnabled, isProviderConfigured });
  const providerHint = getProviderDisabledHint(isProviderConfigured);

  const handleActivate = () => {
    if (!interactive) return;
    onActivate?.({ uiMode, copilotMode: mapUiModeToCopilotMode(uiMode) });
  };

  return (
    <div
      className={cn("flex flex-col gap-3 rounded-lg border border-subtle bg-layer-1 p-4", className)}
      data-testid="ask-plane-ai-widget"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-accent-primary" />
          <span className="text-14 font-semibold text-primary">Ask Plane AI</span>
        </div>
        {workspaceLabel ? (
          <span className="rounded-full bg-layer-2 px-2 py-0.5 text-11 text-tertiary">{workspaceLabel}</span>
        ) : null}
      </div>

      <p className="text-12 text-secondary">
        Ask questions about your work, or switch to Build to draft a whole project plan.
      </p>

      <CopilotModeDropdown value={uiMode} onChange={setUiMode} disabled={!interactive} />

      <Button
        variant="primary"
        size="sm"
        disabled={!interactive}
        prependIcon={<Sparkles className="size-3.5" />}
        onClick={handleActivate}
      >
        {uiMode === "build" ? "Activate Build mode" : "Ask Plane AI"}
      </Button>

      {providerHint ? (
        <span className="text-11 text-tertiary" data-testid="ask-plane-ai-provider-hint">
          {providerHint}
        </span>
      ) : null}
    </div>
  );
};
