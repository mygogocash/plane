/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// components
import { AIChatRoot } from "@/components/ai/chat/AIChatRoot";
// hooks
import { useCopilot } from "@/hooks/store/use-copilot";
import { useInstance } from "@/hooks/store/use-instance";
// plane-web
import { isSelfHostedFeatureEnabled } from "@/plane-web/lib/self-host-entitlements";
import type { Route } from "./+types/page";

function AIChatPage({ params }: Route.ComponentProps) {
  const { workspaceSlug } = params;
  const { config } = useInstance();
  const copilot = useCopilot();

  const featureEnabled = isSelfHostedFeatureEnabled("ai_copilot");

  if (!featureEnabled) return null;

  return (
    <AIChatRoot
      workspaceSlug={workspaceSlug}
      conversations={copilot.conversations}
      buildDraft={copilot.buildDraft}
      buildDraftToken={copilot.buildDraftToken}
      isProviderConfigured={config?.has_llm_configured}
      featureEnabled={featureEnabled}
    />
  );
}

export default observer(AIChatPage);
