/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { CloudflareBindings } from "../../types";
import { isResponse, mapAuthenticatedUserPayload, resolveLegacyAuthenticatedUser } from "../../session-bridge";
import { jsonResponse } from "../http";

export async function handleUsersMeRequest(request: Request, env: CloudflareBindings): Promise<Response> {
  const user = await resolveLegacyAuthenticatedUser(request, env);
  if (isResponse(user)) {
    return user;
  }

  return jsonResponse(mapAuthenticatedUserPayload(user));
}
