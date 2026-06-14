/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useContext, useMemo, useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
// plane imports
import { STATE_GROUPS } from "@plane/constants";
import { Button } from "@plane/propel/button";
import type { IState, IWorkflowTransition, TStateGroups, TWorkflowStatus } from "@plane/types";
// hooks
import { useProjectState } from "@/hooks/store/use-project-state";
// store
import { StoreContext } from "@/lib/store-context";
// plane-web
import { isSelfHostedFeatureEnabled } from "@/plane-web/lib/self-host-entitlements";
// local imports
import { WorkflowBuilderCard } from "./workflow-builder-card";
import {
  DEFAULT_WORKFLOW_ISSUE_TYPE_ID,
  getWorkflowBuilderMode,
  getWorkflowIssueTypeOptions,
  getWorkflowTransitionsForIssueType,
  groupWorkflowTransitionsByFromState,
} from "./workflow-builder.utils";
import { WorkflowEmptyState } from "./workflow-empty-state";
import { WorkflowLifecycleToggle } from "./workflow-lifecycle-toggle";
import { WorkflowLivePreview } from "./workflow-live-preview";
import { WorkflowTransitionEditor } from "./workflow-transition-editor";

type Props = {
  isEditable: boolean;
  projectId: string;
  workspaceSlug: string;
};

const getWorkflowErrorMessage = (error: unknown): string => {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "detail" in error && typeof error.detail === "string") return error.detail;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string")
    return error.message;
  return "Workflow could not be updated. Please try again.";
};

