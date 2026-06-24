// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { cn } from "@plane/utils";
import {
  CONNECTOR_CATALOG,
  isConnectorsTabVisible,
  type TSentryConfig,
  type TSlackChannelBinding,
} from "./connectors.utils";
import { McpConnectorCard } from "./McpConnectorCard";
import { SentryConnectorPanel } from "./SentryConnectorPanel";
import { SlackConnectorPanel } from "./SlackConnectorPanel";

type TConnectorsListProps = {
  className?: string | undefined;
  integrationsEnabled: boolean;
  sentryConfig?: TSentryConfig | null | undefined;
  slackBindings?: TSlackChannelBinding[] | undefined;
};

export const ConnectorsList = ({
  className,
  integrationsEnabled,
  sentryConfig,
  slackBindings = [],
}: TConnectorsListProps) => {
  if (!isConnectorsTabVisible(integrationsEnabled)) return null;

  return (
    <div className={cn("flex flex-col gap-6", className)} data-testid="connectors-list">
      <ul className="flex flex-col gap-2" data-testid="connectors-catalog">
        {CONNECTOR_CATALOG.map((connector) => (
          <li
            key={connector.key}
            data-testid={`connector-catalog-${connector.key}`}
            className="flex flex-col rounded-md border border-subtle px-3 py-2"
          >
            <span className="text-13 font-medium text-primary">{connector.name}</span>
            <span className="text-11 text-tertiary">{connector.description}</span>
          </li>
        ))}
      </ul>

      <SlackConnectorPanel bindings={slackBindings} />
      <SentryConnectorPanel config={sentryConfig} />
      <McpConnectorCard />
    </div>
  );
};
