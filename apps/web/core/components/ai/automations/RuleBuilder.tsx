// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { useState } from "react";
import { Plus } from "lucide-react";
import {
  AUTOMATION_RULE_ACTIONS,
  AUTOMATION_RULE_TRIGGERS,
  EAutomationRuleAction,
  EAutomationRuleTrigger,
} from "@plane/constants";
import { Button } from "@plane/propel/button";
import { cn } from "@plane/utils";
import {
  buildRulePayload,
  getRuleValidationMessage,
  validateRulePayload,
  type TAutomationRuleAction,
  type TAutomationRulePayload,
} from "./automations.utils";

type TRuleBuilderProps = {
  className?: string | undefined;
  disabled?: boolean | undefined;
  onSubmit?: ((payload: TAutomationRulePayload) => void) | undefined;
};

export const RuleBuilder = ({ className, disabled = false, onSubmit }: TRuleBuilderProps) => {
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState<EAutomationRuleTrigger>(EAutomationRuleTrigger.ISSUE_CREATED);
  const [actions, setActions] = useState<TAutomationRuleAction[]>([]);
  const [pendingAction, setPendingAction] = useState<EAutomationRuleAction>(EAutomationRuleAction.ASSIGN);
  const [error, setError] = useState<string | null>(null);

  const addAction = () => {
    setActions((prev) => (prev.some((a) => a.type === pendingAction) ? prev : [...prev, { type: pendingAction }]));
  };

  const removeAction = (type: EAutomationRuleAction) => {
    setActions((prev) => prev.filter((a) => a.type !== type));
  };

  const handleSubmit = () => {
    if (disabled) return;
    const payload = buildRulePayload({ name, trigger, actions });
    const validationError = validateRulePayload(payload);
    if (validationError) {
      setError(getRuleValidationMessage(validationError));
      return;
    }
    setError(null);
    onSubmit?.(payload);
  };

  return (
    <div
      className={cn("flex flex-col gap-4 rounded-lg border border-subtle p-4", className)}
      data-testid="rule-builder"
    >
      <div className="flex flex-col gap-1">
        <label className="text-12 font-medium text-tertiary" htmlFor="rule-name">
          Rule name
        </label>
        <input
          id="rule-name"
          data-testid="rule-name-input"
          className="rounded-md border border-subtle bg-transparent px-2 py-1 text-13 text-primary outline-none"
          placeholder="Auto-assign new bugs"
          value={name}
          disabled={disabled}
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-12 font-medium text-tertiary" htmlFor="rule-trigger">
          When (trigger)
        </label>
        <select
          id="rule-trigger"
          data-testid="rule-trigger-select"
          className="rounded-md border border-subtle bg-transparent px-2 py-1 text-13 text-primary"
          value={trigger}
          disabled={disabled}
          onChange={(event) => setTrigger(event.target.value as EAutomationRuleTrigger)}
        >
          {AUTOMATION_RULE_TRIGGERS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.value}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-12 font-medium text-tertiary" htmlFor="rule-action">
          Then (actions)
        </label>
        <div className="flex items-center gap-2">
          <select
            id="rule-action"
            data-testid="rule-action-select"
            className="rounded-md border border-subtle bg-transparent px-2 py-1 text-13 text-primary"
            value={pendingAction}
            disabled={disabled}
            onChange={(event) => setPendingAction(event.target.value as EAutomationRuleAction)}
          >
            {AUTOMATION_RULE_ACTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.value}
              </option>
            ))}
          </select>
          <Button
            variant="secondary"
            size="sm"
            disabled={disabled}
            data-testid="rule-add-action"
            prependIcon={<Plus className="size-3.5" />}
            onClick={addAction}
          >
            Add action
          </Button>
        </div>
        <ul className="flex flex-wrap gap-2" data-testid="rule-actions-list">
          {actions.map((action) => (
            <li
              key={action.type}
              data-testid={`rule-action-chip-${action.type}`}
              className="inline-flex items-center gap-1 rounded-full bg-layer-1 px-2 py-0.5 text-11 text-secondary"
            >
              {action.type}
              <button type="button" onClick={() => removeAction(action.type)} aria-label={`Remove ${action.type}`}>
                ×
              </button>
            </li>
          ))}
        </ul>
      </div>

      {error ? (
        <span className="text-11 text-danger-primary" data-testid="rule-validation-error">
          {error}
        </span>
      ) : null}

      <div>
        <Button variant="primary" size="sm" disabled={disabled} data-testid="rule-submit" onClick={handleSubmit}>
          Save rule
        </Button>
      </div>
    </div>
  );
};
