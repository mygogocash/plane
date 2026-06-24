// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { cn } from "@plane/utils";
import type { TCopilotUiMode } from "../shared/ai-surface.utils";

type TCopilotModeDropdownProps = {
  className?: string | undefined;
  disabled?: boolean | undefined;
  onChange?: ((mode: TCopilotUiMode) => void) | undefined;
  value: TCopilotUiMode;
};

const OPTIONS: Array<{ value: TCopilotUiMode; label: string; hint: string }> = [
  { value: "ask", label: "Ask", hint: "Answer questions about your workspace" },
  { value: "build", label: "Build", hint: "Draft a project plan you can apply" },
];

export const CopilotModeDropdown = ({ className, disabled = false, onChange, value }: TCopilotModeDropdownProps) => (
  <div
    className={cn("inline-flex rounded-md border border-subtle p-0.5", className)}
    data-testid="copilot-mode-dropdown"
  >
    {OPTIONS.map((option) => {
      const isActive = option.value === value;
      return (
        <button
          key={option.value}
          type="button"
          disabled={disabled}
          aria-pressed={isActive}
          title={option.hint}
          data-active={isActive}
          data-testid={`copilot-mode-option-${option.value}`}
          className={cn("rounded-sm px-3 py-1 text-12 font-medium transition-colors", {
            "bg-layer-1 text-primary": isActive,
            "text-tertiary": !isActive,
            "cursor-not-allowed opacity-60": disabled,
          })}
          onClick={() => !disabled && onChange?.(option.value)}
        >
          {option.label}
        </button>
      );
    })}
  </div>
);
