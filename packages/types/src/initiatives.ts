/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TStateGroups } from "./state";

export type TInitiativeState = "DRAFT" | "PLANNED" | "ACTIVE" | "COMPLETED" | "CLOSED";

export type TInitiativeProgress = {
  counts_by_group: Partial<Record<TStateGroups, number>>;
  percent_complete: number;
  total_count: number;
};

export type TInitiativeLogoProps = {
  emoji?: string;
  icon?: string;
  in_use?: "emoji" | "icon";
  text?: string;
};

export type TInitiative = {
  id: string;
  name: string;
  description?: string;
  description_json?: Record<string, unknown>;
  description_html?: string;
  description_stripped?: string;
  lead_id?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  state: TInitiativeState;
  sort_order?: number;
  logo_props?: TInitiativeLogoProps | Record<string, unknown>;
  progress_snapshot?: TInitiativeProgress | null;
  progress?: TInitiativeProgress;
  external_source?: string | null;
  external_id?: string | null;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  updated_by?: string | null;
};

export type TInitiativePayload = Partial<
  Pick<
    TInitiative,
    | "description"
    | "description_html"
    | "description_json"
    | "end_date"
    | "external_id"
    | "external_source"
    | "lead_id"
    | "logo_props"
    | "name"
    | "sort_order"
    | "start_date"
    | "state"
  >
>;

export type TInitiativeMemberResponse = Partial<{
  attached_epic_ids: string[];
  attached_project_ids: string[];
  detached_epic_ids: string[];
  detached_project_ids: string[];
}>;

export type TInitiativeSummary = Record<TInitiativeState, TInitiative[]>;
