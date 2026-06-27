/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { CloudflareBindings } from "../../types";
import {
  getProjectNextWorkItemSequences,
  getWorkspaceBySlug,
  getWorkspaceProjects,
  mapProjectListPayload,
  mapProjectPayload,
} from "../db";
import { errorResponse, isResponse, jsonResponse } from "../http";
import { isResponse as isBridgeResponse, resolveLegacyAuthenticatedUser } from "../../session-bridge";

export async function handleWorkspaceProjectsRequest(
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

  const projects = await getWorkspaceProjects(env, workspace.id);
  if (isResponse(projects)) {
    return projects;
  }

  return jsonResponse(projects.map((project) => mapProjectPayload(project, { memberRole: workspace.role })));
}

export async function handleWorkspaceProjectsDetailsRequest(
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

  const projects = await getWorkspaceProjects(env, workspace.id);
  if (isResponse(projects)) {
    return projects;
  }

  const nextSequences = await getProjectNextWorkItemSequences(env, workspace.id);
  if (isResponse(nextSequences)) {
    return nextSequences;
  }

  return jsonResponse(
    projects.map((project) =>
      mapProjectListPayload(project, {
        memberRole: workspace.role,
        nextWorkItemSequence: nextSequences.get(project.id) ?? 1,
      })
    )
  );
}
