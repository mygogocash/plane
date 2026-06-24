// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// helpers
import { API_BASE_URL } from "@plane/constants";
// plane web constants
import type { AI_EDITOR_TASKS } from "@/constants/ai";
import { AI_EDITOR_TASKS as AIEditorTasks } from "@/constants/ai";
// services
import { APIService } from "@/services/api.service";
// component-level AI contracts (kept colocated with their surfaces)
import type { TAgentMention, TAgentMentionPayload, TAutomationAgent } from "@/components/ai/agents/agents.utils";
import type { TTriageApplyPayload, TTriageSuggestion } from "@/components/ai/intake-triage/intake-triage.utils";
import type { TDuplicateCheckPayload, TDuplicateCheckResponse } from "@/types/similar-issue";
// types
// FIXME:
// import { IGptResponse } from "@plane/types";
// helpers

export type TTaskPayload = {
  casual_score?: number;
  formal_score?: number;
  task: AI_EDITOR_TASKS;
  text_input: string;
  target_language?: string;
};

/** Runtime list of every Copilot mode. `TCopilotMode` is derived from this so the
 *  type and the runtime enumeration can never drift apart (AI-T22). */
export const COPILOT_MODES = [
  "answer",
  "draft_subtasks",
  "command",
  "auto",
  "build_project",
  "context_assist",
] as const;

export type TCopilotMode = (typeof COPILOT_MODES)[number];

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

export type TCopilotQueryScope = "epic" | "initiative" | "project" | "workspace";

export type TCopilotQueryPayload = {
  scope: TCopilotQueryScope;
  object_id?: string | null;
  question: string;
};

export type TCopilotQueryEvidence = {
  entity_type: string;
  entity_id: string;
  title: string;
  url: string;
  source_text: string;
};

export type TCopilotQueryResponse = {
  answer: string;
  summary: string;
  evidence: TCopilotQueryEvidence[];
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
  mode: Exclude<TCopilotMode, "auto" | "context_assist">;
  answer: string;
  citations: TCopilotCitation[];
  actions: TCopilotAction[];
  action_results: TCopilotActionResult[];
  subtask_draft: {
    items: TCopilotSubtaskDraftItem[];
  } | null;
  project_draft?: TBuildProjectDraft | null;
  draft_token?: string | null;
};

export type TBuildProjectWorkItemDraft = {
  name: string;
  description?: string;
  estimate?: number | null;
  priority?: string;
  labels?: string[];
  assignee_suggestion?: string | null;
};

export type TBuildProjectDraft = {
  name: string;
  description?: string;
  work_items: TBuildProjectWorkItemDraft[];
  suggested_cycle?: {
    name?: string;
    start_date?: string | null;
    end_date?: string | null;
  } | null;
};

export type TApplyBuildDraftPayload = {
  draft_token: string;
  project_draft: TBuildProjectDraft;
};

export type TApplyBuildDraftResponse = {
  project_id: string;
  issue_ids: string[];
  cycle_id?: string | null;
  warnings?: string[];
};

export type TContextAssistEntityType = "issue" | "cycle" | "project" | "initiative";

export type TContextAssistItem = {
  issue_id: string;
  name: string;
  blocked_by?: {
    issue_id: string;
    name: string;
  };
};

export type TContextAssistRecentChange = {
  issue_id: string | null;
  name: string;
  summary: string;
  created_at: string;
};

export type TContextAssistPayload = {
  entity_type?: TContextAssistEntityType | null;
  entity_id?: string | null;
};

export type TContextAssistResponse = {
  blockers: TContextAssistItem[];
  at_risk: TContextAssistItem[];
  recent_changes: TContextAssistRecentChange[];
  suggested_follow_ups: string[];
};

export type TGenerateBriefPayload = {
  regenerate?: boolean;
};

export type TGenerateBriefResponse = {
  page_id: string;
  regenerated?: boolean;
};

export type TCreateBuildDraftPayload = {
  message: string;
  project_id?: string;
  conversation_id?: string | null;
};

export type TSummaryEntityType = "cycle" | "project" | "initiative";

export type TSummaryRollupItem = {
  issue_id: string;
  name: string;
  blocked_by?: {
    issue_id: string;
    name: string;
  };
};

export type TSummaryRollup = {
  percent_complete: number;
  blockers: TSummaryRollupItem[];
  at_risk: TSummaryRollupItem[];
};

export type TEntitySummaryResponse = {
  markdown: string;
  rollup: TSummaryRollup;
};

export type TSharedSummaryResponse = TEntitySummaryResponse & {
  share_token: string;
  share_url: string;
  expires_at: string | null;
};