export const WorkflowBuilder = observer(function WorkflowBuilder(props: Props) {
  const { isEditable, projectId, workspaceSlug } = props;
  const store = useContext(StoreContext);
  if (store === undefined) throw new Error("WorkflowBuilder must be used within StoreProvider");

  const { fetchProjectStates, getProjectStates } = useProjectState();
  const [selectedIssueTypeId, setSelectedIssueTypeId] = useState(DEFAULT_WORKFLOW_ISSUE_TYPE_ID);
  const [customIssueTypeId, setCustomIssueTypeId] = useState("");
  const [selectedFromStateId, setSelectedFromStateId] = useState<string | null>(null);
  const [editingTransitionId, setEditingTransitionId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const featureEnabled = isSelfHostedFeatureEnabled("workflows_approvals");

  useSWR(
    workspaceSlug && projectId ? `WORKFLOW_BUILDER_STATES_${workspaceSlug}_${projectId}` : null,
    workspaceSlug && projectId ? () => fetchProjectStates(workspaceSlug, projectId) : null,
    { revalidateIfStale: false, revalidateOnFocus: false }
  );

  useSWR(
    featureEnabled && workspaceSlug && projectId ? `WORKFLOW_BUILDER_RULES_${workspaceSlug}_${projectId}` : null,
    featureEnabled && workspaceSlug && projectId
      ? async () => {
          const [transitions, status] = await Promise.all([
            store.workflow.fetchTransitions(workspaceSlug, projectId),
            store.workflow.fetchConfig(workspaceSlug, projectId),
          ]);
          return { transitions, status };
        }
      : null,
    { revalidateIfStale: false, revalidateOnFocus: false }
  );

  const transitions = store.workflow.getTransitionsByProject(projectId);
  const workflowStatus = store.workflow.getWorkflowStatus(projectId) ?? "disabled";
  const projectStates = getProjectStates(projectId) ?? [];
  const selectedTransitions = getWorkflowTransitionsForIssueType(transitions, selectedIssueTypeId);
  const mode = getWorkflowBuilderMode({
    featureEnabled,
    workflowStatus,
    transitions,
  });

  const statesById = projectStates.reduce<Record<string, IState>>((acc, state) => {
    acc[state.id] = state;
    return acc;
  }, {});

  const groupedStates = (Object.keys(STATE_GROUPS) as TStateGroups[]).reduce<Record<TStateGroups, IState[]>>(
    (acc, group) => {
      acc[group] = projectStates.filter((state) => state.group === group);
      return acc;
    },
    {
      backlog: [],
      unstarted: [],
      started: [],
      completed: [],
      cancelled: [],
    }
  );

  const issueTypeOptions = useMemo(
    () => getWorkflowIssueTypeOptions(transitions, selectedIssueTypeId),
    [selectedIssueTypeId, transitions]
  );

  const transitionsByFromState = useMemo(
    () => groupWorkflowTransitionsByFromState(selectedTransitions),
    [selectedTransitions]
  );

  const selectedFromState = selectedFromStateId ? statesById[selectedFromStateId] : null;
  const selectedTransition = editingTransitionId
    ? selectedTransitions.find((transition) => transition.id === editingTransitionId) || null
    : null;

  const getStateName = (stateId: string) => statesById[stateId]?.name || stateId;

  const handleStatusChange = async (status: TWorkflowStatus) => {
    setSaving(true);
    setError(null);
    try {
      await store.workflow.setWorkflowStatus(workspaceSlug, projectId, status);
    } catch (statusError) {
      setError(getWorkflowErrorMessage(statusError));
    } finally {
      setSaving(false);
    }
  };

  const handleSelectFromState = (stateId: string) => {
    setSelectedFromStateId(stateId);
    setEditingTransitionId(null);
    setError(null);
  };

  const handleEditTransition = (transitionId: string) => {
    const transition = selectedTransitions.find((item) => item.id === transitionId);
    if (!transition) return;
    setSelectedFromStateId(transition.from_state);
    setEditingTransitionId(transition.id);
    setError(null);
  };

  const handleSaveTransition = async (payload: Partial<IWorkflowTransition>, transitionId?: string) => {
    setSaving(true);
    setError(null);
    try {
      const response = transitionId
        ? await store.workflow.updateTransition(workspaceSlug, projectId, transitionId, payload)
        : await store.workflow.createTransition(workspaceSlug, projectId, payload);
      setSelectedFromStateId(response.from_state);
      setEditingTransitionId(response.id);
    } catch (transitionError) {
      setError(getWorkflowErrorMessage(transitionError));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTransition = async (transitionId: string) => {
    setSaving(true);
    setError(null);
    try {
      await store.workflow.deleteTransition(workspaceSlug, projectId, transitionId);
      setEditingTransitionId(null);
    } catch (deleteError) {
      setError(getWorkflowErrorMessage(deleteError));
    } finally {
      setSaving(false);
    }
  };

  const handleCustomIssueType = () => {
    const normalized = customIssueTypeId.trim();
    if (!normalized) return;
    setSelectedIssueTypeId(normalized);
    setCustomIssueTypeId("");
    setEditingTransitionId(null);
    setError(null);
  };

  if (mode.kind === "disabled") {
    return (
      <WorkflowEmptyState
        title="Workflows are disabled"
        description="The workflows and approvals entitlement is off, so this project keeps unrestricted state changes."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 rounded-md border border-subtle bg-layer-1 p-4 md:flex-row md:items-center">
        <div>
          <div className="text-body-sm-medium text-primary">Lifecycle</div>
          <p className="text-body-xs-regular text-tertiary">
            Enabled workflows enforce rules. Paused workflows keep rules visible without enforcement.
          </p>
          {!isEditable && <p className="mt-1 text-caption-md-regular text-tertiary">Only project admins can edit.</p>}
        </div>
        <WorkflowLifecycleToggle
          status={workflowStatus}
          loading={saving}
          disabled={!isEditable}
          onChange={handleStatusChange}
        />
      </div>

      {mode.kind === "paused" && (
        <WorkflowEmptyState
          variant="warning"
          title="Workflow enforcement is paused"
          description="Rules remain editable and visible, but state changes are not blocked until the workflow is enabled."
        />
      )}

      {mode.kind === "unrestricted" && (
        <WorkflowEmptyState
          title="Transitions are unrestricted"
          description="Add a transition rule to start guiding work item movement for this project."
        />
      )}

      {projectStates.length === 0 && (
        <WorkflowEmptyState
          title="No states available"
          description="Create project states before defining workflow transition rules."
        />
      )}

      <div className="flex flex-col gap-3 rounded-md border border-subtle bg-layer-1 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <label className="block md:min-w-64">
            <span className="text-caption-md-medium text-secondary">Rule set</span>
            <select
              className="mt-1 h-8 w-full rounded-md border border-subtle bg-surface-1 px-2 text-body-xs-regular text-primary"
              value={selectedIssueTypeId}
              onChange={(event) => {
                setSelectedIssueTypeId(event.target.value);
                setEditingTransitionId(null);
                setError(null);
              }}
            >
              {issueTypeOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-col gap-1 md:w-80">
            <span className="text-caption-md-medium text-secondary">Typed rule set</span>
            <div className="flex gap-2">
              <input
                className="h-8 min-w-0 flex-1 rounded-md border border-subtle bg-surface-1 px-2 text-body-xs-regular text-primary"
                value={customIssueTypeId}
                disabled={!isEditable || saving}
                onChange={(event) => setCustomIssueTypeId(event.target.value)}
                placeholder="Issue type ID"
              />
              <Button
                variant="secondary"
                size="lg"
                disabled={!isEditable || saving || customIssueTypeId.trim().length === 0}
                onClick={handleCustomIssueType}
              >
                Use
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          {(Object.keys(STATE_GROUPS) as TStateGroups[]).map((group) => (
            <WorkflowBuilderCard
              key={group}
              groupLabel={STATE_GROUPS[group].label}
              states={groupedStates[group]}
              selectedFromStateId={selectedFromStateId}
              transitionsByFromState={transitionsByFromState}
              getStateName={getStateName}
              onSelectFromState={handleSelectFromState}
              onEditTransition={handleEditTransition}
            />
          ))}
        </div>
        <div className="space-y-4">
          <WorkflowTransitionEditor
            allStates={projectStates}
            disabled={!isEditable}
            error={error}
            fromState={selectedFromState}
            onCancel={() => {
              setSelectedFromStateId(null);
              setEditingTransitionId(null);
              setError(null);
            }}
            onDelete={handleDeleteTransition}
            onSave={handleSaveTransition}
            saving={saving}
            selectedIssueTypeId={selectedIssueTypeId}
            transition={selectedTransition}
          />
          <WorkflowLivePreview statesById={statesById} transitions={selectedTransitions} />
        </div>
      </div>
    </div>
  );
});
