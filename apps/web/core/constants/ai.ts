/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export enum AI_EDITOR_TASKS {
  ASK_ANYTHING = "ASK_ANYTHING",
}

export const LOADING_TEXTS: {
  [key in AI_EDITOR_TASKS]: string;
} = {
  [AI_EDITOR_TASKS.ASK_ANYTHING]: "Pi is generating response",
};

/**
 * Reassurance copy for the AI "thinking" state, ordered from first shown to last.
 * The work item AI assistant uses a single-shot request (no streaming or tool/agent
 * steps), so time-based copy is the honest substitute for a real progress signal.
 */
export const AI_THINKING_MESSAGES = ["AI is thinking…", "Still working on it…", "Almost there…"] as const;

/** Elapsed-time thresholds (ms) at which the thinking copy escalates. */
export const AI_THINKING_ESCALATION_MS = {
  STILL_WORKING: 5_000,
  ALMOST_THERE: 12_000,
} as const;

/**
 * Picks a reassurance message for the AI "thinking" state from the elapsed wait time.
 * @param elapsedMs - milliseconds since the AI request started.
 */
export const getAIThinkingMessage = (elapsedMs: number): string => {
  if (elapsedMs >= AI_THINKING_ESCALATION_MS.ALMOST_THERE) return AI_THINKING_MESSAGES[2];
  if (elapsedMs >= AI_THINKING_ESCALATION_MS.STILL_WORKING) return AI_THINKING_MESSAGES[1];
  return AI_THINKING_MESSAGES[0];
};
