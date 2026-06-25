/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { CloudflareBindings } from "../types";
import { d1QueryFailed, isResponse, requireDatabase } from "./http";

type WorkspaceRow = {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  timezone: string;
  created_at: string;
  updated_at: string;
};

type ProjectRow = {
  id: string;
  workspace_id: string;
  name: string;
  identifier: string;
  network: number;
  created_at: string;
  updated_at: string;
};

type IssueRow = {
  id: string;
  project_id: string;
  workspace_id: string;
  name: string;
  description_html: string;
  priority: string;
  state_id: string | null;
  sequence_id: number;
  sort_order: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export async function getUserById(env: CloudflareBindings, userId: string) {
  const db = requireDatabase(env);
  if (isResponse(db)) {
    return db;
  }

  try {
    return await db
      .prepare(
        `SELECT id, email, display_name, first_name, last_name, avatar, is_active, is_bot, last_active, created_at, updated_at
         FROM users
         WHERE id = ? AND is_active = 1
         LIMIT 1`
      )
      .bind(userId)
      .first<{
        id: string;
        email: string;
        display_name: string | null;
        first_name: string | null;
        last_name: string | null;
        avatar: string | null;
        is_active: number;
        is_bot: number;
        last_active: string | null;
        created_at: string;
        updated_at: string;
      }>();
  } catch (error) {
    console.error("D1_USER_BY_ID_FAILED", error);
    return d1QueryFailed("users");
  }
}

export async function getUserWorkspaces(env: CloudflareBindings, userId: string) {
  const db = requireDatabase(env);
  if (isResponse(db)) {
    return db;
  }

  try {
    const result = await db
      .prepare(
        `SELECT
           w.id,
           w.name,
           w.slug,
           w.logo,
           w.timezone,
           w.created_at,
           w.updated_at,
           wm.role,
           (
             SELECT COUNT(*)
             FROM workspace_members wm2
             JOIN users u2 ON u2.id = wm2.member_id
             WHERE wm2.workspace_id = w.id
               AND wm2.is_active = 1
               AND u2.is_bot = 0
               AND u2.is_active = 1
           ) AS total_members
         FROM workspaces w
         JOIN workspace_members wm ON wm.workspace_id = w.id
         WHERE wm.member_id = ?
           AND wm.is_active = 1
           AND w.deleted_at IS NULL
         ORDER BY w.name COLLATE NOCASE ASC, w.created_at DESC`
      )
      .bind(userId)
      .all<WorkspaceRow & { role: number; total_members: number }>();

    return result.results;
  } catch (error) {
    console.error("D1_USER_WORKSPACES_FAILED", error);
    return d1QueryFailed("users-me-workspaces");
  }
}

export async function getWorkspaceBySlug(env: CloudflareBindings, slug: string, userId: string) {
  const db = requireDatabase(env);
  if (isResponse(db)) {
    return db;
  }

  try {
    return await db
      .prepare(
        `SELECT
           w.id,
           w.name,
           w.slug,
           w.logo,
           w.timezone,
           w.created_at,
           w.updated_at,
           wm.role
         FROM workspaces w
         JOIN workspace_members wm ON wm.workspace_id = w.id
         WHERE w.slug = ?
           AND w.deleted_at IS NULL
           AND wm.member_id = ?
           AND wm.is_active = 1
         LIMIT 1`
      )
      .bind(slug, userId)
      .first<WorkspaceRow & { role: number }>();
  } catch (error) {
    console.error("D1_WORKSPACE_BY_SLUG_FAILED", error);
    return d1QueryFailed("workspaces");
  }
}

export async function getWorkspaceProjects(env: CloudflareBindings, workspaceId: string) {
  const db = requireDatabase(env);
  if (isResponse(db)) {
    return db;
  }

  try {
    const result = await db
      .prepare(
        `SELECT id, workspace_id, name, identifier, network, created_at, updated_at
         FROM projects
         WHERE workspace_id = ?
           AND deleted_at IS NULL
         ORDER BY name COLLATE NOCASE ASC, created_at DESC`
      )
      .bind(workspaceId)
      .all<ProjectRow>();

    return result.results;
  } catch (error) {
    console.error("D1_WORKSPACE_PROJECTS_FAILED", error);
    return d1QueryFailed("projects");
  }
}

export async function getProjectInWorkspace(env: CloudflareBindings, workspaceId: string, projectId: string) {
  const db = requireDatabase(env);
  if (isResponse(db)) {
    return db;
  }

  try {
    return await db
      .prepare(
        `SELECT id, workspace_id, name, identifier, network, created_at, updated_at
         FROM projects
         WHERE id = ?
           AND workspace_id = ?
           AND deleted_at IS NULL
         LIMIT 1`
      )
      .bind(projectId, workspaceId)
      .first<ProjectRow>();
  } catch (error) {
    console.error("D1_PROJECT_IN_WORKSPACE_FAILED", error);
    return d1QueryFailed("projects");
  }
}

export async function listProjectIssues(env: CloudflareBindings, projectId: string) {
  const db = requireDatabase(env);
  if (isResponse(db)) {
    return db;
  }

  try {
    const result = await db
      .prepare(
        `SELECT id, project_id, workspace_id, name, description_html, priority, state_id, sequence_id, sort_order,
                created_by, updated_by, created_at, updated_at
         FROM issues
         WHERE project_id = ?
           AND deleted_at IS NULL
         ORDER BY sort_order ASC, sequence_id ASC`
      )
      .bind(projectId)
      .all<IssueRow>();

    return result.results;
  } catch (error) {
    console.error("D1_PROJECT_ISSUES_FAILED", error);
    return d1QueryFailed("issues");
  }
}

export async function getIssueInProject(env: CloudflareBindings, projectId: string, issueId: string) {
  const db = requireDatabase(env);
  if (isResponse(db)) {
    return db;
  }

  try {
    return await db
      .prepare(
        `SELECT id, project_id, workspace_id, name, description_html, priority, state_id, sequence_id, sort_order,
                created_by, updated_by, created_at, updated_at
         FROM issues
         WHERE id = ?
           AND project_id = ?
           AND deleted_at IS NULL
         LIMIT 1`
      )
      .bind(issueId, projectId)
      .first<IssueRow>();
  } catch (error) {
    console.error("D1_ISSUE_IN_PROJECT_FAILED", error);
    return d1QueryFailed("issues");
  }
}

export async function getNextIssueSequence(env: CloudflareBindings, projectId: string) {
  const db = requireDatabase(env);
  if (isResponse(db)) {
    return db;
  }

  try {
    const row = await db
      .prepare(`SELECT COALESCE(MAX(sequence_id), 0) AS max_sequence FROM issues WHERE project_id = ?`)
      .bind(projectId)
      .first<{ max_sequence: number }>();

    return (row?.max_sequence ?? 0) + 1;
  } catch (error) {
    console.error("D1_ISSUE_SEQUENCE_FAILED", error);
    return d1QueryFailed("issues");
  }
}

export function mapWorkspacePayload(
  row: WorkspaceRow & { role?: number; total_members?: number },
  extra: Record<string, unknown> = {}
) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    logo: row.logo,
    logo_url: row.logo,
    timezone: row.timezone,
    created_at: row.created_at,
    updated_at: row.updated_at,
    ...(row.role !== undefined ? { role: row.role } : {}),
    ...(row.total_members !== undefined ? { total_members: row.total_members } : {}),
    ...extra,
  };
}

export function mapProjectPayload(row: ProjectRow, options: { memberRole?: number } = {}) {
  return {
    id: row.id,
    name: row.name,
    identifier: row.identifier,
    workspace: row.workspace_id,
    network: row.network,
    member_role: options.memberRole ?? null,
    archived_at: null,
    sort_order: 0,
    logo_props: {},
    cycle_view: false,
    issue_views_view: false,
    module_view: false,
    page_view: true,
    inbox_view: false,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function mapIssuePayload(row: IssueRow) {
  return {
    id: row.id,
    project_id: row.project_id,
    workspace_id: row.workspace_id,
    name: row.name,
    description_html: row.description_html,
    priority: row.priority,
    state_id: row.state_id,
    sequence_id: row.sequence_id,
    sort_order: row.sort_order,
    created_by: row.created_by,
    updated_by: row.updated_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
