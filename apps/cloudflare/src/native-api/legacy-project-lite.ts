/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { fetchLegacyOrigin } from "../edge-routing";
import type { CloudflareBindings } from "../types";

const PROJECT_LITE_FIELDS = [
  "logo_props",
  "member_role",
  "sort_order",
  "archived_at",
  "intake_count",
  "cycle_view",
  "issue_views_view",
  "module_view",
  "page_view",
  "inbox_view",
  "guest_view_all_features",
  "project_lead",
  "created_by",
  "updated_by",
] as const;

export function pickLegacyProjectLiteFields(legacy: Record<string, unknown>): Record<string, unknown> {
  const picked: Record<string, unknown> = {};

  for (const field of PROJECT_LITE_FIELDS) {
    if (field in legacy) {
      picked[field] = legacy[field];
    }
  }

  return picked;
}

export function applyLegacyProjectLiteFields<T extends Record<string, unknown>>(
  payload: T,
  legacy: Record<string, unknown> | undefined
): T {
  if (!legacy) {
    return payload;
  }

  return {
    ...payload,
    ...pickLegacyProjectLiteFields(legacy),
  };
}

export async function fetchLegacyWorkspaceProjectsById(
  request: Request,
  env: CloudflareBindings,
  slug: string
): Promise<Map<string, Record<string, unknown>>> {
  const legacyOrigin = env.LEGACY_GKE_ORIGIN?.trim();
  if (!legacyOrigin) {
    return new Map();
  }

  const appOrigin = env.APP_ORIGIN ?? "https://app.manut.xyz";

  try {
    const response = await fetchLegacyOrigin(
      new Request(new URL(`/api/workspaces/${encodeURIComponent(slug)}/projects/`, appOrigin).toString(), {
        method: "GET",
        headers: request.headers,
      }),
      env,
      "api"
    );

    if (!response.ok) {
      return new Map();
    }

    const data = (await response.json()) as unknown;
    if (!Array.isArray(data)) {
      return new Map();
    }

    const index = new Map<string, Record<string, unknown>>();
    for (const row of data) {
      if (!row || typeof row !== "object") {
        continue;
      }

      const record = row as Record<string, unknown>;
      if (typeof record.id === "string") {
        index.set(record.id, record);
      }
    }

    return index;
  } catch (error) {
    console.error("LEGACY_PROJECT_LITE_FETCH_FAILED", error);
    return new Map();
  }
}
