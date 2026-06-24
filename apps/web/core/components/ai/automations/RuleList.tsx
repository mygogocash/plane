// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { cn } from "@plane/utils";
import type { TAutomationRule } from "./automations.utils";

type TRuleListProps = {
  className?: string | undefined;
  rules: TAutomationRule[];
};

export const RuleList = ({ className, rules }: TRuleListProps) => (
  <div className={cn("flex flex-col gap-2", className)} data-testid="rule-list">
    {rules.length === 0 ? (
      <span className="text-12 text-placeholder" data-testid="rule-list-empty">
        No automation rules yet.
      </span>
    ) : (
      rules.map((rule) => (
        <div
          key={rule.id}
          data-testid={`rule-row-${rule.id}`}
          className="flex items-center justify-between rounded-md border border-subtle px-3 py-2"
        >
          <div className="flex flex-col">
            <span className="text-13 font-medium text-primary">{rule.name}</span>
            <span className="text-11 text-tertiary">
              {rule.trigger} → {rule.actions.map((action) => action.type).join(", ")}
            </span>
          </div>
          <span
            className={cn("rounded-full px-2 py-0.5 text-11", {
              "bg-success-component-surface-dark text-success-primary": rule.is_active,
              "bg-layer-2 text-tertiary": !rule.is_active,
            })}
          >
            {rule.is_active ? "Active" : "Paused"}
          </span>
        </div>
      ))
    )}
  </div>
);
