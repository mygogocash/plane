/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { Check, Clock, ExternalLink, ListTree, Loader2, Search, Sparkles, Wand2, X } from "lucide-react";
// plane imports
import { Button } from "@plane/propel/button";
import { EPortalPosition, EPortalWidth, ModalPortal } from "@plane/propel/portal";
import { setToast, TOAST_TYPE } from "@plane/propel/toast";
import type { TIssue, TIssuePriorities } from "@plane/types";
import { Checkbox, TextArea } from "@plane/ui";
import { cn } from "@plane/utils";
// plane web
import { CopilotPromptBox, type TCopilotPromptMode } from "@/plane-web/components/copilot";
// hooks
import { useInstance } from "@/hooks/store/use-instance";
// services
import { IssueService } from "@/services/issue";
import {
  AIService,
  type TCopilotConversation,
  type TCopilotMessageResponse,
  type TCopilotMode,
  type TCopilotSubtaskDraftItem,
} from "@/services/ai.service";
// local imports
import { htmlToText, textToHtml } from "./copilot-text.utils";

type TEditableDraftItem = TCopilotSubtaskDraftItem & {
  client_key: string;
  selected: boolean;
  description_text: string;
  assignee_ids_text: string;
  label_ids_text: string;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  workspaceSlug: string;
  projectId?: string;
  issueId?: string;
  onSubtasksCreated?: () => Promise<void> | void;
};

const aiService = new AIService();
const issueService = new IssueService();

const PRIORITIES: TIssuePriorities[] = ["urgent", "high", "medium", "low", "none"];

