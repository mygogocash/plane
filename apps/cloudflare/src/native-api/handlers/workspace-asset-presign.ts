/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { CloudflareBindings } from "../../types";
import { proxyLegacyApiOrFail } from "../legacy-proxy";

export async function handleWorkspaceAssetPresignRequest(
  request: Request,
  env: CloudflareBindings,
  params: { slug: string }
): Promise<Response> {
  const slug = encodeURIComponent(params.slug);

  return proxyLegacyApiOrFail(
    request,
    env,
    `/api/assets/v2/workspaces/${slug}/`,
    "LEGACY_WORKSPACE_ASSET_PRESIGN_PROXY_FAILED",
    "Unable to presign the workspace asset via the legacy API."
  );
}
