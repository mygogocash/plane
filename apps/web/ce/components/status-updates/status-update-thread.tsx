/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { decode } from "html-entities";
import { MessageSquareReply } from "lucide-react";
import { EpicService, InitiativeService } from "@plane/services";
import { stringToEmoji } from "@plane/propel/emoji-icon-picker";
import { EmojiReactionGroup, EmojiReactionPicker } from "@plane/propel/emoji-reaction";
import type { EmojiReactionType } from "@plane/propel/emoji-reaction";
import { Button } from "@plane/propel/button";
import type {
  TStatusUpdate,
  TStatusUpdatePayload,
  TStatusUpdateReaction,
  TStatusUpdateReactionPayload,
  TStatusUpdateStatus,
} from "@plane/types";
import { sanitizeRichHTML } from "@plane/utils";

export type TStatusUpdateOwner =
  | {
      type: "epic";
      workspaceSlug: string;
      projectId: string;
      id: string;
    }
  | {
      type: "initiative";
      workspaceSlug: string;
      id: string;
    };

export type TStatusUpdateThreadService = {
  list: (owner: TStatusUpdateOwner) => Promise<TStatusUpdate[]>;
  create: (owner: TStatusUpdateOwner, data: TStatusUpdatePayload) => Promise<TStatusUpdate>;
  addReaction: (
    owner: TStatusUpdateOwner,
    statusUpdateId: string,
    data: TStatusUpdateReactionPayload
  ) => Promise<TStatusUpdateReaction>;
  removeReaction: (owner: TStatusUpdateOwner, statusUpdateId: string, reactionCode: string) => Promise<void>;
};

export type TStatusUpdateNode = TStatusUpdate & {
  replies: TStatusUpdateNode[];
};

type TStatusUpdateThreadProps = {
  currentUserId?: string;
  disabled?: boolean;
  initialUpdates?: TStatusUpdate[];
  owner: TStatusUpdateOwner;
  service?: TStatusUpdateThreadService;
};

