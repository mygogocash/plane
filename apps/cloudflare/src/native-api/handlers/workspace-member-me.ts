/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { CloudflareBindings } from "../../types";
import { getWorkspaceMemberMe, mapWorkspaceMemberMePayload } from "../db";
import { isResponse, jsonResponse, notFoundResponse } from "../http";
import { isResponse as isBridgeResponse, resolveLegacyAuthenticatedUser } from "../../session-bridge";

export async function handleWorkspaceMemberMeRequest(
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
    return notFoundResponse("Workspace not found.");
  }

  const member = await getWorkspaceMemberMe(env, slug, user.id);
  if (isResponse(member)) {
    return member;
  }

  if (!member) {
    return notFoundResponse("Workspace member not found.");
  }

  return jsonResponse(mapWorkspaceMemberMePayload(member));
}
