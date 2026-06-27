/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { CloudflareBindings } from "../../types";
import { getWorkspaceBySlug } from "../db";
import { getSidebarPreferences, patchSidebarPreferences } from "../user-preferences-db";
import { errorResponse, isResponse, jsonResponse } from "../http";
import { isResponse as isBridgeResponse, resolveLegacyAuthenticatedUser } from "../../session-bridge";

type SidebarPreferenceUpdate = {
  key: string;
  is_pinned?: boolean;
  sort_order?: number;
};

function parseSidebarPreferenceUpdates(body: unknown): SidebarPreferenceUpdate[] | Response {
  if (!Array.isArray(body)) {
    return errorResponse(400, "INVALID_BODY", "Expected an array of sidebar preference updates.");
  }

  const updates: SidebarPreferenceUpdate[] = [];

  for (const entry of body) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const record = entry as Record<string, unknown>;
    const key = typeof record.key === "string" ? record.key.trim() : "";
    if (!key) {
      continue;
    }

    const update: SidebarPreferenceUpdate = { key };

    if (typeof record.is_pinned === "boolean") {
      update.is_pinned = record.is_pinned;
    }

    if (typeof record.sort_order === "number" && Number.isFinite(record.sort_order)) {
      update.sort_order = record.sort_order;
    }

    updates.push(update);
  }

  if (updates.length === 0) {
    return errorResponse(400, "INVALID_BODY", "No valid sidebar preference updates were provided.");
  }

  return updates;
}

export async function handleWorkspaceSidebarPreferencesRequest(
  request: Request,
  env: CloudflareBindings,
  params: { slug: string }
): Promise<Response> {
  const user = await resolveLegacyAuthenticatedUser(request, env);
  if (isBridgeResponse(user)) {
    return user;
  }

  const slug = params.slug.trim();
  if (!slug) {
    return errorResponse(404, "WORKSPACE_NOT_FOUND", "Workspace was not found for the authenticated user.");
  }

  const workspace = await getWorkspaceBySlug(env, slug, user.id);
  if (isResponse(workspace)) {
    return workspace;
  }

  if (!workspace) {
    return errorResponse(404, "WORKSPACE_NOT_FOUND", "Workspace was not found for the authenticated user.");
  }

  const scope = { workspaceId: workspace.id, userId: user.id };

  if (request.method.toUpperCase() === "PATCH") {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse(400, "INVALID_JSON", "Request body must be valid JSON.");
    }

    const updates = parseSidebarPreferenceUpdates(body);
    if (isResponse(updates)) {
      return updates;
    }

    const patched = await patchSidebarPreferences(env, scope, updates);
    if (isResponse(patched)) {
      return patched;
    }

    // Match legacy Django bulk patch contract so older clients accept the response.
    return jsonResponse({ message: "Successfully updated" });
  }

  const preferences = await getSidebarPreferences(env, scope);
  if (isResponse(preferences)) {
    return preferences;
  }

  return jsonResponse(preferences);
}
