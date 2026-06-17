/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef } from "react";
import { ArrowUp, type LucideIcon, Loader2 } from "lucide-react";
// plane imports
import { cn } from "@plane/utils";
// services
import type { TCopilotMode } from "@/services/ai.service";

export type TCopilotPromptMode = {
  key: TCopilotMode;
  label: string;
  icon: LucideIcon;
};

type TCopilotPromptBoxProps = {
  value: string;
  onChange: (value: string) => void;
  mode: TCopilotMode;
  onModeChange: (mode: TCopilotMode) => void;
  modes: TCopilotPromptMode[];
  onSubmit: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  maxHeight?: number;
};

/**
 * Copilot prompt input — a rounded, themed prompt box with animated mode pills and a round
 * send button. Adapted from the "ai-prompt-box" design to Plane's design tokens (light + dark),
 * SSR-safe (no module-level DOM access), text-only, and wired to the real Copilot modes.
 */
export const CopilotPromptBox = (props: TCopilotPromptBoxProps) => {
  const {
    value,
    onChange,
    mode,
    onModeChange,
    modes,
    onSubmit,
    isLoading = false,
    disabled = false,
    placeholder = "Type your message here...",
    maxHeight = 160,
  } = props;

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canSend = value.trim().length > 0 && !disabled && !isLoading;

  // Autosize: grow with content up to maxHeight, then scroll. Client-only (SSR-safe).
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
  }, [value, maxHeight]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; Shift+Enter inserts a newline (standard chat behavior).
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (canSend) onSubmit();
    }
  };

  return (
    <div
      className={cn(
        "shadow-sm focus-within:border-accent-primary rounded-3xl border border-subtle bg-surface-2 p-2 transition-colors duration-200",
        disabled && "opacity-60"
      )}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={placeholder}
        rows={1}
        className="text-sm min-h-9 w-full resize-none bg-transparent px-2 py-1.5 text-primary outline-none placeholder:text-tertiary disabled:cursor-not-allowed"
      />

      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-1">
          {modes.map(({ key, label, icon: Icon }) => {
            const isActive = mode === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onModeChange(key)}
                disabled={disabled}
                aria-pressed={isActive}
                title={label}
                className={cn(
                  "flex h-7 items-center gap-1 rounded-full border px-2 transition-colors",
                  isActive
                    ? "border-accent-primary bg-accent-primary/10 text-accent-primary"
                    : "border-transparent text-tertiary hover:text-secondary"
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span
                  className={cn(
                    "text-xs overflow-hidden whitespace-nowrap transition-all duration-200",
                    isActive ? "max-w-28 opacity-100" : "max-w-0 opacity-0"
                  )}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => {
            if (canSend) onSubmit();
          }}
          disabled={!canSend}
          aria-label="Send message"
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-full transition-colors",
            canSend ? "bg-accent-primary text-white hover:bg-accent-primary/90" : "bg-surface-1 text-tertiary"
          )}
        >
          {isLoading ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
        </button>
      </div>
    </div>
  );
};
