/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { CloudflareBindings } from "../../types";
import { isResponse as isBridgeResponse, resolveLegacyAuthenticatedUser } from "../../session-bridge";
import { getUserWorkspaces } from "../db";
import { isResponse, jsonResponse } from "../http";

export async function handleUsersMeSettingsRequest(request: Request, env: CloudflareBindings): Promise<Response> {
  const auth = await resolveLegacyAuthenticatedUser(request, env);
  if (isBridgeResponse(auth)) {
    return auth;
  }

  const workspaces = await getUserWorkspaces(env, auth.id);
  if (isResponse(workspaces)) {
    return workspaces;
  }

  const fallback = workspaces[0];

  return jsonResponse({
    id: auth.id,
    email: auth.email,
    workspace: {
      last_workspace_id: fallback?.id ?? null,
      last_workspace_slug: fallback?.slug ?? null,
      last_workspace_name: fallback?.name ?? null,
      last_workspace_logo: fallback?.logo ?? "",
      fallback_workspace_id: fallback?.id ?? null,
      fallback_workspace_slug: fallback?.slug ?? null,
      invites: 0,
    },
  });
}
