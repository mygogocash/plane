/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { CloudflareBindings } from "../../types";
import { getWorkspaceBySlug } from "../db";
import {
  createWorkspaceQuickLink,
  deleteWorkspaceQuickLink,
  listWorkspaceQuickLinks,
  updateWorkspaceQuickLink,
} from "../workspace-home-widgets-db";
import { errorResponse, isResponse, jsonResponse } from "../http";
import { isResponse as isBridgeResponse, resolveLegacyAuthenticatedUser } from "../../session-bridge";

export async function handleWorkspaceQuickLinksRequest(
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

  const scope = { workspaceId: workspace.id, userId: user.id, workspaceSlug: slug };

  if (request.method.toUpperCase() === "POST") {
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

    const url = typeof body.url === "string" ? body.url : "";
    const title = typeof body.title === "string" ? body.title : undefined;
    const created = await createWorkspaceQuickLink(env, scope, { title, url });
    if (isResponse(created)) {
      return created;
    }

    return jsonResponse(created, 201);
  }

  const links = await listWorkspaceQuickLinks(env, scope);
  if (isResponse(links)) {
    return links;
  }

  return jsonResponse(links);
}

export async function handleWorkspaceQuickLinkDetailRequest(
  request: Request,
  env: CloudflareBindings,
  params: { slug: string; linkId: string }
): Promise<Response> {
  const user = await resolveLegacyAuthenticatedUser(request, env);
  if (isBridgeResponse(user)) {
    return user;
  }

  const slug = params.slug.trim();
  const linkId = params.linkId.trim();
  if (!slug || !linkId) {
    return errorResponse(404, "QUICK_LINK_NOT_FOUND", "Quick link not found.");
  }

  const workspace = await getWorkspaceBySlug(env, slug, user.id);
  if (isResponse(workspace)) {
    return workspace;
  }

  if (!workspace) {
    return errorResponse(404, "WORKSPACE_NOT_FOUND", "Workspace was not found for the authenticated user.");
  }

  const scope = { workspaceId: workspace.id, userId: user.id, workspaceSlug: slug };

  if (request.method.toUpperCase() === "DELETE") {
    const deleted = await deleteWorkspaceQuickLink(env, scope, linkId);
    if (isResponse(deleted)) {
      return deleted;
    }

    return new Response(null, { status: 204 });
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

  const update: { title?: string; url?: string } = {};
  if (typeof body.title === "string") {
    update.title = body.title;
  }
  if (typeof body.url === "string") {
    update.url = body.url;
  }

  const updated = await updateWorkspaceQuickLink(env, scope, linkId, update);
  if (isResponse(updated)) {
    return updated;
  }

  return jsonResponse(updated);
}
