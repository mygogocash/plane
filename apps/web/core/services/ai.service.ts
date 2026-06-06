/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// helpers
import { API_BASE_URL } from "@plane/constants";
// plane web constants
import type { AI_EDITOR_TASKS } from "@/constants/ai";
// services
import { APIService } from "@/services/api.service";
// types
// FIXME:
// import { IGptResponse } from "@plane/types";
// helpers

export type TTaskPayload = {
  casual_score?: number;
  formal_score?: number;
  task: AI_EDITOR_TASKS;
  text_input: string;
};

export type TCopilotMode = "answer" | "draft_subtasks" | "command" | "auto";

export type TCopilotCitation = {
  entity_type: "issue" | "sub_issue" | "project" | "page" | "comment" | "activity";
  entity_id: string;
  title: string;
  url: string;
  excerpt: string;
};

export type TCopilotSubtaskDraftItem = {
  name: string;
  description_html: string;
  priority: "urgent" | "high" | "medium" | "low" | "none";
  assignee_ids: string[];
  label_ids: string[];
  rationale: string;
};

export type TCopilotMessagePayload = {
  conversation_id?: string | null;
  message: string;
  mode?: TCopilotMode;
  project_id?: string;
  issue_id?: string;
};

export type TCopilotAction = {
  entity_id?: string;
  error?: unknown;
  name?: string;
  status: "validated" | "rejected" | "applied";
  title?: string;
  type: string;
  url?: string;
};

export type TCopilotActionResult = {
  entity_id: string;
  status: "applied";
  title: string;
  type: string;
  url: string;
};

export type TCopilotMessageResponse = {
  conversation_id: string;
  mode: Exclude<TCopilotMode, "auto">;
  answer: string;
  citations: TCopilotCitation[];
  actions: TCopilotAction[];
  action_results: TCopilotActionResult[];
  subtask_draft: {
    items: TCopilotSubtaskDraftItem[];
  } | null;
};

export type TCopilotConversation = {
  id: string;
  title: string;
  last_message_at: string | null;
  messages: Array<{
    id: string;
    mode: Exclude<TCopilotMode, "auto">;
    prompt: string;
    answer: string;
    citations: TCopilotCitation[];
    actions: TCopilotAction[];
    action_results: TCopilotActionResult[];
    created_at: string;
  }>;
};

export class AIService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async createGptTask(workspaceSlug: string, data: { prompt: string; task: string }): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/ai-assistant/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response;
      });
  }

  async sendCopilotMessage(workspaceSlug: string, data: TCopilotMessagePayload): Promise<TCopilotMessageResponse> {
    return this.post(`/api/workspaces/${workspaceSlug}/copilot/messages/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data ?? error?.response ?? error;
      });
  }

  async listCopilotConversations(workspaceSlug: string): Promise<TCopilotConversation[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/copilot/conversations/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data ?? error?.response ?? error;
      });
  }

  async performEditorTask(
    workspaceSlug: string,
    data: TTaskPayload
  ): Promise<{
    response: string;
  }> {
    return this.post(`/api/workspaces/${workspaceSlug}/rephrase-grammar/`, data)
      .then((res) => res?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
