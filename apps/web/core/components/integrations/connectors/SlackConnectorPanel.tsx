// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { cn } from "@plane/utils";
import { formatSlackSchedule, type TSlackChannelBinding } from "./connectors.utils";

type TSlackConnectorPanelProps = {
  bindings: TSlackChannelBinding[];
  className?: string | undefined;
};

export const SlackConnectorPanel = ({ bindings, className }: TSlackConnectorPanelProps) => (
  <div
    className={cn("flex flex-col gap-3 rounded-lg border border-subtle p-4", className)}
    data-testid="slack-connector-panel"
  >
    <div className="flex flex-col gap-1">
      <span className="text-13 font-semibold text-primary">Slack</span>
      <span className="text-11 text-tertiary">
        Bind channels: inbound messages create intake issues; outbound channels post summaries or alerts.
      </span>
    </div>

    {bindings.length === 0 ? (
      <span className="text-12 text-placeholder">No channel bindings yet.</span>
    ) : (
      <table className="w-full text-left text-12">
        <thead>
          <tr className="text-tertiary">
            <th className="py-1 pr-2 font-medium">Channel</th>
            <th className="py-1 pr-2 font-medium">Direction</th>
            <th className="py-1 pr-2 font-medium">Kind</th>
            <th className="py-1 font-medium">Schedule</th>
          </tr>
        </thead>
        <tbody>
          {bindings.map((binding) => (
            <tr key={binding.id} data-testid={`slack-binding-${binding.id}`} className="border-t border-subtle">
              <td className="py-1 pr-2 text-secondary">{binding.channel_id}</td>
              <td className="py-1 pr-2 text-secondary">{binding.direction}</td>
              <td className="py-1 pr-2 text-secondary">{binding.kind}</td>
              <td className="py-1 text-tertiary" data-testid={`slack-binding-schedule-${binding.id}`}>
                {formatSlackSchedule(binding)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </div>
);
