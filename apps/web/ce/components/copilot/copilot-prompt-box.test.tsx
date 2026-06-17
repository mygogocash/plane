/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Search, Sparkles, Wand2 } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
// local imports
import { CopilotPromptBox, type TCopilotPromptMode } from "./copilot-prompt-box";

const MODES: TCopilotPromptMode[] = [
  { key: "auto", label: "Auto", icon: Sparkles },
  { key: "answer", label: "Answer", icon: Search },
  { key: "command", label: "Command", icon: Wand2 },
];

const baseProps = {
  onChange: () => {},
  onModeChange: () => {},
  onSubmit: () => {},
  modes: MODES,
} as const;

describe("CopilotPromptBox", () => {
  it("renders the placeholder and all mode pills", () => {
    const markup = renderToStaticMarkup(
      <CopilotPromptBox {...baseProps} value="" mode="auto" placeholder="Ask about this workspace" />
    );
    expect(markup).toContain("Ask about this workspace");
    expect(markup).toContain("Auto");
    expect(markup).toContain("Answer");
    expect(markup).toContain("Command");
  });

  it("mutes the send button when empty and accents it when there is content", () => {
    const empty = renderToStaticMarkup(<CopilotPromptBox {...baseProps} value="   " mode="auto" />);
    expect(empty).toContain('aria-label="Send message"');
    expect(empty).toContain("bg-surface-1"); // muted send marker

    const filled = renderToStaticMarkup(<CopilotPromptBox {...baseProps} value="hello" mode="auto" />);
    expect(filled).not.toContain("bg-surface-1"); // send is accented, no muted marker
  });

  it("marks the active mode with aria-pressed", () => {
    const markup = renderToStaticMarkup(<CopilotPromptBox {...baseProps} value="" mode="answer" />);
    expect(markup).toContain('aria-pressed="true"');
  });
});
