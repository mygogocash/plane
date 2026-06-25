/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { CloudflareBindings } from "../../types";
import { proxyLegacyApiGetOrFail } from "../legacy-proxy";

export async function handleUsersMeWorkspacesRequest(request: Request, env: CloudflareBindings): Promise<Response> {
  return proxyLegacyApiGetOrFail(
    request,
    env,
    "/api/users/me/workspaces/",
    "LEGACY_USERS_ME_WORKSPACES_PROXY_FAILED",
    "Unable to load workspaces from the legacy session bridge."
  );
}
