/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { Button } from "@plane/propel/button";
import type { TWorkflowStatus } from "@plane/types";

const WORKFLOW_STATUSES: { label: string; value: TWorkflowStatus }[] = [
  { label: "Disabled", value: "disabled" },
  { label: "Paused", value: "paused" },
  { label: "Enabled", value: "enabled" },
];

type Props = {
  disabled?: boolean;
  loading?: boolean;
  onChange: (status: TWorkflowStatus) => void;
  status: TWorkflowStatus;
};

export function WorkflowLifecycleToggle(props: Props) {
  const { disabled = false, loading = false, onChange, status } = props;

  return (
    <div className="flex items-center gap-1 rounded-md border border-subtle bg-layer-1 p-1">
      {WORKFLOW_STATUSES.map((item) => (
        <Button
          key={item.value}
          variant={status === item.value ? "primary" : "ghost"}
          size="sm"
          disabled={disabled || loading || status === item.value}
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </Button>
      ))}
    </div>
  );
}
