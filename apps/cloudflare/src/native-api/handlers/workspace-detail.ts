/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { CloudflareBindings } from "../../types";
import { getWorkspaceBySlug, mapWorkspacePayload } from "../db";
import { errorResponse, isResponse, jsonResponse } from "../http";
import { isResponse as isBridgeResponse, resolveLegacyAuthenticatedUser } from "../../session-bridge";

export async function handleWorkspaceDetailRequest(
  request: Request,
  env: CloudflareBindings,
  params: { slug: string }
): Promise<Response> {
  const user = await resolveLegacyAuthenticatedUser(request, env);
  if (isBridgeResponse(user)) {
    return user;
  }

  const workspace = await getWorkspaceBySlug(env, params.slug, user.id);
  if (isResponse(workspace)) {
    return workspace;
  }

  if (!workspace) {
    return errorResponse(404, "WORKSPACE_NOT_FOUND", "Workspace was not found for the authenticated user.");
  }

  return jsonResponse(mapWorkspacePayload(workspace, { role: workspace.role }));
}
