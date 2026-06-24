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
  TAutomationRule,
  TAutomationRulePayload,
  TAutomationRun,
  TAutomationService,
} from "@/components/ai/automations/automations.utils";

/**
 * Client for the Automations API (AI-T13 rule CRUD, AI-T14 runs). All routes are
 * workspace-scoped and ADMIN-gated server-side.
 *
 * BLOCKED: depends on backend AI-T13/AI-T14 routes
 * (`workspaces/<slug>/automation/rules/` and `.../automation/runs/`). Until those
 * land the store/UI can run against an injected mock service.
 */
export class AutomationService extends APIService implements TAutomationService {
  constructor() {
    super(API_BASE_URL);
  }

  async listRules(workspaceSlug: string): Promise<TAutomationRule[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/automation/rules/`)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data ?? err?.response ?? err;
      });
  }

  async createRule(workspaceSlug: string, payload: TAutomationRulePayload): Promise<TAutomationRule> {
    return this.post(`/api/workspaces/${workspaceSlug}/automation/rules/`, payload)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data ?? err?.response ?? err;
      });
  }

  async updateRule(
    workspaceSlug: string,
    ruleId: string,
    payload: Partial<TAutomationRulePayload>
  ): Promise<TAutomationRule> {
    return this.patch(`/api/workspaces/${workspaceSlug}/automation/rules/${ruleId}/`, payload)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data ?? err?.response ?? err;
      });
  }

  async deleteRule(workspaceSlug: string, ruleId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/automation/rules/${ruleId}/`)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data ?? err?.response ?? err;
      });
  }

  async listRuns(workspaceSlug: string): Promise<TAutomationRun[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/automation/runs/`)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data ?? err?.response ?? err;
      });
  }
}
