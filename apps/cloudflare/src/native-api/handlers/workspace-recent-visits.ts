/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { CloudflareBindings } from "../../types";
import { getWorkspaceBySlug } from "../db";
import { listWorkspaceRecentVisits } from "../workspace-home-widgets-db";
import { errorResponse, isResponse, jsonResponse } from "../http";
import { isResponse as isBridgeResponse, resolveLegacyAuthenticatedUser } from "../../session-bridge";

export async function handleWorkspaceRecentVisitsRequest(
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

  const url = new URL(request.url);
  const entityName = url.searchParams.get("entity_name") ?? undefined;
  const scope = { workspaceId: workspace.id, userId: user.id, workspaceSlug: slug };
  const visits = await listWorkspaceRecentVisits(env, scope, entityName);
  if (isResponse(visits)) {
    return visits;
  }

  return jsonResponse(visits);
}
