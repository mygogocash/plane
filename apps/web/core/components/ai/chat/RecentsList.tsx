// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { cn } from "@plane/utils";
import type { TCopilotConversation } from "@/services/ai.service";

export const NO_THREADS_LABEL = "No threads available";

type TRecentsListProps = {
  className?: string | undefined;
  conversations: TCopilotConversation[];
  onSelect?: ((conversationId: string) => void) | undefined;
};

export const RecentsList = ({ className, conversations, onSelect }: TRecentsListProps) => (
  <div className={cn("flex flex-col gap-1", className)} data-testid="recents-list">
    <span className="px-2 text-11 font-semibold tracking-wide text-tertiary uppercase">Recents</span>
    {conversations.length === 0 ? (
      <span className="px-2 py-1 text-12 text-placeholder" data-testid="recents-empty">
        {NO_THREADS_LABEL}
      </span>
    ) : (
      conversations.map((conversation) => (
        <button
          key={conversation.id}
          type="button"
          data-testid={`recents-item-${conversation.id}`}
          className="truncate rounded-sm px-2 py-1 text-left text-12 text-secondary hover:bg-layer-1"
          onClick={() => onSelect?.(conversation.id)}
        >
          {conversation.title || "Untitled chat"}
        </button>
      ))
    )}
  </div>
);
