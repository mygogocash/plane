/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { WorkerNativeRouteDefinition } from "../api-router";
import type { CloudflareBindings } from "../types";
import { handleUsersMeRequest } from "./handlers/users-me";
import { handleUsersMeSettingsRequest } from "./handlers/users-me-settings";
import { handleUsersMeWorkspacesRequest } from "./handlers/users-me-workspaces";
import { handleWorkspaceAssetPresignRequest } from "./handlers/workspace-asset-presign";
import { handleWorkspaceDetailRequest } from "./handlers/workspace-detail";
import {
  handleWorkspaceProjectIssueCreateRequest,
  handleWorkspaceProjectIssueDeleteRequest,
  handleWorkspaceProjectIssueUpdateRequest,
  handleWorkspaceProjectIssuesListRequest,
} from "./handlers/workspace-project-issues";
import { handleWorkspaceProjectsRequest } from "./handlers/workspace-projects";
import { errorResponse } from "./http";

export async function handleWorkerNativeApiRequest(
  request: Request,
  env: CloudflareBindings,
  route: WorkerNativeRouteDefinition,
  params: Record<string, string>
): Promise<Response> {
  if (!route.implemented) {
    return errorResponse(
      501,
      "WORKER_NATIVE_API_NOT_IMPLEMENTED",
      `${route.method} ${route.path} is registered but not implemented yet.`,
      {
        route_id: route.id,
        slice: route.slice,
      }
    );
  }

  switch (route.id) {
    case "users-me":
      return handleUsersMeRequest(request, env);
    case "users-me-settings":
      return handleUsersMeSettingsRequest(request, env);
    case "users-me-workspaces":
      return handleUsersMeWorkspacesRequest(request, env);
    case "workspace-detail":
      return handleWorkspaceDetailRequest(request, env, { slug: params.slug ?? "" });
    case "workspace-projects":
      return handleWorkspaceProjectsRequest(request, env, { slug: params.slug ?? "" });
    case "workspace-project-issues-list":
      return handleWorkspaceProjectIssuesListRequest(request, env, {
        slug: params.slug ?? "",
        projectId: params.projectId ?? "",
      });
    case "workspace-project-issue-create":
      return handleWorkspaceProjectIssueCreateRequest(request, env, {
        slug: params.slug ?? "",
        projectId: params.projectId ?? "",
      });
    case "workspace-project-issue-update":
      return handleWorkspaceProjectIssueUpdateRequest(request, env, {
        slug: params.slug ?? "",
        projectId: params.projectId ?? "",
        issueId: params.issueId ?? "",
      });
    case "workspace-project-issue-delete":
      return handleWorkspaceProjectIssueDeleteRequest(request, env, {
        slug: params.slug ?? "",
        projectId: params.projectId ?? "",
        issueId: params.issueId ?? "",
      });
    case "workspace-asset-presign":
      return handleWorkspaceAssetPresignRequest(request, env, { slug: params.slug ?? "" });
    default: {
      const exhaustiveCheck: never = route.id;
      return errorResponse(501, "WORKER_NATIVE_ROUTE_UNKNOWN", `No handler registered for ${exhaustiveCheck}.`);
    }
  }
}