export type TCopilotConversation = {
  id: string;
  title: string;
  last_message_at: string | null;
  messages: Array<{
    id: string;
    mode: Exclude<TCopilotMode, "auto" | "context_assist">;
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

  async queryCopilot(workspaceSlug: string, data: TCopilotQueryPayload): Promise<TCopilotQueryResponse> {
    return this.post(`/api/workspaces/${workspaceSlug}/copilot/query/`, data)
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

  async summarizeEntity(
    workspaceSlug: string,
    entityType: TSummaryEntityType,
    entityId: string
  ): Promise<TEntitySummaryResponse> {
    const path =
      entityType === "cycle"
        ? `/api/workspaces/${workspaceSlug}/cycles/${entityId}/summarize/`
        : entityType === "project"
          ? `/api/workspaces/${workspaceSlug}/projects/${entityId}/summarize/`
          : `/api/workspaces/${workspaceSlug}/initiatives/${entityId}/summarize/`;

    return this.post(path, {})
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data ?? error?.response ?? error;
      });
  }

  async createShareLink(
    workspaceSlug: string,
    entityType: TSummaryEntityType,
    entityId: string
  ): Promise<TSharedSummaryResponse> {
    const path =
      entityType === "cycle"
        ? `/api/workspaces/${workspaceSlug}/cycles/${entityId}/summarize/share/`
        : entityType === "project"
          ? `/api/workspaces/${workspaceSlug}/projects/${entityId}/summarize/share/`
          : `/api/workspaces/${workspaceSlug}/initiatives/${entityId}/summarize/share/`;

    return this.post(path, {})
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data ?? error?.response ?? error;
      });
  }

  async checkDuplicates(
    workspaceSlug: string,
    projectId: string,
    payload: TDuplicateCheckPayload
  ): Promise<TDuplicateCheckResponse> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/duplicate-check/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data ?? error?.response ?? error;
      });
  }

  async contextAssist(workspaceSlug: string, payload: TContextAssistPayload = {}): Promise<TContextAssistResponse> {
    return this.post(`/api/workspaces/${workspaceSlug}/copilot/context-assist/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data ?? error?.response ?? error;
      });
  }

  async createBuildDraft(workspaceSlug: string, data: TCreateBuildDraftPayload): Promise<TCopilotMessageResponse> {
    return this.sendCopilotMessage(workspaceSlug, {
      ...data,
      mode: "build_project",
    });
  }

  async applyBuildDraft(
    workspaceSlug: string,
    projectId: string,
    payload: TApplyBuildDraftPayload
  ): Promise<TApplyBuildDraftResponse> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/build-project/apply/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data ?? error?.response ?? error;
      });
  }

  async generateBrief(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    payload: TGenerateBriefPayload = {}
  ): Promise<TGenerateBriefResponse> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/generate-brief/`,
      payload
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data ?? error?.response ?? error;
      });
  }

  async translate(
    workspaceSlug: string,
    data: { text_input: string; target_language: string }
  ): Promise<{ response: string }> {
    return this.performEditorTask(workspaceSlug, {
      task: AIEditorTasks.TRANSLATE,
      text_input: data.text_input,
      target_language: data.target_language,
    });
  }

  /** AI-T15: ADMIN-gated agent list (`automation/agents/`). */
  async listAgents(workspaceSlug: string): Promise<TAutomationAgent[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/automation/agents/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data ?? error?.response ?? error;
      });
  }

  /**
   * AI-T16: enqueue an `@AgentName` mention run. The backend mention route is not
   * wired yet, so this is stub-friendly: the contract is fixed but callers may
   * inject a mock service until the route lands.
   *
   * BLOCKED: depends on the backend agent-mention endpoint.
   */
  async createMention(workspaceSlug: string, payload: TAgentMentionPayload): Promise<TAgentMention> {
    return this.post(`/api/workspaces/${workspaceSlug}/automation/agents/mentions/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data ?? error?.response ?? error;
      });
  }

  /** AI-T17: list AI triage suggestions for an intake queue. */
  async listTriageSuggestions(workspaceSlug: string, intakeId: string): Promise<TTriageSuggestion[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/intake/${intakeId}/triage-suggestions/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data ?? error?.response ?? error;
      });
  }

  /** AI-T17: apply a triage suggestion with optional member corrections. */
  async applyTriageSuggestion(
    workspaceSlug: string,
    suggestionId: string,
    payload: TTriageApplyPayload = {}
  ): Promise<TTriageSuggestion> {
    return this.post(`/api/workspaces/${workspaceSlug}/intake/triage-suggestions/${suggestionId}/apply/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data ?? error?.response ?? error;
      });
  }
}
