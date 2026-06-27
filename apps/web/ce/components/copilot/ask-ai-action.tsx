// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { AlertCircle, ExternalLink, Loader2, Send, Sparkles } from "lucide-react";
// plane imports
import { cn } from "@plane/utils";
// services
import {
  AIService,
  type TCopilotQueryPayload,
  type TCopilotQueryResponse,
  type TCopilotQueryScope,
} from "@/services/ai.service";

type CopilotButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  prependIcon?: React.ReactNode;
  size?: "sm" | "md" | "lg" | string;
  variant?: "primary" | "secondary";
};

const CopilotButton = ({
  children,
  className,
  disabled,
  prependIcon,
  size,
  variant = "secondary",
  ...props
}: CopilotButtonProps) => (
  <button
    type="button"
    className={cn(
      "inline-flex items-center gap-1.5 rounded-md font-medium transition-colors",
      size === "sm" ? "text-sm px-3 py-1.5" : "text-base px-4 py-2",
      variant === "primary"
        ? "bg-custom-primary-100 hover:bg-custom-primary-200 text-white"
        : "border-custom-border-200 text-custom-text-200 hover:bg-custom-background-90 border",
      disabled && "cursor-not-allowed opacity-60",
      className
    )}
    disabled={disabled}
    {...props}
  >
    {prependIcon}
    {children}
  </button>
);

export type TAskAIActionOwner = {
  scope: Extract<TCopilotQueryScope, "epic" | "initiative" | "project" | "workspace">;
  workspaceSlug: string;
  objectId?: string;
  title?: string | undefined;
};

export type TAskAIStatus = "idle" | "loading" | "success" | "not_configured" | "unavailable" | "error";

export type TAskAIQueryService = {
  query: (workspaceSlug: string, data: TCopilotQueryPayload) => Promise<TCopilotQueryResponse>;
};

type TSubmitCopilotQuestionArgs = {
  owner: TAskAIActionOwner;
  question: string;
  service: TAskAIQueryService;
};

export type TSubmitCopilotQuestionResult =
  | {
      status: "success";
      result: TCopilotQueryResponse;
    }
  | {
      status: "not_configured" | "unavailable" | "error";
      message: string;
    };

type TAskAIActionProps = {
  className?: string | undefined;
  disabled?: boolean | undefined;
  initialQuestion?: string | undefined;
  initialResult?: TCopilotQueryResponse | null | undefined;
  initialStatus?: TAskAIStatus | undefined;
  isProviderConfigured?: boolean | undefined;
  owner: TAskAIActionOwner;
  service?: TAskAIQueryService | undefined;
};

const aiService = new AIService();

const defaultCopilotQueryService: TAskAIQueryService = {
  query: (workspaceSlug, data) => aiService.queryCopilot(workspaceSlug, data),
};

const defaultQuestion = (owner: TAskAIActionOwner) =>
  owner.scope === "workspace"
    ? `Summarize progress for this workspace${owner.title ? `: ${owner.title}` : ""}.`
    : owner.scope === "project"
      ? `Summarize progress for this project${owner.title ? `: ${owner.title}` : ""}.`
      : owner.scope === "initiative"
        ? `Summarize progress for this initiative${owner.title ? `: ${owner.title}` : ""}.`
        : `Summarize progress for this epic${owner.title ? `: ${owner.title}` : ""}.`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getNestedRecord = (value: unknown, key: string) => {
  if (!isRecord(value)) return undefined;
  const nested = value[key];
  return isRecord(nested) ? nested : undefined;
};

const getErrorCode = (error: unknown) => {
  const response = getNestedRecord(error, "response");
  const directData = getNestedRecord(error, "data");
  const responseData = getNestedRecord(response, "data");
  const errorRecord = isRecord(error) ? error : {};

  return (
    (responseData?.error as string | undefined) ??
    (directData?.error as string | undefined) ??
    (errorRecord.error as string | undefined)
  );
};

const getErrorStatus = (error: unknown) => {
  const response = getNestedRecord(error, "response");
  const errorRecord = isRecord(error) ? error : {};
  const directStatus = errorRecord.status;
  const responseStatus = response?.status;

  return typeof directStatus === "number"
    ? directStatus
    : typeof responseStatus === "number"
      ? responseStatus
      : undefined;
};

const toErrorMessage = (error: unknown) => {
  const errorRecord = isRecord(error) ? error : {};
  const message = errorRecord.message;
  return typeof message === "string" && message.trim() ? message : "AI request failed.";
};

const resolveCopilotError = (error: unknown): Exclude<TSubmitCopilotQuestionResult, { status: "success" }> => {
  const errorCode = getErrorCode(error);
  const errorStatus = getErrorStatus(error);

  if (errorStatus === 409 || errorCode === "ai_provider_not_configured") {
    return {
      status: "not_configured",
      message: "Configure AI provider to use scoped summaries.",
    };
  }

  if (errorStatus === 503 || errorCode === "ai_unavailable") {
    return {
      status: "unavailable",
      message: "AI unavailable. Manual viewing is still available.",
    };
  }

  return {
    status: "error",
    message: toErrorMessage(error),
  };
};

