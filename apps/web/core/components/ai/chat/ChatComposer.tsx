// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { useState } from "react";
import { SendHorizontal } from "lucide-react";
import { cn } from "@plane/utils";
import { AI_COMPOSER_UNAVAILABLE_CONTROLS, type TCopilotUiMode } from "../shared/ai-surface.utils";
import { CopilotModeDropdown } from "../ask-plane-widget/CopilotModeDropdown";

export const CHAT_COMPOSER_PLACEHOLDER = "What can I do for you?";

type TChatComposerProps = {
  className?: string | undefined;
  disabled?: boolean | undefined;
  onModeChange?: ((mode: TCopilotUiMode) => void) | undefined;
  onSubmit?: ((message: string) => void) | undefined;
  uiMode: TCopilotUiMode;
};

export const ChatComposer = ({ className, disabled = false, onModeChange, onSubmit, uiMode }: TChatComposerProps) => {
  const [value, setValue] = useState("");

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit?.(trimmed);
    setValue("");
  };

  return (
    <div
      className={cn("flex flex-col gap-2 rounded-lg border border-subtle p-3", className)}
      data-testid="chat-composer"
    >
      <textarea
        className="min-h-16 w-full resize-none bg-transparent text-13 text-primary outline-none placeholder:text-placeholder"
        placeholder={CHAT_COMPOSER_PLACEHOLDER}
        value={value}
        disabled={disabled}
        onChange={(event) => setValue(event.target.value)}
      />
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CopilotModeDropdown value={uiMode} onChange={onModeChange} disabled={disabled} />
          {/*
            No-magic / honesty rule: these controls have no fork backend. They are
            rendered explicitly disabled with a "coming soon" affordance, never as
            silent no-ops.
          */}
          {AI_COMPOSER_UNAVAILABLE_CONTROLS.map((control) => (
            <button
              key={control.key}
              type="button"
              disabled
              aria-disabled
              title={control.label}
              data-testid={`composer-control-${control.key}`}
              className="cursor-not-allowed rounded-sm px-2 py-1 text-11 text-placeholder opacity-60"
            >
              {control.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={disabled}
          data-testid="chat-composer-send"
          className={cn("inline-flex items-center gap-1 rounded-sm px-3 py-1 text-12 font-medium", {
            "text-on-accent bg-accent-primary": !disabled,
            "cursor-not-allowed bg-layer-2 text-placeholder": disabled,
          })}
          onClick={handleSubmit}
        >
          <SendHorizontal className="size-3.5" />
          Send
        </button>
      </div>
    </div>
  );
};
