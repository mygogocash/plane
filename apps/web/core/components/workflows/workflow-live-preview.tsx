/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { Badge } from "@plane/propel/badge";
import type { IState, IWorkflowTransition } from "@plane/types";

type Props = {
  statesById: Record<string, IState>;
  transitions: IWorkflowTransition[];
};

export function WorkflowLivePreview(props: Props) {
  const { statesById, transitions } = props;

  const getStateName = (stateId: string | null | undefined) => (stateId ? statesById[stateId]?.name || stateId : "-");

  return (
    <div className="rounded-md border border-subtle bg-layer-1 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-body-sm-medium text-primary">Live preview</div>
          <p className="text-body-xs-regular text-tertiary">Read-only view of the selected workflow rules.</p>
        </div>
        <Badge variant="neutral">{transitions.length} rules</Badge>
      </div>
      <div className="mt-4 space-y-2">
        {transitions.length === 0 && (
          <div className="rounded-md border border-dashed border-subtle p-3 text-body-xs-regular text-tertiary">
            No rules in this rule set.
          </div>
        )}
        {transitions.map((transition) => (
          <div
            key={transition.id}
            className="flex flex-wrap items-center gap-2 rounded-md border border-subtle bg-surface-1 px-3 py-2 text-body-xs-regular"
          >
            <span className="text-primary">{getStateName(transition.from_state)}</span>
            <span className="text-tertiary">to</span>
            <span className="text-primary">{getStateName(transition.to_state)}</span>
            {transition.approval_required && <Badge variant="warning">Approval</Badge>}
            {transition.auto_assign_role && <Badge variant="brand">Auto role {transition.auto_assign_role}</Badge>}
          </div>
        ))}
      </div>
    </div>
  );
}
