/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
// plane imports
import { Button } from "@plane/propel/button";
import type { IState, IWorkflowTransition } from "@plane/types";
// local imports
import { buildWorkflowTransitionPayload } from "./workflow-builder.utils";

const ROLE_OPTIONS = [
  { label: "Admin", value: "20" },
  { label: "Member", value: "15" },
  { label: "Guest", value: "5" },
];

type Props = {
  allStates: IState[];
  disabled?: boolean;
  error: string | null;
  fromState: IState | null;
  onCancel: () => void;
  onDelete: (transitionId: string) => void;
  onSave: (payload: Partial<IWorkflowTransition>, transitionId?: string) => void;
  saving?: boolean;
  selectedIssueTypeId: string;
  transition: IWorkflowTransition | null;
};

export function WorkflowTransitionEditor(props: Props) {
  const {
    allStates,
    disabled = false,
    error,
    fromState,
    onCancel,
    onDelete,
    onSave,
    saving = false,
    selectedIssueTypeId,
    transition,
  } = props;
  const [toStateId, setToStateId] = useState("");
  const [allowedRoles, setAllowedRoles] = useState<string[]>([]);
  const [approvalRequired, setApprovalRequired] = useState(false);
  const [fallbackStateId, setFallbackStateId] = useState("");
  const [autoAssignMemberId, setAutoAssignMemberId] = useState("");
  const [autoAssignRole, setAutoAssignRole] = useState("");

  useEffect(() => {
    setToStateId(transition?.to_state ?? "");
    setAllowedRoles(transition?.allowed_roles.map((role) => String(role)) ?? []);
    setApprovalRequired(transition?.approval_required ?? false);
    setFallbackStateId(transition?.fallback_state ?? "");
    setAutoAssignMemberId(transition?.auto_assign_member ?? "");
    setAutoAssignRole(transition?.auto_assign_role ? String(transition.auto_assign_role) : "");
  }, [transition]);

  const toggleRole = (role: string) => {
    setAllowedRoles((current) => {
      if (current.includes(role)) return current.filter((item) => item !== role);
      return [...current, role];
    });
  };

  const handleSave = () => {
    if (!fromState || !toStateId) return;

    onSave(
      buildWorkflowTransitionPayload({
        fromStateId: fromState.id,
        toStateId,
        selectedIssueTypeId,
        allowedRoles,
        approvalRequired,
        fallbackStateId,
        autoAssignMemberId,
        autoAssignRole,
      }),
      transition?.id
    );
  };

  if (!fromState) {
    return (
      <aside className="rounded-md border border-dashed border-subtle p-4">
        <div className="text-body-sm-medium text-primary">Select a source state</div>
        <p className="mt-1 text-body-xs-regular text-tertiary">
          Pick a state from the workflow cards to add or edit an outgoing transition rule.
        </p>
      </aside>
    );
  }

  const targetStates = allStates.filter((state) => state.id !== fromState.id);

  return (
    <aside className="rounded-md border border-subtle bg-layer-1 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-body-sm-medium text-primary">{transition ? "Edit transition" : "Add transition"}</div>
          <p className="text-body-xs-regular text-tertiary">From {fromState.name}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>

      <div className="mt-4 space-y-4">
        <label className="block">
          <span className="text-caption-md-medium text-secondary">Target state</span>
          <select
            className="mt-1 h-8 w-full rounded-md border border-subtle bg-surface-1 px-2 text-body-xs-regular text-primary"
            value={toStateId}
            disabled={disabled || saving}
            onChange={(event) => setToStateId(event.target.value)}
          >
            <option value="">Select target</option>
            {targetStates.map((state) => (
              <option key={state.id} value={state.id}>
                {state.name}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="space-y-2">
          <legend className="text-caption-md-medium text-secondary">Allowed roles</legend>
          <div className="flex flex-wrap gap-2">
            {ROLE_OPTIONS.map((role) => (
              <label key={role.value} className="flex items-center gap-1 text-body-xs-regular text-secondary">
                <input
                  type="checkbox"
                  checked={allowedRoles.includes(role.value)}
                  disabled={disabled || saving}
                  onChange={() => toggleRole(role.value)}
                />
                {role.label}
              </label>
            ))}
          </div>
          <p className="text-caption-sm-regular text-tertiary">
            Leave all roles unchecked to allow any project member.
          </p>
        </fieldset>

        <label className="flex items-center gap-2 text-body-xs-regular text-secondary">
          <input
            type="checkbox"
            checked={approvalRequired}
            disabled={disabled || saving}
            onChange={(event) => setApprovalRequired(event.target.checked)}
          />
          Require approval before moving
        </label>

        <label className="block">
          <span className="text-caption-md-medium text-secondary">Fallback state</span>
          <select
            className="mt-1 h-8 w-full rounded-md border border-subtle bg-surface-1 px-2 text-body-xs-regular text-primary"
            value={fallbackStateId}
            disabled={disabled || saving}
            onChange={(event) => setFallbackStateId(event.target.value)}
          >
            <option value="">No fallback</option>
            {targetStates.map((state) => (
              <option key={state.id} value={state.id}>
                {state.name}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="text-caption-md-medium text-secondary">Auto-assign member ID</span>
            <input
              className="mt-1 h-8 w-full rounded-md border border-subtle bg-surface-1 px-2 text-body-xs-regular text-primary"
              value={autoAssignMemberId}
              disabled={disabled || saving}
              onChange={(event) => setAutoAssignMemberId(event.target.value)}
              placeholder="Optional"
            />
          </label>
          <label className="block">
            <span className="text-caption-md-medium text-secondary">Auto-assign role</span>
            <select
              className="mt-1 h-8 w-full rounded-md border border-subtle bg-surface-1 px-2 text-body-xs-regular text-primary"
              value={autoAssignRole}
              disabled={disabled || saving}
              onChange={(event) => setAutoAssignRole(event.target.value)}
            >
              <option value="">No role</option>
              {ROLE_OPTIONS.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error && (
          <div className="rounded-md bg-danger-subtle p-2 text-body-xs-regular text-danger-primary">{error}</div>
        )}

        <div className="flex items-center justify-between gap-3">
          <div>
            {transition && (
              <Button
                variant="error-outline"
                size="sm"
                disabled={disabled || saving}
                onClick={() => onDelete(transition.id)}
              >
                Delete
              </Button>
            )}
          </div>
          <Button variant="primary" size="sm" loading={saving} disabled={disabled || !toStateId} onClick={handleSave}>
            Save rule
          </Button>
        </div>
      </div>
    </aside>
  );
}
