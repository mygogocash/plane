/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";
// services
import { APIService } from "@/services/api.service";
// types
import type {
  TAgentMention,
  TAgentMentionPayload,
  TAgentService,
  TAutomationAgent,
} from "@/components/ai/agents/agents.utils";

/**
 * Client for the Automation Agents API (AI-T15 CRUD, AI-T16 mention runs).
 *
 * BLOCKED: depends on backend AI-T15/AI-T16 routes
 * (`workspaces/<slug>/automation/agents/` and the mention-run enqueue). Until
 * those land the UI can run against an injected mock service.
 */
export class AgentService extends APIService implements TAgentService {
  constructor() {
    super(API_BASE_URL);
  }

  async listAgents(workspaceSlug: string): Promise<TAutomationAgent[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/automation/agents/`)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data ?? err?.response ?? err;
      });
  }

  async createMention(workspaceSlug: string, payload: TAgentMentionPayload): Promise<TAgentMention> {
    return this.post(`/api/workspaces/${workspaceSlug}/automation/agent-mentions/`, payload)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data ?? err?.response ?? err;
      });
  }
}
