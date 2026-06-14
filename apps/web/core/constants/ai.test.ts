/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
// local imports
import { AI_THINKING_ESCALATION_MS, AI_THINKING_MESSAGES, getAIThinkingMessage } from "./ai";

describe("getAIThinkingMessage", () => {
  it("shows the first message at the start of the wait", () => {
    expect(getAIThinkingMessage(0)).toBe(AI_THINKING_MESSAGES[0]);
    expect(getAIThinkingMessage(AI_THINKING_ESCALATION_MS.STILL_WORKING - 1)).toBe(AI_THINKING_MESSAGES[0]);
  });

  it("escalates to the second message after a few seconds", () => {
    expect(getAIThinkingMessage(AI_THINKING_ESCALATION_MS.STILL_WORKING)).toBe(AI_THINKING_MESSAGES[1]);
    expect(getAIThinkingMessage(AI_THINKING_ESCALATION_MS.ALMOST_THERE - 1)).toBe(AI_THINKING_MESSAGES[1]);
  });

  it("shows the final message during a long wait", () => {
    expect(getAIThinkingMessage(AI_THINKING_ESCALATION_MS.ALMOST_THERE)).toBe(AI_THINKING_MESSAGES[2]);
    expect(getAIThinkingMessage(60_000)).toBe(AI_THINKING_MESSAGES[2]);
  });
});
