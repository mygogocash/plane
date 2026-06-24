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
  TConnectorService,
  TSentryConfig,
  TSentryConfigPayload,
  TSlackChannelBinding,
  TSlackChannelBindingPayload,
} from "@/components/integrations/connectors/connectors.utils";

/**
 * Client for the AI connectors API (AI-T18 Slack channel bindings, AI-T20 Sentry
 * config). The Sentry secret is write-only: it is sent on save but never returned.
 *
 * BLOCKED: depends on backend AI-T18/AI-T20 routes
 * (`workspaces/<slug>/integrations/slack/channels/` and
 * `.../integrations/sentry/`). Until those land the UI can run against an injected
 * mock service.
 */
export class ConnectorService extends APIService implements TConnectorService {
  constructor() {
    super(API_BASE_URL);
  }

  async getSlackChannels(workspaceSlug: string): Promise<TSlackChannelBinding[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/integrations/slack/channels/`)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data ?? err?.response ?? err;
      });
  }

  async bindSlackChannel(workspaceSlug: string, payload: TSlackChannelBindingPayload): Promise<TSlackChannelBinding> {
    return this.post(`/api/workspaces/${workspaceSlug}/integrations/slack/channels/`, payload)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data ?? err?.response ?? err;
      });
  }

  async getSentryConfig(workspaceSlug: string): Promise<TSentryConfig | null> {
    return this.get(`/api/workspaces/${workspaceSlug}/integrations/sentry/`)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data ?? err?.response ?? err;
      });
  }

  async upsertSentryConfig(workspaceSlug: string, payload: TSentryConfigPayload): Promise<TSentryConfig> {
    return this.post(`/api/workspaces/${workspaceSlug}/integrations/sentry/`, payload)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data ?? err?.response ?? err;
      });
  }
}
