// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { ExternalLink, TerminalSquare } from "lucide-react";
import { cn } from "@plane/utils";

type TMcpConnectorCardProps = {
  className?: string | undefined;
  docsHref?: string | undefined;
};

export const McpConnectorCard = ({
  className,
  docsHref = "https://github.com/mygogocash/plane/blob/preview/apps/mcp/README.md",
}: TMcpConnectorCardProps) => (
  <div
    className={cn("flex flex-col gap-2 rounded-lg border border-subtle p-4", className)}
    data-testid="mcp-connector-card"
  >
    <div className="flex items-center gap-2">
      <TerminalSquare className="size-4 text-accent-primary" />
      <span className="text-13 font-semibold text-primary">Build your own</span>
    </div>
    <p className="text-12 text-secondary">
      Connect AI agents to Plane through the standalone MCP server. Each tool call uses a personal API token and can
      never exceed the token holder&apos;s role. No secrets are stored here.
    </p>
    <a
      href={docsHref}
      target="_blank"
      rel="noreferrer"
      data-testid="mcp-docs-link"
      className="inline-flex items-center gap-1 text-12 font-medium text-accent-primary hover:underline"
    >
      MCP server setup
      <ExternalLink className="size-3.5" />
    </a>
  </div>
);
