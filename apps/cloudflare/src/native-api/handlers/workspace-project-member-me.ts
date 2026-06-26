/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { CloudflareBindings } from "../../types";
import { isResponse as isBridgeResponse, resolveLegacyAuthenticatedUser } from "../../session-bridge";
import { getProjectInWorkspace, getWorkspaceBySlug, getWorkspaceProjectRoles } from "../db";
import { errorResponse, isResponse, jsonResponse } from "../http";

export async function handleWorkspaceProjectMemberMeRequest(
  request: Request,
  env: CloudflareBindings,
  params: { slug: string; projectId: string }
): Promise<Response> {
  const auth = await resolveLegacyAuthenticatedUser(request, env);
  if (isBridgeResponse(auth)) {
    return auth;
  }

  const workspace = await getWorkspaceBySlug(env, params.slug, auth.id);
  if (isResponse(workspace)) {
    return workspace;
  }

  if (!workspace) {
    return errorResponse(404, "WORKSPACE_NOT_FOUND", "Workspace was not found for the authenticated user.");
  }

  const project = await getProjectInWorkspace(env, workspace.id, params.projectId);
  if (isResponse(project)) {
    return project;
  }

  if (!project) {
    return errorResponse(404, "PROJECT_NOT_FOUND", "Project was not found in the workspace.");
  }

  const roles = await getWorkspaceProjectRoles(env, params.slug, auth.id);
  if (isResponse(roles)) {
    return roles;
  }

  const role = roles.find((row) => row.project_id === project.id)?.role;
  if (role === undefined) {
    return errorResponse(
      404,
      "PROJECT_MEMBER_NOT_FOUND",
      "Project membership was not found for the authenticated user."
    );
  }

  return jsonResponse({
    id: null,
    member: auth.id,
    role,
    original_role: null,
    created_at: null,
  });
}
