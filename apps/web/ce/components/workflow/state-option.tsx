/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useContext } from "react";
import { observer } from "mobx-react";
import { Combobox } from "@headlessui/react";
import { CheckIcon } from "@plane/propel/icons";
import { cn } from "@plane/utils";
// store
import { StoreContext } from "@/lib/store-context";
// local imports
import { isSelfHostedFeatureEnabled } from "@/plane-web/lib/self-host-entitlements";
import { shouldFilterStateOption } from "./workflow-enforcement";

export type TStateOptionProps = {
  projectId: string | null | undefined;
  option: {
    value: string | undefined;
    query: string;
    content: React.ReactNode;
  };
  selectedValue: string | null | undefined;
  className?: string;
  filterAvailableStateIds?: boolean;
  isForWorkItemCreation?: boolean;
  alwaysAllowStateChange?: boolean;
  issueTypeId?: string | null;
};

export const StateOption = observer(function StateOption(props: TStateOptionProps) {
  const {
    alwaysAllowStateChange = false,
    className = "",
    filterAvailableStateIds = false,
    isForWorkItemCreation = false,
    issueTypeId,
    option,
    projectId,
    selectedValue,
  } = props;
  const store = useContext(StoreContext);
  const featureEnabled = isSelfHostedFeatureEnabled("workflows_approvals");
  const workflowStatus = projectId ? store.workflow.getWorkflowStatus(projectId) : undefined;
  const transitions = projectId ? store.workflow.getTransitionsByProject(projectId) : [];
  const legalTargetStateIds =
    projectId && selectedValue ? store.workflow.getLegalTargetStateIds(projectId, selectedValue, issueTypeId) : [];
  const isOptionDisabled = shouldFilterStateOption({
    alwaysAllowStateChange: alwaysAllowStateChange || isForWorkItemCreation,
    featureEnabled,
    filterAvailableStateIds,
    hasTransitionRules: transitions.length > 0,
    legalTargetStateIds,
    optionStateId: option.value,
    selectedStateId: selectedValue,
    workflowStatus,
  });

  return (
    <Combobox.Option
      key={option.value}
      value={option.value}
      disabled={isOptionDisabled}
      aria-disabled={isOptionDisabled}
      className={({ active, selected, disabled }) =>
        cn(
          className,
          active && !disabled ? "bg-layer-transparent-hover" : "",
          selected ? "text-primary" : "text-secondary",
          disabled ? "cursor-not-allowed opacity-50" : ""
        )
      }
    >
      {({ selected }) => (
        <>
          <span className="flex-grow truncate">{option.content}</span>
          {selected && <CheckIcon className="h-3.5 w-3.5 flex-shrink-0" />}
        </>
      )}
    </Combobox.Option>
  );
});
