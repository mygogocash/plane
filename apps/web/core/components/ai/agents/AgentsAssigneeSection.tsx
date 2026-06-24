// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { cn } from "@plane/utils";
import { isAgentsSectionVisible, type TAutomationAgent } from "./agents.utils";
import { AgentChip } from "./AgentChip";

type TAgentsAssigneeSectionProps = {
  agents: TAutomationAgent[];
  className?: string | undefined;
  featureEnabled: boolean;
  isProviderConfigured?: boolean | undefined;
  onSelectAgent?: ((agent: TAutomationAgent) => void) | undefined;
};

export const AgentsAssigneeSection = ({
  agents,
  className,
  featureEnabled,
  isProviderConfigured,
  onSelectAgent,
}: TAgentsAssigneeSectionProps) => {
  if (!isAgentsSectionVisible({ featureEnabled, isProviderConfigured })) return null;

  return (
    <div
      className={cn("flex flex-col gap-1 border-t border-subtle pt-2", className)}
      data-testid="agents-assignee-section"
    >
      <span className="px-2 text-10 font-semibold tracking-wide text-tertiary uppercase">Agents</span>
      {agents.length === 0 ? (
        <span className="px-2 py-1 text-11 text-placeholder">No agents configured.</span>
      ) : (
        agents.map((agent) => <AgentChip key={agent.id} agent={agent} onSelect={onSelectAgent} />)
      )}
    </div>
  );
};
