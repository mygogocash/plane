// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { Bot, Loader2 } from "lucide-react";
import { cn } from "@plane/utils";
import type { TAgentMention } from "./agents.utils";

type TAgentResponseThreadProps = {
  className?: string | undefined;
  mention: TAgentMention;
};

export const AgentResponseThread = ({ className, mention }: TAgentResponseThreadProps) => (
  <div
    className={cn("flex flex-col gap-1 rounded-md border border-subtle bg-layer-1 p-3", className)}
    data-testid={`agent-response-${mention.id}`}
  >
    <div className="flex items-center gap-1.5">
      <Bot className="size-3.5 text-accent-primary" />
      <span className="text-12 font-medium text-primary">{mention.agent_name ?? "Agent"}</span>
      <span className="text-10 text-tertiary">{mention.status}</span>
    </div>
    {mention.status === "pending" ? (
      <span className="inline-flex items-center gap-1 text-12 text-tertiary">
        <Loader2 className="size-3.5 animate-spin" />
        Running…
      </span>
    ) : mention.response ? (
      <p className="text-12 text-secondary" data-testid={`agent-response-body-${mention.id}`}>
        {mention.response}
      </p>
    ) : (
      <span className="text-12 text-tertiary">No response.</span>
    )}
  </div>
);