const STATUS_OPTIONS: {
  label: string;
  value: TStatusUpdateStatus;
  className: string;
}[] = [
  {
    label: "On track",
    value: "ON_TRACK",
    className: "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-300",
  },
  {
    label: "At risk",
    value: "AT_RISK",
    className: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  {
    label: "Off track",
    value: "OFF_TRACK",
    className: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300",
  },
];

const epicService = new EpicService();
const initiativeService = new InitiativeService();
const DISPLAY_TEXT_BLOCK_TAGS = new Set(["blockquote", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "p", "pre"]);

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const toCommentHtml = (value: string) => `<p>${escapeHtml(value).replace(/\n/g, "<br />")}</p>`;

const normalizeDisplayText = (value: string) =>
  value
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export const htmlToDisplayText = (html?: string) => {
  const textParts: string[] = [];
  const appendLineBreak = () => {
    const previousPart = textParts.at(-1);
    if (previousPart && !previousPart.endsWith("\n")) textParts.push("\n");
  };

  sanitizeRichHTML(html ?? "", {
    allowedTags: [...DISPLAY_TEXT_BLOCK_TAGS, "br"],
    allowedAttributes: {},
    disallowedTagsMode: "discard",
    nonTextTags: ["script", "style", "textarea"],
    onOpenTag: (name) => {
      if (name === "br" || DISPLAY_TEXT_BLOCK_TAGS.has(name)) appendLineBreak();
    },
    onCloseTag: (name) => {
      if (DISPLAY_TEXT_BLOCK_TAGS.has(name)) appendLineBreak();
    },
    textFilter: (text) => {
      textParts.push(decode(text));
      return text;
    },
  });

  return normalizeDisplayText(textParts.join(""));
};

const statusOption = (status: TStatusUpdateStatus) =>
  STATUS_OPTIONS.find((option) => option.value === status) ?? STATUS_OPTIONS[0];

const isCurrentUserReaction = (reaction: TStatusUpdateReaction, currentUserId?: string) =>
  !!currentUserId && reaction.actor === currentUserId;

const reactionCodeFromEmoji = (emoji: string) =>
  Array.from(emoji)
    .map((char) => char.codePointAt(0))
    .join("-");

export const createStatusUpdateService = (): TStatusUpdateThreadService => ({
  list: (owner) =>
    owner.type === "epic"
      ? epicService.listStatusUpdates(owner.workspaceSlug, owner.projectId, owner.id)
      : initiativeService.listStatusUpdates(owner.workspaceSlug, owner.id),
  create: (owner, data) =>
    owner.type === "epic"
      ? epicService.createStatusUpdate(owner.workspaceSlug, owner.projectId, owner.id, data)
      : initiativeService.createStatusUpdate(owner.workspaceSlug, owner.id, data),
  addReaction: (owner, statusUpdateId, data) =>
    owner.type === "epic"
      ? epicService.addStatusUpdateReaction(owner.workspaceSlug, owner.projectId, owner.id, statusUpdateId, data)
      : initiativeService.addStatusUpdateReaction(owner.workspaceSlug, owner.id, statusUpdateId, data),
  removeReaction: (owner, statusUpdateId, reactionCode) =>
    owner.type === "epic"
      ? epicService.removeStatusUpdateReaction(
          owner.workspaceSlug,
          owner.projectId,
          owner.id,
          statusUpdateId,
          reactionCode
        )
      : initiativeService.removeStatusUpdateReaction(owner.workspaceSlug, owner.id, statusUpdateId, reactionCode),
});

const defaultStatusUpdateService = createStatusUpdateService();

export const buildStatusUpdateTree = (updates: TStatusUpdate[]): TStatusUpdateNode[] => {
  const nodes = new Map<string, TStatusUpdateNode>();
  const roots: TStatusUpdateNode[] = [];

  updates.forEach((update) => {
    nodes.set(update.id, { ...update, replies: [] });
  });

  updates.forEach((update) => {
    const node = nodes.get(update.id);
    if (!node) return;

    const parentId = update.parent ?? null;
    const parent = parentId ? nodes.get(parentId) : undefined;
    if (parent) parent.replies.push(node);
    else roots.push(node);
  });

  return roots;
};

export const postStatusUpdate = async ({
  commentHtml,
  owner,
  parentId,
  service,
  status,
}: {
  commentHtml: string;
  owner: TStatusUpdateOwner;
  parentId?: string | null;
  service: TStatusUpdateThreadService;
  status: TStatusUpdateStatus;
}) =>
  service.create(owner, {
    status,
    comment_html: commentHtml,
    ...(parentId ? { parent: parentId } : {}),
  });

export const toggleStatusUpdateReaction = async ({
  currentUserId,
  owner,
  reaction,
  service,
  update,
}: {
  currentUserId?: string;
  owner: TStatusUpdateOwner;
  reaction: string;
  service: TStatusUpdateThreadService;
  update: TStatusUpdate;
}) => {
  const hasReaction = (update.reactions ?? []).some(
    (row) => row.reaction === reaction && isCurrentUserReaction(row, currentUserId)
  );

  if (hasReaction) return service.removeReaction(owner, update.id, reaction);
  return service.addReaction(owner, update.id, { reaction });
};

const buildReactionGroups = (update: TStatusUpdate, currentUserId?: string): EmojiReactionType[] => {
  const grouped = new Map<string, { count: number; reacted: boolean; users: string[] }>();

  (update.reactions ?? []).forEach((reaction) => {
    const current = grouped.get(reaction.reaction) ?? { count: 0, reacted: false, users: [] };
    current.count += 1;
    current.reacted = current.reacted || isCurrentUserReaction(reaction, currentUserId);
    if (reaction.display_name) current.users.push(reaction.display_name);
    grouped.set(reaction.reaction, current);
  });

  return Array.from(grouped.entries()).map(([reaction, details]) => ({
    emoji: stringToEmoji(reaction) || reaction,
    count: details.count,
    reacted: details.reacted,
    users: details.users,
  }));
};

function StatusChip({ status }: { status: TStatusUpdateStatus }) {
  const option = statusOption(status);

  return (
    <span className={`inline-flex h-6 items-center rounded border px-2 text-11 font-medium ${option.className}`}>
      {option.label}
    </span>
  );
}

function StatusComposer({
  disabled,
  onSubmit,
  parentId,
}: {
  disabled?: boolean;
  onSubmit: (payload: { body: string; parentId?: string | null; status: TStatusUpdateStatus }) => Promise<void>;
  parentId?: string | null;
}) {
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<TStatusUpdateStatus>("ON_TRACK");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const canSubmit = body.trim().length > 0 && !isSubmitting && !disabled;

  const submit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);

    try {
      await onSubmit({ body, parentId, status });
      setBody("");
      setStatus(parentId ? "ON_TRACK" : status);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="rounded-md border border-subtle bg-layer-1 p-3">
      <div className="mb-3 flex flex-wrap gap-2">
        {STATUS_OPTIONS.map((option) => {
          const selected = option.value === status;
          return (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              onClick={() => setStatus(option.value)}
              className={`h-7 rounded border px-2 text-11 font-medium transition-colors ${
                selected ? option.className : "border-subtle bg-layer-2 text-secondary hover:bg-surface-2"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <textarea
        className="min-h-20 w-full resize-y rounded border border-subtle bg-layer-2 px-3 py-2 text-13 text-primary outline-none placeholder:text-placeholder"
        disabled={disabled || isSubmitting}
        value={body}
        onChange={(event) => setBody(event.currentTarget.value)}
        placeholder={parentId ? "Write a reply" : "Share a status update"}
      />
      <div className="mt-3 flex justify-end">
        <Button variant="primary" size="sm" disabled={!canSubmit} onClick={submit}>
          {parentId ? "Reply" : "Post update"}
        </Button>
      </div>
    </div>
  );
}

function StatusUpdateRow({
  currentUserId,
  disabled,
  node,
  onReply,
  onToggleReaction,
}: {
  currentUserId?: string;
  disabled?: boolean;
  node: TStatusUpdateNode;
  onReply: (parentId: string, body: string, status: TStatusUpdateStatus) => Promise<void>;
  onToggleReaction: (update: TStatusUpdate, reaction: string) => Promise<void>;
}) {
  const [isReplying, setIsReplying] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const commentText = node.comment_stripped || htmlToDisplayText(node.comment_html);
  const displayName = node.actor_detail?.display_name || node.actor || "Unknown member";
  const reactions = buildReactionGroups(node, currentUserId);

  const handleReactionClick = (emoji: string) => {
    if (disabled) return;
    void onToggleReaction(node, reactionCodeFromEmoji(emoji));
  };

  const handleEmojiSelect = (reaction: string) => {
    if (disabled) return;
    void onToggleReaction(node, reaction);
  };

  return (
    <article className="rounded-md border border-subtle bg-layer-1 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-13 font-medium text-primary">{displayName}</span>
            <StatusChip status={node.status} />
          </div>
          {node.created_at && (
            <p className="mt-1 text-11 text-tertiary">{new Date(node.created_at).toLocaleString()}</p>
          )}
        </div>
      </div>
      {commentText ? <p className="mt-3 text-13 whitespace-pre-wrap text-secondary">{commentText}</p> : null}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <EmojiReactionPicker
          isOpen={isPickerOpen}
          handleToggle={setIsPickerOpen}
          onChange={handleEmojiSelect}
          disabled={disabled}
          label={
            <EmojiReactionGroup
              reactions={reactions}
              onReactionClick={handleReactionClick}
              showAddButton={!disabled}
              onAddReaction={() => setIsPickerOpen(true)}
            />
          }
          placement="bottom-start"
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => setIsReplying((current) => !current)}
          className="inline-flex h-7 items-center gap-1 rounded px-2 text-12 text-secondary hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <MessageSquareReply className="size-3.5" />
          Reply
        </button>
      </div>
      {isReplying && (
        <div className="mt-3">
          <StatusComposer
            disabled={disabled}
            parentId={node.id}
            onSubmit={async ({ body, parentId, status }) => {
              await onReply(parentId ?? node.id, body, status);
              setIsReplying(false);
            }}
          />
        </div>
      )}
      {node.replies.length > 0 && (
        <div className="mt-3 border-l border-subtle pl-3">
          <div className="flex flex-col gap-3">
            {node.replies.map((reply) => (
              <StatusUpdateRow
                key={reply.id}
                currentUserId={currentUserId}
                disabled={disabled}
                node={reply}
                onReply={onReply}
                onToggleReaction={onToggleReaction}
              />
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

export function StatusUpdateThread(props: TStatusUpdateThreadProps) {
  const { currentUserId, disabled = false, initialUpdates, owner, service = defaultStatusUpdateService } = props;
  const [updates, setUpdates] = useState<TStatusUpdate[]>(() => initialUpdates ?? []);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(initialUpdates === undefined);
  const ownerKey = `${owner.type}:${owner.workspaceSlug}:${owner.type === "epic" ? owner.projectId : ""}:${owner.id}`;
  const tree = useMemo(() => buildStatusUpdateTree(updates), [updates]);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await service.list(owner);
      setUpdates(response);
    } catch {
      setError("Status updates could not be loaded.");
    } finally {
      setIsLoading(false);
    }
  }, [owner, service]);

  useEffect(() => {
    if (initialUpdates !== undefined) {
      setUpdates(initialUpdates);
      setIsLoading(false);
      return;
    }

    void refresh();
  }, [initialUpdates, ownerKey, refresh]);

  const handleSubmit = async ({
    body,
    parentId,
    status,
  }: {
    body: string;
    parentId?: string | null;
    status: TStatusUpdateStatus;
  }) => {
    setError(null);

    try {
      const created = await postStatusUpdate({
        commentHtml: toCommentHtml(body),
        owner,
        parentId,
        service,
        status,
      });
      setUpdates((current) => [...current, created]);
    } catch {
      setError("Status update could not be posted.");
    }
  };

  const handleToggleReaction = async (update: TStatusUpdate, reaction: string) => {
    setError(null);

    try {
      await toggleStatusUpdateReaction({
        currentUserId,
        owner,
        reaction,
        service,
        update,
      });
      await refresh();
    } catch {
      setError("Reaction could not be updated.");
    }
  };

  return (
    <section className="rounded-md border border-subtle bg-layer-1 p-4" aria-label="Status updates">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-13 font-medium text-primary">Status updates</h3>
          <p className="mt-1 text-11 text-tertiary">Post progress, risks, and replies for this work.</p>
        </div>
      </div>
      <StatusComposer disabled={disabled} onSubmit={handleSubmit} />
      {error && <p className="mt-3 rounded bg-danger-subtle p-2 text-12 text-danger-primary">{error}</p>}
      {isLoading ? <p className="mt-4 text-12 text-tertiary">Loading status updates...</p> : null}
      {!isLoading && tree.length === 0 ? (
        <p className="mt-4 rounded bg-layer-2 p-3 text-12 text-tertiary">
          No status updates yet. Post the first update.
        </p>
      ) : null}
      {tree.length > 0 && (
        <div className="mt-4 flex flex-col gap-3">
          {tree.map((node) => (
            <StatusUpdateRow
              key={node.id}
              currentUserId={currentUserId}
              disabled={disabled}
              node={node}
              onReply={async (parentId, body, status) => handleSubmit({ body, parentId, status })}
              onToggleReaction={handleToggleReaction}
            />
          ))}
        </div>
      )}
    </section>
  );
}
