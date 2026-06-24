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
  TTriageApplyPayload,
  TTriageService,
  TTriageSuggestion,
} from "@/components/ai/intake-triage/intake-triage.utils";

/**
 * Client for the Intake Triage suggestion API (AI-T17).
 *
 * BLOCKED: depends on backend AI-T17 routes
 * (`workspaces/<slug>/intake/<intake_id>/triage-suggestions/` and `.../apply/`).
 * Until those land the UI can run against an injected mock service.
 */
export class TriageService extends APIService implements TTriageService {
  constructor() {
    super(API_BASE_URL);
  }

  async listSuggestions(workspaceSlug: string, intakeId: string): Promise<TTriageSuggestion[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/intake/${intakeId}/triage-suggestions/`)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data ?? err?.response ?? err;
      });
  }

  async applySuggestion(
    workspaceSlug: string,
    suggestionId: string,
    payload: TTriageApplyPayload = {}
  ): Promise<TTriageSuggestion> {
    return this.post(`/api/workspaces/${workspaceSlug}/intake/triage-suggestions/${suggestionId}/apply/`, payload)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data ?? err?.response ?? err;
      });
  }
}
