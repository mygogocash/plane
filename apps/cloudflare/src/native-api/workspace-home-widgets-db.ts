/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { CloudflareBindings } from "../types";
import { getProjectInWorkspace, parseLogoProps } from "./db";
import { d1QueryFailed, errorResponse, isResponse, newUuid, nowIso, requireDatabase } from "./http";

type HomeWidgetScope = {
  workspaceId: string;
  userId: string;
  workspaceSlug: string;
};

type QuickLinkRow = {
  id: string;
  workspace_id: string;
  owner_id: string;
  title: string | null;
  url: string;
  metadata: string;
  created_by_id: string | null;
  updated_by_id: string | null;
  created_at: string;
  updated_at: string;
};

type RecentVisitRow = {
  id: string;
  workspace_id: string;
  project_id: string | null;
  user_id: string;
  entity_name: string;
  entity_identifier: string | null;
  visited_at: string;
};

function parseMetadata(value: string | null | undefined): Record<string, unknown> {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) {
    return trimmed;
  }

  return trimmed.startsWith("http://") || trimmed.startsWith("https://") ? trimmed : `http://${trimmed}`;
}

export function mapQuickLinkPayload(row: QuickLinkRow, workspaceSlug: string) {
  return {
    id: row.id,
    title: row.title ?? "",
    url: row.url,
    metadata: parseMetadata(row.metadata),
    workspace: row.workspace_id,
    workspace_slug: workspaceSlug,
    owner: row.owner_id,
    created_by: row.created_by_id,
    created_by_id: row.created_by_id,
    updated_by: row.updated_by_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function listWorkspaceQuickLinks(env: CloudflareBindings, scope: HomeWidgetScope) {
  const db = requireDatabase(env);
  if (isResponse(db)) {
    return db;
  }

  try {
    const result = await db
      .prepare(
        `SELECT id, workspace_id, owner_id, title, url, metadata, created_by_id, updated_by_id, created_at, updated_at
         FROM workspace_user_links
         WHERE workspace_id = ?
           AND owner_id = ?
           AND deleted_at IS NULL
         ORDER BY created_at DESC`
      )
      .bind(scope.workspaceId, scope.userId)
      .all<QuickLinkRow>();

    return (result.results ?? []).map((row) => mapQuickLinkPayload(row, scope.workspaceSlug));
  } catch (error) {
    console.error("D1_WORKSPACE_QUICK_LINKS_READ_FAILED", error);
    return d1QueryFailed("quick-links");
  }
}

export async function createWorkspaceQuickLink(
  env: CloudflareBindings,
  scope: HomeWidgetScope,
  input: { title?: string; url: string }
) {
  const db = requireDatabase(env);
  if (isResponse(db)) {
    return db;
  }

  const url = normalizeUrl(input.url);
  if (!url) {
    return errorResponse(400, "INVALID_BODY", "URL is required.");
  }

  const timestamp = nowIso();
  const id = newUuid();

  try {
    await db
      .prepare(
        `INSERT INTO workspace_user_links (
           id, workspace_id, owner_id, title, url, metadata, created_by_id, updated_by_id, created_at, updated_at
         )
         VALUES (?, ?, ?, ?, ?, '{}', ?, ?, ?, ?)`
      )
      .bind(
        id,
        scope.workspaceId,
        scope.userId,
        input.title?.trim() || null,
        url,
        scope.userId,
        scope.userId,
        timestamp,
        timestamp
      )
      .run();

    const row = await db
      .prepare(
        `SELECT id, workspace_id, owner_id, title, url, metadata, created_by_id, updated_by_id, created_at, updated_at
         FROM workspace_user_links
         WHERE id = ?
         LIMIT 1`
      )
      .bind(id)
      .first<QuickLinkRow>();

    if (!row) {
      return errorResponse(500, "D1_QUERY_FAILED", "Quick link could not be created.");
    }

    return mapQuickLinkPayload(row, scope.workspaceSlug);
  } catch (error) {
    console.error("D1_WORKSPACE_QUICK_LINK_CREATE_FAILED", error);
    return d1QueryFailed("quick-links");
  }
}

export async function updateWorkspaceQuickLink(
  env: CloudflareBindings,
  scope: HomeWidgetScope,
  linkId: string,
  input: { title?: string; url?: string }
) {
  const db = requireDatabase(env);
  if (isResponse(db)) {
    return db;
  }

  const fields: string[] = [];
  const values: unknown[] = [];

  if (typeof input.title === "string") {
    fields.push("title = ?");
    values.push(input.title.trim() || null);
  }

  if (typeof input.url === "string") {
    const url = normalizeUrl(input.url);
    if (!url) {
      return errorResponse(400, "INVALID_BODY", "URL is required.");
    }
    fields.push("url = ?");
    values.push(url);
  }

  if (fields.length === 0) {
    return errorResponse(400, "INVALID_BODY", "No valid quick link updates were provided.");
  }

  fields.push("updated_by_id = ?", "updated_at = ?");
  values.push(scope.userId, nowIso(), scope.workspaceId, scope.userId, linkId);

  try {
    const update = await db
      .prepare(
        `UPDATE workspace_user_links
         SET ${fields.join(", ")}
         WHERE workspace_id = ?
           AND owner_id = ?
           AND id = ?
           AND deleted_at IS NULL`
      )
      .bind(...values)
      .run();

    if (!update.meta.changes) {
      return errorResponse(404, "QUICK_LINK_NOT_FOUND", "Quick link not found.");
    }

    const row = await db
      .prepare(
        `SELECT id, workspace_id, owner_id, title, url, metadata, created_by_id, updated_by_id, created_at, updated_at
         FROM workspace_user_links
         WHERE id = ?
         LIMIT 1`
      )
      .bind(linkId)
      .first<QuickLinkRow>();

    if (!row) {
      return errorResponse(404, "QUICK_LINK_NOT_FOUND", "Quick link not found.");
    }

    return mapQuickLinkPayload(row, scope.workspaceSlug);
  } catch (error) {
    console.error("D1_WORKSPACE_QUICK_LINK_UPDATE_FAILED", error);
    return d1QueryFailed("quick-links");
  }
}

export async function deleteWorkspaceQuickLink(env: CloudflareBindings, scope: HomeWidgetScope, linkId: string) {
  const db = requireDatabase(env);
  if (isResponse(db)) {
    return db;
  }

  try {
    const result = await db
      .prepare(
        `UPDATE workspace_user_links
         SET deleted_at = ?, updated_at = ?, updated_by_id = ?
         WHERE workspace_id = ?
           AND owner_id = ?
           AND id = ?
           AND deleted_at IS NULL`
      )
      .bind(nowIso(), nowIso(), scope.userId, scope.workspaceId, scope.userId, linkId)
      .run();

    if (!result.meta.changes) {
      return errorResponse(404, "QUICK_LINK_NOT_FOUND", "Quick link not found.");
    }

    return null;
  } catch (error) {
    console.error("D1_WORKSPACE_QUICK_LINK_DELETE_FAILED", error);
    return d1QueryFailed("quick-links");
  }
}

async function mapRecentVisitEntityData(
  env: CloudflareBindings,
  workspaceId: string,
  row: RecentVisitRow
): Promise<Record<string, unknown> | null> {
  const entityName = row.entity_name.toLowerCase();
  const entityId = row.entity_identifier?.trim();
  if (!entityId) {
    return null;
  }

  if (entityName === "project") {
    const project = await getProjectInWorkspace(env, workspaceId, entityId);
    if (isResponse(project) || !project) {
      return null;
    }

    return {
      id: project.id,
      name: project.name,
      logo_props: parseLogoProps(project.logo_props),
      project_members: [],
      identifier: project.identifier,
    };
  }

  if (entityName === "issue") {
    const db = requireDatabase(env);
    if (isResponse(db)) {
      return null;
    }

    const issue = await db
      .prepare(
        `SELECT i.id, i.name, i.priority, i.state_id, i.sequence_id, i.project_id, p.identifier AS project_identifier
         FROM issues i
         JOIN projects p ON p.id = i.project_id
         WHERE i.id = ?
           AND i.workspace_id = ?
           AND i.deleted_at IS NULL
         LIMIT 1`
      )
      .bind(entityId, workspaceId)
      .first<{
        id: string;
        name: string;
        priority: string;
        state_id: string | null;
        sequence_id: number;
        project_id: string;
        project_identifier: string;
      }>();

    if (!issue) {
      return null;
    }

    return {
      id: issue.id,
      name: issue.name,
      state: issue.state_id ?? "",
      priority: issue.priority,
      assignees: [],
      type: null,
      sequence_id: issue.sequence_id,
      project_id: issue.project_id,
      project_identifier: issue.project_identifier,
      is_epic: false,
    };
  }

  return null;
}

export async function listWorkspaceRecentVisits(env: CloudflareBindings, scope: HomeWidgetScope, entityName?: string) {
  const db = requireDatabase(env);
  if (isResponse(db)) {
    return db;
  }

  const normalizedEntity = entityName?.trim().toLowerCase();

  try {
    const result = await db
      .prepare(
        `SELECT id, workspace_id, project_id, user_id, entity_name, entity_identifier, visited_at
         FROM user_recent_visits
         WHERE workspace_id = ?
           AND user_id = ?
           AND deleted_at IS NULL
           AND entity_name IN ('issue', 'page', 'project')
         ORDER BY visited_at DESC
         LIMIT 20`
      )
      .bind(scope.workspaceId, scope.userId)
      .all<RecentVisitRow>();

    const rows = (result.results ?? []).filter((row) => {
      if (!normalizedEntity) {
        return true;
      }

      return row.entity_name.toLowerCase() === normalizedEntity;
    });

    const visits = await Promise.all(
      rows.map(async (row) => {
        const entity_data = await mapRecentVisitEntityData(env, scope.workspaceId, row);
        return {
          id: row.id,
          entity_name: row.entity_name.toLowerCase(),
          entity_identifier: row.entity_identifier ?? "",
          visited_at: row.visited_at,
          entity_data,
        };
      })
    );

    return visits.filter((visit) => visit.entity_data !== null);
  } catch (error) {
    console.error("D1_WORKSPACE_RECENT_VISITS_READ_FAILED", error);
    return d1QueryFailed("recent-visits");
  }
}