export function CopilotPanel(props: Props) {
  const { isOpen, onClose, workspaceSlug, projectId, issueId, onSubtasksCreated } = props;
  const { config } = useInstance();

  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<TCopilotMode>("auto");
  const [isSending, setIsSending] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<TCopilotConversation[]>([]);
  const [response, setResponse] = useState<TCopilotMessageResponse | null>(null);
  const [draftItems, setDraftItems] = useState<TEditableDraftItem[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const hasIssueContext = !!projectId && !!issueId;
  const isAiConfigured = !!config?.has_llm_configured;
  const selectedDraftCount = useMemo(
    () => draftItems.filter((item) => item.selected && item.name.trim()).length,
    [draftItems]
  );
  const promptModes = useMemo<TCopilotPromptMode[]>(() => {
    const items: TCopilotPromptMode[] = [
      { key: "auto", label: "Auto", icon: Sparkles },
      { key: "answer", label: "Answer", icon: Search },
    ];
    if (hasIssueContext) items.push({ key: "draft_subtasks", label: "Draft subtasks", icon: ListTree });
    items.push({ key: "command", label: "Command", icon: Wand2 });
    return items;
  }, [hasIssueContext]);

  useEffect(() => {
    if (!isOpen) {
      setMessage("");
      setMode("auto");
      setConversationId(null);
      setResponse(null);
      setDraftItems([]);
      setErrorMessage(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !workspaceSlug) return;

    let isMounted = true;
    setIsLoadingHistory(true);
    const loadConversations = async () => {
      try {
        const items = await aiService.listCopilotConversations(workspaceSlug);
        if (isMounted) setConversations(items);
      } catch {
        if (isMounted) setConversations([]);
      } finally {
        if (isMounted) setIsLoadingHistory(false);
      }
    };
    loadConversations();

    return () => {
      isMounted = false;
    };
  }, [isOpen, workspaceSlug]);

  const loadConversation = (conversation: TCopilotConversation) => {
    const latestMessage = conversation.messages.at(-1);
    setConversationId(conversation.id);
    setMessage("");
    setDraftItems([]);
    setErrorMessage(null);
    if (!latestMessage) {
      setResponse(null);
      return;
    }
    setResponse({
      conversation_id: conversation.id,
      mode: latestMessage.mode,
      answer: latestMessage.answer,
      citations: latestMessage.citations,
      actions: latestMessage.actions,
      action_results: latestMessage.action_results,
      subtask_draft: null,
    });
  };

  const submitMessage = async (nextMode: TCopilotMode = mode) => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage || !isAiConfigured) return;

    setIsSending(true);
    setErrorMessage(null);

    try {
      const result = await aiService.sendCopilotMessage(workspaceSlug, {
        conversation_id: conversationId,
        message: trimmedMessage,
        mode: nextMode,
        project_id: projectId,
        issue_id: issueId,
      });

      setConversationId(result.conversation_id);
      setResponse(result);
      setDraftItems((result.subtask_draft?.items ?? []).map(toEditableDraftItem));
      setMessage("");
      if (result.action_results.length > 0) {
        await onSubtasksCreated?.();
      }
      aiService
        .listCopilotConversations(workspaceSlug)
        .then(setConversations)
        .catch(() => {});
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error, "Copilot request failed."));
    } finally {
      setIsSending(false);
    }
  };

  const updateDraftItem = (index: number, updates: Partial<TEditableDraftItem>) => {
    setDraftItems((items) => items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...updates } : item)));
  };

  const applySelectedSubtasks = async () => {
    if (!workspaceSlug || !projectId || !issueId || selectedDraftCount === 0) return;

    setIsApplying(true);
    setErrorMessage(null);

    try {
      const selectedItems = draftItems.filter((item) => item.selected && item.name.trim());
      await Promise.all(
        selectedItems.map((item) => {
          const payload: Partial<TIssue> = {
            name: item.name.trim(),
            description_html: textToHtml(item.description_text),
            priority: item.priority,
            assignee_ids: csvToList(item.assignee_ids_text),
            label_ids: csvToList(item.label_ids_text),
            project_id: projectId,
            parent_id: issueId,
          };
          return issueService.createIssue(workspaceSlug, projectId, payload);
        })
      );

      await onSubtasksCreated?.();
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Subtasks created",
        message: `${selectedItems.length} subtask${selectedItems.length === 1 ? "" : "s"} added.`,
      });
      onClose();
    } catch (error: any) {
      const toastMessage = getErrorMessage(error, "Subtask creation failed.");
      setErrorMessage(toastMessage);
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Subtask creation failed",
        message: toastMessage,
      });
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <ModalPortal
      isOpen={isOpen}
      onClose={onClose}
      width={EPortalWidth.HALF}
      position={EPortalPosition.RIGHT}
      closeOnOverlayClick={false}
    >
      <section className="flex h-full flex-col border-l border-subtle bg-surface-1 text-left">
        <header className="flex items-center justify-between border-b border-subtle px-5 py-4">
          <div className="flex min-w-0 items-center gap-2">
            <Sparkles className="size-4 flex-shrink-0 text-accent-primary" />
            <h2 className="text-base truncate font-semibold text-primary">Copilot</h2>
          </div>
          <button
            type="button"
            className="grid size-8 place-items-center rounded hover:bg-surface-2"
            onClick={onClose}
            aria-label="Close Copilot"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {(isLoadingHistory || conversations.length > 0) && (
            <section className="space-y-2">
              <div className="text-xs flex items-center gap-2 font-medium text-tertiary uppercase">
                <Clock className="size-3" />
                Recent
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {isLoadingHistory ? (
                  <span className="text-xs rounded border border-subtle px-3 py-1.5 text-tertiary">Loading</span>
                ) : (
                  conversations.slice(0, 6).map((conversation) => (
                    <button
                      type="button"
                      key={conversation.id}
                      className={cn(
                        "text-xs max-w-48 flex-shrink-0 truncate rounded border px-3 py-1.5 text-left",
                        conversation.id === conversationId
                          ? "border-accent-primary text-primary"
                          : "border-subtle text-secondary hover:bg-surface-2"
                      )}
                      onClick={() => loadConversation(conversation)}
                    >
                      {conversation.title || "Copilot conversation"}
                    </button>
                  ))
                )}
              </div>
            </section>
          )}

          {!isAiConfigured && (
            <div className="text-sm rounded border border-subtle bg-surface-2 px-3 py-2 text-secondary">
              AI is not configured.
            </div>
          )}

          {errorMessage && (
            <div className="border-red-500/30 bg-red-500/10 text-sm text-red-500 rounded border px-3 py-2">
              {errorMessage}
            </div>
          )}

          {response?.answer && (
            <section className="space-y-3 rounded border border-subtle bg-surface-2 p-3">
              <p className="text-sm leading-6 whitespace-pre-wrap text-primary">{response.answer}</p>
              {response.citations.length > 0 && (
                <div className="space-y-2 border-t border-subtle pt-3">
                  <h3 className="text-xs font-medium text-tertiary uppercase">Citations</h3>
                  <div className="space-y-2">
                    {response.citations.map((citation) => (
                      <a
                        key={`${citation.entity_type}-${citation.entity_id}`}
                        href={citation.url}
                        className="text-xs block rounded border border-subtle px-3 py-2 hover:bg-surface-1"
                      >
                        <span className="flex items-center justify-between gap-2 font-medium text-primary">
                          <span className="truncate">{citation.title || citation.entity_type}</span>
                          <ExternalLink className="size-3 flex-shrink-0 text-tertiary" />
                        </span>
                        {citation.excerpt && (
                          <span className="mt-1 line-clamp-2 text-tertiary">{citation.excerpt}</span>
                        )}
                      </a>
                    ))}
                  </div>
                </div>
              )}
              {response.action_results.length > 0 && (
                <div className="space-y-2 border-t border-subtle pt-3">
                  <h3 className="text-xs font-medium text-tertiary uppercase">Applied actions</h3>
                  <div className="space-y-2">
                    {response.action_results.map((result) => (
                      <a
                        key={`${result.type}-${result.entity_id}`}
                        href={result.url}
                        className="text-xs block rounded border border-subtle px-3 py-2 hover:bg-surface-1"
                      >
                        <span className="flex items-center justify-between gap-2 font-medium text-primary">
                          <span className="truncate">{result.title || result.type}</span>
                          <ExternalLink className="size-3 flex-shrink-0 text-tertiary" />
                        </span>
                        <span className="mt-1 block text-tertiary">{result.type.replace(/_/g, " ")}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {draftItems.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-medium text-primary">Draft subtasks</h3>
                <span className="text-xs text-tertiary">{selectedDraftCount} selected</span>
              </div>
              <div className="space-y-3">
                {draftItems.map((item, index) => (
                  <div key={item.client_key} className="space-y-3 rounded border border-subtle bg-surface-2 p-3">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={item.selected}
                        onChange={() => updateDraftItem(index, { selected: !item.selected })}
                      />
                      <input
                        value={item.name}
                        onChange={(event) => updateDraftItem(index, { name: event.target.value })}
                        className="text-sm focus:border-accent-primary min-w-0 flex-1 rounded border border-subtle bg-surface-1 px-2 py-1 font-medium text-primary outline-none"
                      />
                    </div>
                    <TextArea
                      value={item.description_text}
                      onChange={(event) => updateDraftItem(index, { description_text: event.target.value })}
                      mode="primary"
                      textAreaSize="sm"
                      className="text-sm min-h-20"
                    />
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                      <select
                        value={item.priority}
                        onChange={(event) =>
                          updateDraftItem(index, { priority: event.target.value as TIssuePriorities })
                        }
                        className="text-sm rounded border border-subtle bg-surface-1 px-2 py-1.5 text-primary outline-none"
                      >
                        {PRIORITIES.map((priority) => (
                          <option key={priority} value={priority}>
                            {priority}
                          </option>
                        ))}
                      </select>
                      <input
                        value={item.assignee_ids_text}
                        onChange={(event) => updateDraftItem(index, { assignee_ids_text: event.target.value })}
                        className="text-sm rounded border border-subtle bg-surface-1 px-2 py-1.5 text-primary outline-none"
                        placeholder="Assignee IDs"
                      />
                      <input
                        value={item.label_ids_text}
                        onChange={(event) => updateDraftItem(index, { label_ids_text: event.target.value })}
                        className="text-sm rounded border border-subtle bg-surface-1 px-2 py-1.5 text-primary outline-none"
                        placeholder="Label IDs"
                      />
                    </div>
                    {item.rationale && <p className="text-xs leading-5 text-tertiary">{item.rationale}</p>}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <footer className="space-y-3 border-t border-subtle px-5 py-4">
          {hasIssueContext && draftItems.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={applySelectedSubtasks}
              disabled={selectedDraftCount === 0 || isApplying}
              prependIcon={isApplying ? <Loader2 className="animate-spin" /> : <Check />}
              className="w-full justify-center"
            >
              Apply selected
            </Button>
          )}
          <CopilotPromptBox
            value={message}
            onChange={setMessage}
            mode={mode}
            onModeChange={setMode}
            modes={promptModes}
            onSubmit={() => submitMessage()}
            isLoading={isSending}
            disabled={!isAiConfigured || isApplying}
            placeholder={hasIssueContext ? "Ask about this work item" : "Ask about this workspace"}
          />
        </footer>
      </section>
    </ModalPortal>
  );
}

function toEditableDraftItem(item: TCopilotSubtaskDraftItem, index: number): TEditableDraftItem {
  return {
    ...item,
    client_key: `${index}-${item.name}-${item.description_html}`,
    selected: true,
    description_text: htmlToText(item.description_html),
    assignee_ids_text: item.assignee_ids.join(", "),
    label_ids_text: item.label_ids.join(", "),
  };
}

function csvToList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getErrorMessage(error: any, fallback: string) {
  const detail = error?.error ?? error?.detail ?? error?.message;
  if (!detail) return fallback;
  if (typeof detail === "string") return detail;
  return JSON.stringify(detail);
}
