// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { useState } from "react";
import { ExternalLink, Loader2, RefreshCcw, Sparkles } from "lucide-react";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { cn } from "@plane/utils";
import { AIService } from "@/services/ai.service";
import { isSelfHostedFeatureEnabled } from "@/plane-web/lib/self-host-entitlements";
import {
  buildBriefPagePath,
  getBriefDisabledHint,
  requestGenerateBrief,
  shouldShowBriefButton,
  type TBriefService,
  type TBriefStatus,
} from "./brief.utils";

export type { TBriefStatus, TRequestGenerateBriefResult } from "./brief.utils";
export { buildBriefPagePath, getBriefDisabledHint, requestGenerateBrief, shouldShowBriefButton };

type TGenerateBriefButtonProps = {
  className?: string | undefined;
  disabled?: boolean | undefined;
  featureEnabled?: boolean | undefined;
  initialPageId?: string | null | undefined;
  initialStatus?: TBriefStatus | undefined;
  isProviderConfigured?: boolean | undefined;
  issueId: string;
  projectId: string;
  service?: TBriefService | undefined;
  workspaceSlug: string;
};

const aiService = new AIService();

const defaultBriefService: TBriefService = {
  generateBrief: (workspaceSlug, projectId, issueId, payload) =>
    aiService.generateBrief(workspaceSlug, projectId, issueId, payload),
};

export const GenerateBriefButton = ({
  className,
  disabled = false,
  featureEnabled = isSelfHostedFeatureEnabled("ai_copilot"),
  initialPageId = null,
  initialStatus,
  isProviderConfigured,
  issueId,
  projectId,
  service = defaultBriefService,
  workspaceSlug,
}: TGenerateBriefButtonProps) => {
  const [pageId, setPageId] = useState<string | null>(initialPageId);
  const [status, setStatus] = useState<TBriefStatus>(
    isProviderConfigured === false ? "not_configured" : (initialStatus ?? (initialPageId ? "success" : "idle"))
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!shouldShowBriefButton({ featureEnabled })) return null;

  const providerHint = getBriefDisabledHint(isProviderConfigured);
  const isActionDisabled = disabled || status === "loading" || status === "not_configured" || !issueId || !projectId;
  const pagePath = pageId ? buildBriefPagePath(workspaceSlug, projectId, pageId) : null;

  const runGenerateBrief = async (regenerate: boolean) => {
    if (isActionDisabled) return;

    setStatus("loading");
    setErrorMessage(null);

    const result = await requestGenerateBrief({
      workspaceSlug,
      projectId,
      issueId,
      regenerate,
      service,
    });

    if (result.status === "success") {
      setPageId(result.pageId);
      setStatus("success");
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: regenerate ? "Brief regenerated" : "Brief generated",
        message: regenerate
          ? "A fresh draft page was created without removing the previous brief."
          : "Open the linked page to review the AI draft.",
      });
      return;
    }

    setStatus(result.status);
    setErrorMessage(result.message);
  };

  return (
    <div className={cn("inline-flex flex-col gap-2", className)} data-testid="generate-brief-button">
      <div className="flex flex-wrap items-center gap-2">
        {!pagePath ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={isActionDisabled}
            prependIcon={
              status === "loading" ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />
            }
            onClick={() => runGenerateBrief(false)}
          >
            {status === "not_configured" ? "Configure AI provider" : "Generate Brief"}
          </Button>
        ) : null}

        {pagePath ? (
          <a
            className="inline-flex items-center gap-1 text-13 font-medium text-accent-primary hover:underline"
            data-testid="brief-page-link"
            href={pagePath}
          >
            View brief
            <ExternalLink className="size-3.5" />
          </a>
        ) : null}

        {pagePath ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={isActionDisabled}
            data-testid="regenerate-brief-control"
            prependIcon={<RefreshCcw className="size-3.5" />}
            onClick={() => runGenerateBrief(true)}
          >
            Regenerate
          </Button>
        ) : null}
      </div>

      {providerHint ? <span className="text-11 text-tertiary">{providerHint}</span> : null}
      {errorMessage ? <span className="text-11 text-danger-primary">{errorMessage}</span> : null}
    </div>
  );
};
