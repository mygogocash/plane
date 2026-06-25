/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { CloudflareBindings } from "../../types";
import { getUserProfile, mapUserProfilePayload } from "../db";
import { isResponse, jsonResponse, notFoundResponse } from "../http";
import { isResponse as isBridgeResponse, resolveLegacyAuthenticatedUser } from "../../session-bridge";

export async function handleUsersMeProfileRequest(request: Request, env: CloudflareBindings): Promise<Response> {
  const user = await resolveLegacyAuthenticatedUser(request, env);
  if (isBridgeResponse(user)) {
    return user;
  }

  const profile = await getUserProfile(env, user.id);
  if (isResponse(profile)) {
    return profile;
  }

  if (!profile) {
    return notFoundResponse("Profile not found.");
  }

  return jsonResponse(mapUserProfilePayload(profile));
}
