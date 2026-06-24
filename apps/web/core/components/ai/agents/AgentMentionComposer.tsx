// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { Bot, CornerDownLeft } from "lucide-react";
import { cn } from "@plane/utils";
import { getAgentMentionHint, parseAgentMention, type TAutomationAgent } from "./agents.utils";

type TAgentMentionComposerProps = {
  agents: TAutomationAgent[];
  className?: string | undefined;
  featureEnabled: boolean;
  isProviderConfigured?: boolean | undefined;
  /** Current composer text. Mention detection runs against this value. */
  value: string;
  onChange?: ((value: string) => void) | undefined;
  onRun?: ((agent: TAutomationAgent) => void) | undefined;
};

/**
 * `@mention` UI for invoking an automation agent from a comment/issue composer.
 * It detects a matched `@AgentName` in the current text and surfaces a Run
 * affordance. It never auto-runs — the user must explicitly trigger the agent
 * (non-autonomous by default).
 *
 * Visibility is gated by the feature flag only; a missing provider keeps the
 * composer visible but disables Run, so the mention affordance is discoverable
 * without ever guessing or silently no-opping.
 */
export const AgentMentionComposer = ({
  agents,
  className,
  featureEnabled,
  isProviderConfigured,
  value,
  onChange,
  onRun,
}: TAgentMentionComposerProps) => {
  if (!featureEnabled) return null;

  const matched = parseAgentMention(value, agents);
  const hint = getAgentMentionHint(matched);
  const canRun = Boolean(matched) && isProviderConfigured !== false;

  return (
    <div className={cn("flex flex-col gap-1.5", className)} data-testid="agent-mention-composer">
      <div className="flex items-center gap-2 rounded-md border border-subtle bg-layer-1 px-2 py-1.5">
        <Bot className="size-3.5 shrink-0 text-accent-primary" />
        <textarea
          data-testid="agent-mention-input"
          className="min-h-7 w-full resize-none bg-transparent text-12 text-primary outline-none placeholder:text-placeholder"
          placeholder="Mention an agent with @AgentName…"
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
        />
        <button
          type="button"
          disabled={!canRun}
          data-testid="agent-mention-run"
          className={cn("inline-flex items-center gap-1 rounded-md px-2 py-1 text-11", {
            "bg-accent-primary text-white hover:opacity-90": canRun,
            "cursor-not-allowed bg-layer-2 text-tertiary": !canRun,
          })}
          onClick={() => matched && onRun?.(matched)}
        >
          <CornerDownLeft className="size-3" />
          Run
        </button>
      </div>
      {hint ? (
        <span className="px-1 text-10 text-tertiary" data-testid="agent-mention-hint">
          {hint}
        </span>
      ) : null}
    </div>
  );
};
