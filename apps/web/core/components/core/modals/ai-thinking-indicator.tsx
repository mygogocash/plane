/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
// constants
import { getAIThinkingMessage } from "@/constants/ai";

type TAIThinkingIndicatorProps = {
  className?: string;
};

/**
 * Visible "AI is thinking…" state for the single-shot AI assistant.
 *
 * The assistant endpoint returns one response (no streaming or tool/agent steps),
 * so we can't show real progress. Instead we surface a spinner plus reassurance
 * copy that escalates with elapsed time, so a slow generation never looks frozen.
 */
export function AIThinkingIndicator(props: TAIThinkingIndicatorProps) {
  const { className = "" } = props;
  // tracks how long the current generation has been running, in ms
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const intervalId = setInterval(() => setElapsedMs(Date.now() - startedAt), 1000);
    return () => clearInterval(intervalId);
  }, []);

  return (
    <div role="status" aria-live="polite" className={`flex items-center gap-2 text-13 text-secondary ${className}`}>
      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-accent-primary" aria-hidden="true" />
      <span>{getAIThinkingMessage(elapsedMs)}</span>
    </div>
  );
}
