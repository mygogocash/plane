/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { CloudflareBindings } from "../../types";
import { isResponse as isBridgeResponse, resolveLegacyAuthenticatedUser } from "../../session-bridge";
import { getUserById } from "../db";
import { errorResponse, isResponse, jsonResponse } from "../http";

export async function handleUsersMeRequest(request: Request, env: CloudflareBindings): Promise<Response> {
  const auth = await resolveLegacyAuthenticatedUser(request, env);
  if (isBridgeResponse(auth)) {
    return auth;
  }

  const user = await getUserById(env, auth.id);
  if (isResponse(user)) {
    return user;
  }

  if (!user) {
    return errorResponse(404, "USER_NOT_FOUND", "Authenticated user was not found in D1.");
  }

  return jsonResponse({
    id: user.id,
    avatar: user.avatar ?? "",
    cover_image: null,
    avatar_url: user.avatar ?? "",
    cover_image_url: null,
    date_joined: user.created_at,
    display_name: user.display_name ?? "",
    email: user.email,
    first_name: user.first_name ?? "",
    last_name: user.last_name ?? "",
    is_active: user.is_active === 1,
    is_bot: user.is_bot === 1,
    is_email_verified: true,
    user_timezone: "UTC",
    username: auth.username ?? user.email,
    is_password_autoset: true,
    last_login_medium: "email",
    last_login_time: user.last_active,
  });
}
