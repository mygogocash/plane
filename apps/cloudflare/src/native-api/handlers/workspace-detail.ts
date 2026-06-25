/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { CloudflareBindings } from "../../types";
import { proxyLegacyApiGetOrFail } from "../legacy-proxy";

export async function handleWorkspaceDetailRequest(
  request: Request,
  env: CloudflareBindings,
  params: { slug: string }
): Promise<Response> {
  return proxyLegacyApiGetOrFail(
    request,
    env,
    `/api/workspaces/${encodeURIComponent(params.slug)}/`,
    "LEGACY_WORKSPACE_DETAIL_PROXY_FAILED",
    "Unable to load workspace details from the legacy session bridge."
  );
}
