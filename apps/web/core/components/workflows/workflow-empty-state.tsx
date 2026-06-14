/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { cn } from "@plane/utils";

type Props = {
  description: string;
  title: string;
  variant?: "default" | "warning";
};

export function WorkflowEmptyState(props: Props) {
  const { description, title, variant = "default" } = props;

  return (
    <div
      className={cn(
        "rounded-md border p-4",
        variant === "warning" ? "border-warning-subtle bg-warning-subtle/30" : "border-subtle bg-layer-1"
      )}
    >
      <div className="text-body-sm-medium text-primary">{title}</div>
      <p className="mt-1 text-body-xs-regular text-tertiary">{description}</p>
    </div>
  );
}
