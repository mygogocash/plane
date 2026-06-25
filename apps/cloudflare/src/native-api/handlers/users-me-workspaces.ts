/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { CloudflareBindings } from "../../types";
import { getUserWorkspaces, mapWorkspacePayload } from "../db";
import { isResponse, jsonResponse } from "../http";
import { isResponse as isBridgeResponse, resolveLegacyAuthenticatedUser } from "../../session-bridge";

export async function handleUsersMeWorkspacesRequest(request: Request, env: CloudflareBindings): Promise<Response> {
  const user = await resolveLegacyAuthenticatedUser(request, env);
  if (isBridgeResponse(user)) {
    return user;
  }

  const workspaces = await getUserWorkspaces(env, user.id);
  if (isResponse(workspaces)) {
    return workspaces;
  }

  return jsonResponse(workspaces.map((row) => mapWorkspacePayload(row)));
}