export const submitCopilotQuestion = async ({
  owner,
  question,
  service,
}: TSubmitCopilotQuestionArgs): Promise<TSubmitCopilotQuestionResult> => {
  const trimmedQuestion = question.trim();
  if (!trimmedQuestion) {
    return {
      status: "error",
      message: "Enter a question for AI.",
    };
  }

  try {
    const payload: TCopilotQueryPayload = {
      scope: owner.scope,
      question: trimmedQuestion,
    };
    if (owner.objectId) payload.object_id = owner.objectId;

    const result = await service.query(owner.workspaceSlug, payload);
    return { status: "success", result };
  } catch (error) {
    return resolveCopilotError(error);
  }
};

export const AskAIAction = ({
  className,
  disabled = false,
  initialQuestion,
  initialResult = null,
  initialStatus,
  isProviderConfigured,
  owner,
  service = defaultCopilotQueryService,
}: TAskAIActionProps) => {
  if (isProviderConfigured === false) return null;

  const [isOpen, setIsOpen] = useState(Boolean(initialResult || initialStatus));
  const [question, setQuestion] = useState(initialQuestion ?? defaultQuestion(owner));
  const [result, setResult] = useState<TCopilotQueryResponse | null>(initialResult);
  const [status, setStatus] = useState<TAskAIStatus>(
    isProviderConfigured === false ? "not_configured" : (initialStatus ?? (initialResult ? "success" : "idle"))
  );
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isProviderConfigured === false) {
      setStatus("not_configured");
      setMessage("Configure AI provider to use scoped summaries.");
    } else if (isProviderConfigured === true && status === "not_configured") {
      setStatus("idle");
      setMessage(null);
    }
  }, [isProviderConfigured, status]);

  const isSubmitDisabled = disabled || status === "loading" || status === "not_configured";
  const providerHint =
    message ?? (status === "not_configured" ? "Configure AI provider to use scoped summaries." : null);

  const submitQuestion = async (nextQuestion = question) => {
    if (isSubmitDisabled) return;

    setStatus("loading");
    setMessage(null);
    const submitResult = await submitCopilotQuestion({
      owner,
      question: nextQuestion,
      service,
    });

    if (submitResult.status === "success") {
      setResult(submitResult.result);
      setStatus("success");
      setMessage(null);
      setIsOpen(true);
      return;
    }

    setStatus(submitResult.status);
    setMessage(submitResult.message);
    setIsOpen(true);
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <CopilotButton
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled || status === "not_configured"}
          prependIcon={status === "loading" ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles />}
          onClick={() => setIsOpen((current) => !current)}
        >
          {status === "not_configured" ? "Configure AI provider" : "Ask AI"}
        </CopilotButton>
        <CopilotButton
          type="button"
          variant="secondary"
          size="sm"
          disabled={isSubmitDisabled}
          prependIcon={<Sparkles className="size-3.5" />}
          onClick={() => submitQuestion(defaultQuestion(owner))}
        >
          Summarize progress
        </CopilotButton>
        {providerHint && (
          <span className="flex min-w-0 items-center gap-1 text-12 text-tertiary">
            <AlertCircle className="size-3.5 flex-shrink-0" />
            <span className="truncate">{providerHint}</span>
          </span>
        )}
      </div>

      {isOpen && status !== "not_configured" && (
        <div className="space-y-3 rounded-md border border-subtle bg-layer-1 p-3">
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") submitQuestion();
            }}
            className="min-h-20 text-13"
            disabled={disabled || status === "loading"}
            placeholder={`Ask about this ${owner.scope}`}
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-11 text-tertiary">Scoped to this {owner.scope} and its readable status updates.</p>
            <CopilotButton
              type="button"
              variant="primary"
              size="sm"
              disabled={isSubmitDisabled}
              prependIcon={status === "loading" ? <Loader2 className="size-3.5 animate-spin" /> : <Send />}
              onClick={() => submitQuestion()}
            >
              Send
            </CopilotButton>
          </div>

          {status === "unavailable" && (
            <p className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 rounded border px-3 py-2 text-12">
              AI unavailable. Manual viewing is still available.
            </p>
          )}
          {status === "error" && message && (
            <p className="border-red-500/30 bg-red-500/10 text-red-500 rounded border px-3 py-2 text-12">{message}</p>
          )}

          {result && (
            <section className="space-y-3 border-t border-subtle pt-3">
              {result.summary && (
                <div className="space-y-1">
                  <h3 className="text-12 font-medium text-primary">Summary</h3>
                  <p className="text-13 leading-5 whitespace-pre-wrap text-secondary">{result.summary}</p>
                </div>
              )}
              {result.answer && (
                <div className="space-y-1">
                  <h3 className="text-12 font-medium text-primary">Answer</h3>
                  <p className="text-13 leading-5 whitespace-pre-wrap text-secondary">{result.answer}</p>
                </div>
              )}
              {result.evidence.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-11 font-medium text-tertiary uppercase">Evidence</h3>
                  <div className="space-y-2">
                    {result.evidence.map((item) => (
                      <a
                        key={`${item.entity_type}-${item.entity_id}`}
                        href={item.url}
                        className="block rounded border border-subtle px-3 py-2 text-12 hover:bg-layer-2"
                      >
                        <span className="flex items-center justify-between gap-2 font-medium text-primary">
                          <span className="truncate">{item.title || item.entity_type}</span>
                          <ExternalLink className="size-3 flex-shrink-0 text-tertiary" />
                        </span>
                        {item.source_text && (
                          <span className="mt-1 line-clamp-2 text-tertiary">{item.source_text}</span>
                        )}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
};
