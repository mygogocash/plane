// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { cn } from "@plane/utils";
import { formatRunStatusLabel, type TAutomationRun } from "./automations.utils";

type TRunHistoryTableProps = {
  className?: string | undefined;
  runs: TAutomationRun[];
};

export const RunHistoryTable = ({ className, runs }: TRunHistoryTableProps) => (
  <div className={cn("flex flex-col gap-2", className)} data-testid="run-history-table">
    <span className="text-12 font-semibold text-tertiary">Run history</span>
    {runs.length === 0 ? (
      <span className="text-12 text-placeholder" data-testid="run-history-empty">
        No runs recorded yet.
      </span>
    ) : (
      <table className="w-full text-left text-12">
        <thead>
          <tr className="text-tertiary">
            <th className="py-1 pr-2 font-medium">Rule</th>
            <th className="py-1 pr-2 font-medium">Event</th>
            <th className="py-1 pr-2 font-medium">Status</th>
            <th className="py-1 font-medium">When</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id} data-testid={`run-row-${run.id}`} className="border-t border-subtle">
              <td className="py-1 pr-2 text-secondary">{run.rule_name ?? run.rule}</td>
              <td className="py-1 pr-2 text-secondary">{run.triggered_by_event}</td>
              <td className="py-1 pr-2">
                <span
                  data-testid={`run-status-${run.id}`}
                  className={cn("rounded-full px-2 py-0.5 text-11", {
                    "bg-success-component-surface-dark text-success-primary": run.status === "success",
                    "bg-warning-component-surface-dark text-warning-primary": run.status === "partial",
                    "bg-danger-component-surface-dark text-danger-primary": run.status === "failed",
                  })}
                >
                  {formatRunStatusLabel(run.status)}
                </span>
              </td>
              <td className="py-1 text-tertiary">{run.created_at}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </div>
);
