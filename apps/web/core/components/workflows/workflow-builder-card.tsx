/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { Button } from "@plane/propel/button";
import type { IState, IWorkflowTransition } from "@plane/types";
import { cn } from "@plane/utils";

type Props = {
  getStateName: (stateId: string) => string;
  groupLabel: string;
  onEditTransition: (transitionId: string) => void;
  onSelectFromState: (stateId: string) => void;
  selectedFromStateId: string | null;
  states: IState[];
  transitionsByFromState: Record<string, IWorkflowTransition[]>;
};

export function WorkflowBuilderCard(props: Props) {
  const {
    getStateName,
    groupLabel,
    onEditTransition,
    onSelectFromState,
    selectedFromStateId,
    states,
    transitionsByFromState,
  } = props;

  return (
    <section className="rounded-md border border-subtle bg-layer-1">
      <div className="border-b border-subtle px-4 py-3">
        <div className="text-body-sm-medium text-primary">{groupLabel}</div>
        <p className="text-body-xs-regular text-tertiary">{states.length} states</p>
      </div>
      <div className="divide-y divide-subtle">
        {states.length === 0 && (
          <div className="px-4 py-3 text-body-xs-regular text-tertiary">No states in this group.</div>
        )}
        {states.map((state) => {
          const transitions = transitionsByFromState[state.id] ?? [];

          return (
            <div key={state.id} className="space-y-3 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: state.color }} />
                  <span className="truncate text-body-xs-medium text-primary">{state.name}</span>
                </div>
                <Button
                  variant={selectedFromStateId === state.id ? "primary" : "secondary"}
                  size="sm"
                  onClick={() => onSelectFromState(state.id)}
                >
                  Add rule
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {transitions.length === 0 && (
                  <span className="text-caption-md-regular text-tertiary">No outgoing rules</span>
                )}
                {transitions.map((transition) => (
                  <button
                    key={transition.id}
                    type="button"
                    className={cn(
                      "rounded-sm border border-subtle bg-surface-1 px-2 py-1 text-caption-md-medium text-secondary hover:bg-layer-2",
                      transition.approval_required && "border-warning-subtle bg-warning-subtle/30"
                    )}
                    onClick={() => onEditTransition(transition.id)}
                  >
                    {getStateName(transition.to_state)}
                    {transition.approval_required ? " + approval" : ""}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
