/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TPageTemplateType = "meeting_notes" | "runbook" | "charter" | "custom";

export type TPageTemplateAccess = 0 | 1;

export type TPageTemplate = {
  id: string;
  workspace: string;
  project: string | null;
  name: string;
  description_json: Record<string, unknown>;
  description_binary: string | null;
  description_html: string;
  description_stripped: string | null;
  logo_props: Record<string, unknown>;
  template_type: TPageTemplateType;
  access: TPageTemplateAccess;
  owned_by: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type TPageTemplatePayload = {
  name: string;
  project?: string | null;
  description_json?: Record<string, unknown>;
  description_binary?: string | null;
  description_html?: string;
  logo_props?: Record<string, unknown>;
  template_type?: TPageTemplateType;
  access?: TPageTemplateAccess;
};

export type TPageTemplateApplyPayload = {
  project_id: string;
  name?: string;
  access?: TPageTemplateAccess;
};
