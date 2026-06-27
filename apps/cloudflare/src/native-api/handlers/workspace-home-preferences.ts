/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { CloudflareBindings } from "../../types";
import { getWorkspaceBySlug } from "../db";
import { getHomeWidgetPreferences, patchHomeWidgetPreference } from "../user-preferences-db";
import { errorResponse, isResponse, jsonResponse } from "../http";
import { isResponse as isBridgeResponse, resolveLegacyAuthenticatedUser } from "../../session-bridge";

export async function handleWorkspaceHomePreferencesRequest(
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
  const widgets = await getHomeWidgetPreferences(env, scope);
  if (isResponse(widgets)) {
    return widgets;
  }

  return jsonResponse(
    widgets.map((widget) => ({
      key: widget.key,
      is_enabled: widget.is_enabled,
      sort_order: widget.sort_order,
      config: widget.config,
    }))
  );
}

export async function handleWorkspaceHomePreferenceUpdateRequest(
  request: Request,
  env: CloudflareBindings,
  params: { slug: string; key: string }
): Promise<Response> {
  const user = await resolveLegacyAuthenticatedUser(request, env);
  if (isBridgeResponse(user)) {
    return user;
  }

  const slug = params.slug.trim();
  const key = params.key.trim();
  if (!slug || !key) {
    return errorResponse(404, "WORKSPACE_NOT_FOUND", "Workspace was not found for the authenticated user.");
  }

  const workspace = await getWorkspaceBySlug(env, slug, user.id);
  if (isResponse(workspace)) {
    return workspace;
  }

  if (!workspace) {
    return errorResponse(404, "WORKSPACE_NOT_FOUND", "Workspace was not found for the authenticated user.");
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return errorResponse(400, "INVALID_JSON", "Request body must be a JSON object.");
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return errorResponse(400, "INVALID_JSON", "Request body must be valid JSON.");
  }

  const update: { is_enabled?: boolean; sort_order?: number; config?: Record<string, unknown> } = {};

  if (typeof body.is_enabled === "boolean") {
    update.is_enabled = body.is_enabled;
  }

  if (typeof body.sort_order === "number" && Number.isFinite(body.sort_order)) {
    update.sort_order = body.sort_order;
  }

  if (body.config && typeof body.config === "object" && !Array.isArray(body.config)) {
    update.config = body.config as Record<string, unknown>;
  }

  const scope = { workspaceId: workspace.id, userId: user.id };
  const result = await patchHomeWidgetPreference(env, scope, key, update);
  if (isResponse(result)) {
    return result;
  }

  return jsonResponse({
    key: result.key,
    is_enabled: result.is_enabled,
    sort_order: result.sort_order,
    config: result.config,
  });
}
