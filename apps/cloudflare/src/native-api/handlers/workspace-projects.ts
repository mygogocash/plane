/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { CloudflareBindings } from "../../types";
import { proxyLegacyApiGetOrFail } from "../legacy-proxy";

export async function handleWorkspaceProjectsRequest(
  request: Request,
  env: CloudflareBindings,
  params: { slug: string }
): Promise<Response> {
  return proxyLegacyApiGetOrFail(
    request,
    env,
    `/api/workspaces/${encodeURIComponent(params.slug)}/projects/`,
    "LEGACY_WORKSPACE_PROJECTS_PROXY_FAILED",
    "Unable to load workspace projects from the legacy session bridge."
  );
}
