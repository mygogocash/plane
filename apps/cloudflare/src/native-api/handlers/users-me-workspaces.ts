/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { CloudflareBindings } from "../../types";
import { isResponse as isBridgeResponse, resolveLegacyAuthenticatedUser } from "../../session-bridge";
import { getUserWorkspaces, mapWorkspacePayload } from "../db";
import { isResponse, jsonResponse } from "../http";

export async function handleUsersMeWorkspacesRequest(request: Request, env: CloudflareBindings): Promise<Response> {
  const auth = await resolveLegacyAuthenticatedUser(request, env);
  if (isBridgeResponse(auth)) {
    return auth;
  }

  const workspaces = await getUserWorkspaces(env, auth.id);
  if (isResponse(workspaces)) {
    return workspaces;
  }

  return jsonResponse(workspaces.map((workspace) => mapWorkspacePayload(workspace)));
}
