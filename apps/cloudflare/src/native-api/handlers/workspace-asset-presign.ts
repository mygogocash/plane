/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { CloudflareBindings } from "../../types";
import { isResponse as isBridgeResponse, resolveLegacyAuthenticatedUser } from "../../session-bridge";
import { getWorkspaceBySlug } from "../db";
import { errorResponse, isResponse, jsonResponse, newUuid, nowIso, requireDatabase } from "../http";

export async function handleWorkspaceAssetPresignRequest(
  request: Request,
  env: CloudflareBindings,
  params: { slug: string }
): Promise<Response> {
  const auth = await resolveLegacyAuthenticatedUser(request, env);
  if (isBridgeResponse(auth)) {
    return auth;
  }

  const workspace = await getWorkspaceBySlug(env, params.slug, auth.id);
  if (isResponse(workspace)) {
    return workspace;
  }

  if (!workspace) {
    return errorResponse(404, "WORKSPACE_NOT_FOUND", "Workspace was not found for the authenticated user.");
  }

  if (!env.UPLOADS) {
    return errorResponse(503, "R2_BINDING_MISSING", "The UPLOADS R2 binding is required for worker-native uploads.");
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const entityType = typeof body?.entity_type === "string" ? body.entity_type : "WORKSPACE_LOGO";

  if (!name) {
    return errorResponse(400, "ASSET_NAME_REQUIRED", "Asset name is required.");
  }

  const assetId = newUuid();
  const timestamp = nowIso();
  const storageKey = `workspaces/${workspace.id}/${assetId}/${name}`;
  const db = requireDatabase(env);

  if (isResponse(db)) {
    return db;
  }

  try {
    await db
      .prepare(
        `INSERT INTO file_assets (
          id, workspace_id, project_id, entity_type, entity_identifier, attributes,
          storage_key, created_by, deleted_at, created_at, updated_at
        ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, NULL, ?, ?)`
      )
      .bind(
        assetId,
        workspace.id,
        entityType,
        workspace.id,
        JSON.stringify(body?.attributes ?? {}),
        storageKey,
        auth.id,
        timestamp,
        timestamp
      )
      .run();
  } catch (error) {
    console.error("D1_FILE_ASSET_CREATE_FAILED", error);
    return errorResponse(500, "D1_FILE_ASSET_CREATE_FAILED", "Failed to create the file asset record in D1.");
  }

  const uploadUrl = new URL(`/uploads/${encodeURIComponent(storageKey)}`, env.APP_ORIGIN ?? "https://app.manut.xyz");

  return jsonResponse({
    asset_id: assetId,
    upload_url: uploadUrl.toString(),
    storage_key: storageKey,
    method: "PUT",
    headers: {
      "content-type": typeof body?.type === "string" ? body.type : "application/octet-stream",
    },
    entity_type: entityType,
    workspace_id: workspace.id,
  });
}
