/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { CloudflareBindings } from "../../types";
import { isResponse as isBridgeResponse, resolveLegacyAuthenticatedUser } from "../../session-bridge";
import {
  getIssueInProject,
  getNextIssueSequence,
  getProjectInWorkspace,
  getWorkspaceBySlug,
  listProjectIssues,
  mapIssuePayload,
} from "../db";
import { errorResponse, isResponse, jsonResponse, nowIso, requireDatabase } from "../http";

async function resolveProjectContext(
  request: Request,
  env: CloudflareBindings,
  params: { slug: string; projectId: string }
) {
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

  const project = await getProjectInWorkspace(env, workspace.id, params.projectId);
  if (isResponse(project)) {
    return project;
  }

  if (!project) {
    return errorResponse(404, "PROJECT_NOT_FOUND", "Project was not found in the workspace.");
  }

  return { auth, workspace, project };
}

export async function handleWorkspaceProjectIssuesListRequest(
  request: Request,
  env: CloudflareBindings,
  params: { slug: string; projectId: string }
): Promise<Response> {
  const context = await resolveProjectContext(request, env, params);
  if (context instanceof Response) {
    return context;
  }

  const issues = await listProjectIssues(env, context.project.id);
  if (isResponse(issues)) {
    return issues;
  }

  return jsonResponse(issues.map((issue) => mapIssuePayload(issue)));
}

export async function handleWorkspaceProjectIssueCreateRequest(
  request: Request,
  env: CloudflareBindings,
  params: { slug: string; projectId: string }
): Promise<Response> {
  const context = await resolveProjectContext(request, env, params);
  if (context instanceof Response) {
    return context;
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";

  if (!name) {
    return errorResponse(400, "ISSUE_NAME_REQUIRED", "Issue name is required.");
  }

  const db = requireDatabase(env);
  if (isResponse(db)) {
    return db;
  }

  const sequenceId = await getNextIssueSequence(env, context.project.id);
  if (isResponse(sequenceId)) {
    return sequenceId;
  }

  const issueId = crypto.randomUUID();
  const timestamp = nowIso();
  const descriptionHtml =
    typeof body?.description_html === "string" && body.description_html.trim().length > 0
      ? body.description_html
      : "<p></p>";
  const priority = typeof body?.priority === "string" ? body.priority : "none";

  try {
    await db
      .prepare(
        `INSERT INTO issues (
          id, project_id, workspace_id, name, description_html, priority, state_id,
          sequence_id, sort_order, created_by, updated_by, deleted_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`
      )
      .bind(
        issueId,
        context.project.id,
        context.workspace.id,
        name,
        descriptionHtml,
        priority,
        typeof body?.state_id === "string" ? body.state_id : null,
        sequenceId,
        65535,
        context.auth.id,
        context.auth.id,
        timestamp,
        timestamp
      )
      .run();
  } catch (error) {
    console.error("D1_ISSUE_CREATE_FAILED", error);
    return errorResponse(500, "D1_ISSUE_CREATE_FAILED", "Failed to create the issue in D1.");
  }

  const created = await getIssueInProject(env, context.project.id, issueId);
  if (isResponse(created)) {
    return created;
  }

  return jsonResponse(mapIssuePayload(created!), 201);
}

export async function handleWorkspaceProjectIssueUpdateRequest(
  request: Request,
  env: CloudflareBindings,
  params: { slug: string; projectId: string; issueId: string }
): Promise<Response> {
  const context = await resolveProjectContext(request, env, params);
  if (context instanceof Response) {
    return context;
  }

  const existing = await getIssueInProject(env, context.project.id, params.issueId);
  if (isResponse(existing)) {
    return existing;
  }

  if (!existing) {
    return errorResponse(404, "ISSUE_NOT_FOUND", "Issue was not found in the project.");
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const name = typeof body?.name === "string" ? body.name.trim() : existing.name;
  const descriptionHtml =
    typeof body?.description_html === "string" ? body.description_html : existing.description_html;
  const priority = typeof body?.priority === "string" ? body.priority : existing.priority;
  const stateId =
    body && "state_id" in body ? (typeof body.state_id === "string" ? body.state_id : null) : existing.state_id;
  const timestamp = nowIso();

  const db = requireDatabase(env);
  if (isResponse(db)) {
    return db;
  }

  try {
    await db
      .prepare(
        `UPDATE issues
         SET name = ?, description_html = ?, priority = ?, state_id = ?, updated_by = ?, updated_at = ?
         WHERE id = ? AND project_id = ? AND deleted_at IS NULL`
      )
      .bind(name, descriptionHtml, priority, stateId, context.auth.id, timestamp, params.issueId, context.project.id)
      .run();
  } catch (error) {
    console.error("D1_ISSUE_UPDATE_FAILED", error);
    return errorResponse(500, "D1_ISSUE_UPDATE_FAILED", "Failed to update the issue in D1.");
  }

  const updated = await getIssueInProject(env, context.project.id, params.issueId);
  if (isResponse(updated)) {
    return updated;
  }

  return jsonResponse(mapIssuePayload(updated!));
}

export async function handleWorkspaceProjectIssueDeleteRequest(
  request: Request,
  env: CloudflareBindings,
  params: { slug: string; projectId: string; issueId: string }
): Promise<Response> {
  const context = await resolveProjectContext(request, env, params);
  if (context instanceof Response) {
    return context;
  }

  const existing = await getIssueInProject(env, context.project.id, params.issueId);
  if (isResponse(existing)) {
    return existing;
  }

  if (!existing) {
    return errorResponse(404, "ISSUE_NOT_FOUND", "Issue was not found in the project.");
  }

  const db = requireDatabase(env);
  if (isResponse(db)) {
    return db;
  }

  const timestamp = nowIso();

  try {
    await db
      .prepare(
        `UPDATE issues
         SET deleted_at = ?, updated_by = ?, updated_at = ?
         WHERE id = ? AND project_id = ? AND deleted_at IS NULL`
      )
      .bind(timestamp, context.auth.id, timestamp, params.issueId, context.project.id)
      .run();
  } catch (error) {
    console.error("D1_ISSUE_DELETE_FAILED", error);
    return errorResponse(500, "D1_ISSUE_DELETE_FAILED", "Failed to delete the issue in D1.");
  }

  return new Response(null, {
    status: 204,
    headers: {
      "x-manut-edge-route": "worker-native-api",
      "x-manut-cloudflare-phase": "worker-native-api-migration",
    },
  });
}
