/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TStatusUpdateStatus = "ON_TRACK" | "AT_RISK" | "OFF_TRACK";

export type TStatusUpdateActorDetail = {
  id: string;
  display_name?: string;
  first_name?: string;
  last_name?: string;
  avatar_url?: string | null;
  is_bot?: boolean;
};

export type TStatusUpdateReaction = {
  id: string;
  actor: string;
  status_update: string;
  reaction: string;
  display_name?: string;
  deleted_at?: string | null;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  updated_by?: string | null;
};

export type TStatusUpdate = {
  id: string;
  workspace: string;
  epic: string | null;
  initiative: string | null;
  status: TStatusUpdateStatus;
  comment_html?: string;
  comment_stripped?: string;
  comment_json?: Record<string, unknown>;
  parent?: string | null;
  actor?: string | null;
  actor_detail?: TStatusUpdateActorDetail;
  reactions?: TStatusUpdateReaction[];
  deleted_at?: string | null;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  updated_by?: string | null;
};

export type TStatusUpdatePayload = {
  status: TStatusUpdateStatus;
  comment_html: string;
  comment_json?: Record<string, unknown>;
  parent?: string | null;
};

export type TStatusUpdateReactionPayload = {
  reaction: string;
};
