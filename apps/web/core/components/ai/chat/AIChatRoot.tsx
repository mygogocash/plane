// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "@plane/utils";
import type { TBuildProjectDraft, TCopilotConversation } from "@/services/ai.service";
import { isSelfHostedFeatureEnabled } from "@/plane-web/lib/self-host-entitlements";
import {
  getProviderDisabledHint,
  isAiSurfaceInteractive,
  isAiSurfaceVisible,
  type TCopilotUiMode,
} from "../shared/ai-surface.utils";
import { BuildDraftEditor, type TBuildDraftService } from "../build-mode/BuildDraftEditor";
import { ChatComposer } from "./ChatComposer";
import { RecentsList } from "./RecentsList";

type TAIChatRootProps = {
  buildDraft?: TBuildProjectDraft | null | undefined;
  buildDraftToken?: string | null | undefined;
  buildService?: TBuildDraftService | undefined;
  className?: string | undefined;
  conversations?: TCopilotConversation[] | undefined;
  featureEnabled?: boolean | undefined;
  initialMode?: TCopilotUiMode | undefined;
  isProviderConfigured?: boolean | undefined;
  projectId?: string | undefined;
  workspaceSlug: string;
};

export const AIChatRoot = ({
  buildDraft = null,
  buildDraftToken = null,
  buildService,
  className,
  conversations = [],
  featureEnabled = isSelfHostedFeatureEnabled("ai_copilot"),
  initialMode = "ask",
  isProviderConfigured,
  projectId,
  workspaceSlug,
}: TAIChatRootProps) => {
  const [uiMode, setUiMode] = useState<TCopilotUiMode>(initialMode);

  if (!isAiSurfaceVisible(featureEnabled)) return null;

  const interactive = isAiSurfaceInteractive({ featureEnabled, isProviderConfigured });
  const providerHint = getProviderDisabledHint(isProviderConfigured);

  return (
    <div className={cn("flex h-full w-full", className)} data-testid="ai-chat-root">
      <aside className="flex w-60 flex-col gap-3 border-r border-subtle p-3">
        <div className="flex items-center gap-2">
          <span className="text-13 font-semibold text-primary">Plane AI</span>
        </div>
        <button
          type="button"
          data-testid="ai-chat-new-thread"
          disabled={!interactive}
          className={cn("inline-flex items-center gap-1 rounded-sm px-2 py-1 text-12 font-medium", {
            "text-accent-primary hover:bg-layer-1": interactive,
            "cursor-not-allowed text-placeholder": !interactive,
          })}
        >
          <Plus className="size-3.5" />
          New chat
        </button>
        <RecentsList conversations={conversations} />
      </aside>

      <section className="flex flex-1 flex-col gap-3 p-4">
        {uiMode === "build" ? (
          <BuildDraftEditor
            draft={buildDraft}
            draftToken={buildDraftToken}
            projectId={projectId ?? ""}
            service={buildService}
            workspaceSlug={workspaceSlug}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center text-center text-13 text-tertiary">
            <span>Ask anything about your workspace.</span>
          </div>
        )}

        <ChatComposer uiMode={uiMode} onModeChange={setUiMode} disabled={!interactive} />

        {providerHint ? (
          <span className="text-11 text-tertiary" data-testid="ai-chat-provider-hint">
            {providerHint}
          </span>
        ) : null}
      </section>
    </div>
  );
};
