// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { Bot } from "lucide-react";
import { cn } from "@plane/utils";
import { getAgentScopeBadgeLabel, isReadOnlyAgent, type TAutomationAgent } from "./agents.utils";

type TAgentChipProps = {
  agent: TAutomationAgent;
  className?: string | undefined;
  onSelect?: ((agent: TAutomationAgent) => void) | undefined;
};

export const AgentChip = ({ agent, className, onSelect }: TAgentChipProps) => {
  const readOnly = isReadOnlyAgent(agent);

  return (
    <button
      type="button"
      data-testid={`agent-chip-${agent.id}`}
      className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-12 hover:bg-layer-1", className)}
      onClick={() => onSelect?.(agent)}
    >
      <Bot className="size-3.5 text-accent-primary" />
      <span className="font-medium text-primary">{agent.name}</span>
      <span
        data-testid={`agent-scope-badge-${agent.id}`}
        className={cn("rounded-full px-1.5 py-0.5 text-10", {
          "bg-layer-2 text-tertiary": readOnly,
          "bg-accent-component-surface-dark text-accent-primary": !readOnly,
        })}
      >
        {getAgentScopeBadgeLabel(agent.scope)}
      </span>
    </button>
  );
};
