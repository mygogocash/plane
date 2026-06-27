// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { cn } from "@plane/utils";
import type { TEntitySummaryResponse, TSummaryEntityType } from "@/services/ai.service";
import { AIService } from "@/services/ai.service";
import { isSelfHostedFeatureEnabled } from "@/plane-web/lib/self-host-entitlements";
import { AISummaryModal, type TAISummaryModalStatus } from "./AISummaryModal";
import { copyEntityShareLink, getDigestDisabledHint, loadEntitySummary, type TSummaryService } from "./summaries.utils";

export type TDigestStatus = TAISummaryModalStatus | "not_configured";

export type TRequestEntityDigestResult =
  | {
      status: "success";
      summary: TEntitySummaryResponse;
    }
  | {
      status: Exclude<TDigestStatus, "success" | "idle" | "loading">;
      message: string;
    };

type TGetDigestButtonProps = {
  className?: string | undefined;
  disabled?: boolean | undefined;
  entityId: string;
  entityTitle?: string | undefined;
  entityType: TSummaryEntityType;
  featureEnabled?: boolean | undefined;
  initialStatus?: TDigestStatus | undefined;
  initialSummary?: TEntitySummaryResponse | null | undefined;
  isModalOpen?: boolean | undefined;
  isProviderConfigured?: boolean | undefined;
  service?: TSummaryService | undefined;
  workspaceSlug: string;
};

const aiService = new AIService();

const defaultSummaryService: TSummaryService = {
  summarizeEntity: (workspaceSlug, entityType, entityId) =>
    aiService.summarizeEntity(workspaceSlug, entityType, entityId),
  createShareLink: (workspaceSlug, entityType, entityId) =>
    aiService.createShareLink(workspaceSlug, entityType, entityId),
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getErrorMessage = (error: unknown) => {
  if (!isRecord(error)) return "Failed to generate digest.";
  const message = error.error ?? error.message;
  return typeof message === "string" && message.trim() ? message : "Failed to generate digest.";
};

const isProviderNotConfiguredError = (error: unknown) => {
  if (!isRecord(error)) return false;
  const message = getErrorMessage(error).toLowerCase();
  return message.includes("llm provider") || message.includes("api key");
};

export const requestEntityDigest = async ({
  workspaceSlug,
  entityType,
  entityId,
  service,
}: {
  workspaceSlug: string;
  entityType: TSummaryEntityType;
  entityId: string;
  service: TSummaryService;
}): Promise<TRequestEntityDigestResult> => {
  try {
    const summary = await loadEntitySummary({
      workspaceSlug,
      entityType,
      entityId,
      service,
    });
    return { status: "success", summary };
  } catch (error) {
    if (isProviderNotConfiguredError(error)) {
      return {
        status: "not_configured",
        message: "Configure AI provider to generate digests.",
      };
    }

    return {
      status: "error",
      message: getErrorMessage(error),
    };
  }
};

const digestTitle = (entityType: TSummaryEntityType, entityTitle?: string) => {
  const scopeLabel = entityType === "cycle" ? "Cycle" : entityType === "project" ? "Project" : "Initiative";
  return entityTitle ? `${scopeLabel} digest: ${entityTitle}` : `${scopeLabel} digest`;
};

export const GetDigestButton = ({
  className,
  disabled = false,
  entityId,
  entityTitle,
  entityType,
  featureEnabled = isSelfHostedFeatureEnabled("ai_copilot"),
  initialStatus,
  initialSummary = null,
  isModalOpen = false,
  isProviderConfigured,
  service = defaultSummaryService,
  workspaceSlug,
}: TGetDigestButtonProps) => {
  const [isOpen, setIsOpen] = useState(isModalOpen || Boolean(initialSummary));
  const [summary, setSummary] = useState<TEntitySummaryResponse | null>(initialSummary);
  const [status, setStatus] = useState<TDigestStatus>(
    isProviderConfigured === false ? "not_configured" : (initialStatus ?? (initialSummary ? "success" : "idle"))
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [isCopyingShareLink, setIsCopyingShareLink] = useState(false);

  if (!featureEnabled) return null;
  if (isProviderConfigured === false) return null;

  const providerHint = getDigestDisabledHint(isProviderConfigured);
  const isButtonDisabled = disabled || status === "loading" || status === "not_configured" || !entityId;

  const openDigest = async () => {
    if (isButtonDisabled) return;

    setIsOpen(true);
    setStatus("loading");
    setErrorMessage(null);
    setShareUrl(null);

    const result = await requestEntityDigest({
      workspaceSlug,
      entityType,
      entityId,
      service,
    });

    if (result.status === "success") {
      setSummary(result.summary);
      setStatus("success");
      return;
    }

    setSummary(null);
    setStatus(result.status);
    setErrorMessage(result.message);
  };

  const handleCopyShareLink = async () => {
    if (status !== "success" || isCopyingShareLink) return;

    setIsCopyingShareLink(true);
    try {
      const nextShareUrl = await copyEntityShareLink({
        workspaceSlug,
        entityType,
        entityId,
        service,
        origin: typeof window !== "undefined" ? window.location.origin : undefined,
      });

      setShareUrl(nextShareUrl);

      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(nextShareUrl);
      }

      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Share link copied",
        message: "Anyone with the link can view this digest until it expires.",
      });
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Could not copy share link",
        message: getErrorMessage(error),
      });
    } finally {
      setIsCopyingShareLink(false);
    }
  };

  return (
    <>
      <div className={cn("inline-flex flex-col gap-1", className)}>
        <Button
          variant="secondary"
          size="sm"
          disabled={isButtonDisabled}
          prependIcon={
            status === "loading" ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />
          }
          onClick={openDigest}
        >
          {status === "not_configured" ? "Configure AI provider" : "Get Digest"}
        </Button>
        {providerHint ? <span className="text-11 text-tertiary">{providerHint}</span> : null}
      </div>

      <AISummaryModal
        errorMessage={errorMessage}
        isCopyingShareLink={isCopyingShareLink}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onCopyShareLink={handleCopyShareLink}
        shareUrl={shareUrl}
        status={status === "not_configured" ? "error" : status}
        summary={summary}
        title={digestTitle(entityType, entityTitle)}
      />
    </>
  );
};
