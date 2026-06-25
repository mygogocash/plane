/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { Row } from "@plane/ui";
// components
import { cn } from "@plane/utils";
import { AIAssistantButton } from "@/components/ai/AIAssistantButton";
// hooks
import { useCopilot } from "@/hooks/store/use-copilot";
import { useInstance } from "@/hooks/store/use-instance";
import { ExtendedAppHeader } from "@/plane-web/components/common/extended-app-header";

export interface AppHeaderProps {
  header: ReactNode;
  mobileHeader?: ReactNode;
  className?: string;
  rowClassName?: string;
}

export const AppHeader = observer(function AppHeader(props: AppHeaderProps) {
  const { header, mobileHeader, className, rowClassName } = props;
  // routing + stores for the global AI assistant button (AI-T27)
  const params = useParams();
  const { config } = useInstance();
  const copilot = useCopilot();

  const workspaceSlug = params?.workspaceSlug?.toString();

  return (
    <div className={cn("z-[18]", className)}>
      <Row className={cn("flex h-11 w-full items-center gap-2 border-b border-subtle bg-surface-1", rowClassName)}>
        <ExtendedAppHeader header={header} />
        {workspaceSlug ? (
          <div className="ml-auto hidden items-center md:flex">
            <AIAssistantButton
              workspaceSlug={workspaceSlug}
              isProviderConfigured={config?.has_llm_configured}
              routeParams={{
                issueId: params?.workItem?.toString() ?? params?.issueId?.toString(),
                cycleId: params?.cycleId?.toString(),
                initiativeId: params?.initiativeId?.toString(),
                projectId: params?.projectId?.toString(),
              }}
              onOpenPanel={({ entityType, entityId }) => {
                copilot.setMode("context_assist");
                copilot.openPanel({ entityType: entityType ?? null, entityId: entityId ?? null });
              }}
            />
          </div>
        ) : null}
      </Row>
      {mobileHeader}
    </div>
  );
});
