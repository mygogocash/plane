/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { Bot, FileText, type LucideIcon, Sparkles, Wand2 } from "lucide-react";
// plane imports
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { cn } from "@plane/utils";
// plane web
import { isSelfHostedFeatureEnabled } from "@/plane-web/lib/self-host-entitlements";
// services
import {
  AIService,
  type TAgentRun,
  type TCopilotDescribeAction,
  type TCopilotDescribeResponse,
  type TCopilotSummaryResponse,
} from "@/services/ai.service";

const aiService = new AIService();

export type TAIWorkItemActionsService = {
  describeWorkItem: (
    workspaceSlug: string,
    action: TCopilotDescribeAction,
    message: string
  ) => Promise<TCopilotDescribeResponse>;
  summarizeIssue: (
    workspaceSlug: string,
    message: string,
    projectId: string,
    issueId: string
  ) => Promise<TCopilotSummaryResponse>;
  requestAgentRun: (workspaceSlug: string, projectId: string, issueId: string, agentKey: string) => Promise<TAgentRun>;
};

const defaultService: TAIWorkItemActionsService = {
  describeWorkItem: (workspaceSlug, action, message) => aiService.describeWorkItem(workspaceSlug, action, message),
  summarizeIssue: (workspaceSlug, message, projectId, issueId) =>
    aiService.summarizeIssue(workspaceSlug, message, projectId, issueId),
  requestAgentRun: (workspaceSlug, projectId, issueId, agentKey) =>
    aiService.requestAgentRun(workspaceSlug, projectId, issueId, agentKey),
};

const SUMMARY_PROMPT = "Summarize this work item.";

const getAIErrorMessage = (error: unknown): string => {
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    const data = record.data;
    if (typeof data === "object" && data !== null) {
      const dataRecord = data as Record<string, unknown>;
      const message = dataRecord.message ?? dataRecord.error;
      if (typeof message === "string") return message;
    }
    if (typeof record.message === "string") return record.message;
  }
  return "AI is temporarily unavailable.";
};

// --- Pure action helpers (fail soft: never throw, surface a message instead) ---

export type TDescribeActionResult = { status: "success"; text: string } | { status: "error"; message: string };

export const runDescribeAction = async (
  service: Pick<TAIWorkItemActionsService, "describeWorkItem">,
  workspaceSlug: string,
  action: TCopilotDescribeAction,
  description: string
): Promise<TDescribeActionResult> => {
  try {
    const result = await service.describeWorkItem(workspaceSlug, action, description);
    return { status: "success", text: result.text };
  } catch (error) {
    return { status: "error", message: getAIErrorMessage(error) };
  }
};

export type TSummaryActionResult = { status: "success"; summary: string } | { status: "error"; message: string };

export const runSummaryAction = async (
  service: Pick<TAIWorkItemActionsService, "summarizeIssue">,
  workspaceSlug: string,
  projectId: string,
  issueId: string
): Promise<TSummaryActionResult> => {
  try {
    const result = await service.summarizeIssue(workspaceSlug, SUMMARY_PROMPT, projectId, issueId);
    return { status: "success", summary: result.summary };
  } catch (error) {
    return { status: "error", message: getAIErrorMessage(error) };
  }
};

export type TAgentRunActionResult = { status: "success"; run: TAgentRun } | { status: "error"; message: string };

export const runAgentRunAction = async (
  service: Pick<TAIWorkItemActionsService, "requestAgentRun">,
  workspaceSlug: string,
  projectId: string,
  issueId: string,
  agentKey = "summarize_issue"
): Promise<TAgentRunActionResult> => {
  try {
    const run = await service.requestAgentRun(workspaceSlug, projectId, issueId, agentKey);
    return { status: "success", run };
  } catch (error) {
    return { status: "error", message: getAIErrorMessage(error) };
  }
};

type TAIWorkItemActionsProps = {
  workspaceSlug: string;
  projectId?: string | undefined;
  issueId?: string | undefined;
  isProviderConfigured?: boolean | undefined;
  /** Test/host override for the `ai_copilot` entitlement; defaults to the real flag. */
  featureEnabled?: boolean | undefined;
  className?: string | undefined;
  getDescription?: (() => string) | undefined;
  service?: TAIWorkItemActionsService | undefined;
  onApplyText?: ((text: string) => void) | undefined;
  onSummary?: ((summary: string) => void) | undefined;
};

const DESCRIBE_ACTIONS: { action: TCopilotDescribeAction; label: string; icon: LucideIcon }[] = [
  { action: "draft", label: "Draft", icon: FileText },
  { action: "simplify", label: "Simplify", icon: Wand2 },
  { action: "rewrite", label: "Rewrite", icon: Sparkles },
];

/**
 * AI work-item action bar — Draft/Simplify/Rewrite the description, generate a summary, and
 * request an agent run. Renders nothing (not a disabled state) unless the `ai_copilot`
 * entitlement is on AND the instance has a configured AI provider, so an unconfigured
 * instance never shows a broken paid-feature affordance. Describe output is handed to
 * `onApplyText` for the host to insert non-destructively; nothing is auto-saved here.
 */
export const AIWorkItemActions = (props: TAIWorkItemActionsProps) => {
  const {
    workspaceSlug,
    projectId,
    issueId,
    isProviderConfigured,
    featureEnabled,
    className,
    getDescription,
    service = defaultService,
    onApplyText,
    onSummary,
  } = props;

  const [pending, setPending] = useState<string | null>(null);

  const aiEnabled = (featureEnabled ?? isSelfHostedFeatureEnabled("ai_copilot")) && isProviderConfigured === true;
  if (!aiEnabled) return null;

  const handleDescribe = async (action: TCopilotDescribeAction) => {
    setPending(action);
    const result = await runDescribeAction(service, workspaceSlug, action, getDescription?.() ?? "");
    setPending(null);
    if (result.status === "success") onApplyText?.(result.text);
    else setToast({ type: TOAST_TYPE.ERROR, title: "AI unavailable", message: result.message });
  };

  const handleSummary = async () => {
    if (!projectId || !issueId) return;
    setPending("summary");
    const result = await runSummaryAction(service, workspaceSlug, projectId, issueId);
    setPending(null);
    if (result.status === "success") {
      onSummary?.(result.summary);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Work item summary",
        message: result.summary || "No recent activity to summarize.",
      });
    } else setToast({ type: TOAST_TYPE.ERROR, title: "AI unavailable", message: result.message });
  };

  const handleAgentRun = async () => {
    if (!projectId || !issueId) return;
    setPending("agent");
    const result = await runAgentRunAction(service, workspaceSlug, projectId, issueId);
    setPending(null);
    if (result.status === "success")
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Agent run queued",
        message: "The agent run was recorded for review.",
      });
    else setToast({ type: TOAST_TYPE.ERROR, title: "AI unavailable", message: result.message });
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)} aria-label="AI work item actions">
      {DESCRIBE_ACTIONS.map(({ action, label, icon: Icon }) => (
        <Button
          key={action}
          type="button"
          variant="secondary"
          size="sm"
          prependIcon={<Icon className="size-3.5" />}
          loading={pending === action}
          onClick={() => handleDescribe(action)}
        >
          {label}
        </Button>
      ))}
      {projectId && issueId && (
        <>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            prependIcon={<Sparkles className="size-3.5" />}
            loading={pending === "summary"}
            onClick={handleSummary}
          >
            Generate summary
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            prependIcon={<Bot className="size-3.5" />}
            loading={pending === "agent"}
            onClick={handleAgentRun}
          >
            Run agent
          </Button>
        </>
      )}
    </div>
  );
};
