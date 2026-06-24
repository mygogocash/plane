/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { CloudflareBindings } from "./types";

type D1WorkspaceRow = {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  timezone: string;
  created_at: string;
  updated_at: string;
};

type D1ProjectRow = {
  id: string;
  workspace_id: string;
  name: string;
  identifier: string;
  network: number;
  created_at: string;
  updated_at: string;
};

function d1Missing(domain: string): Response {
  return Response.json(
    {
      error: "D1_BINDING_MISSING",
      message: "The MANUT_DB D1 binding is required for Cloudflare shadow reads.",
      domain,
    },
    { status: 503 }
  );
}

function d1QueryFailed(domain: string): Response {
  return Response.json(
    {
      error: "D1_QUERY_FAILED",
      message: "The D1 shadow read query failed.",
      domain,
    },
    { status: 500 }
  );
}

function normalizeLimit(value: string | null, fallback: number, max: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, max);
}

function mapWorkspace(row: D1WorkspaceRow) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    logo_url: row.logo,
    timezone: row.timezone,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapProject(row: D1ProjectRow) {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    name: row.name,
    identifier: row.identifier,
    network: row.network,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function handleD1WorkspacesRequest(request: Request, env: CloudflareBindings): Promise<Response> {
  if (!env.MANUT_DB) {
    return d1Missing("workspaces");
  }

  const limit = normalizeLimit(new URL(request.url).searchParams.get("limit"), 100, 500);

  try {
    const result = await env.MANUT_DB.prepare(
      `SELECT id, name, slug, logo, timezone, created_at, updated_at
       FROM workspaces
       WHERE deleted_at IS NULL
       ORDER BY name COLLATE NOCASE ASC, created_at DESC
       LIMIT ?`
    )
      .bind(limit)
      .all<D1WorkspaceRow>();

    return Response.json({
      status: "shadow",
      source: "d1",
      domain: "workspaces",
      cutover_ready: false,
      count: result.results.length,
      workspaces: result.results.map(mapWorkspace),
    });
  } catch (error) {
    console.error("D1_WORKSPACES_QUERY_FAILED", error);
    return d1QueryFailed("workspaces");
  }
}

export async function handleD1WorkspaceProjectsRequest(
  request: Request,
  env: CloudflareBindings,
  workspaceSlug: string
): Promise<Response> {
  if (!env.MANUT_DB) {
    return d1Missing("projects");
  }

  const limit = normalizeLimit(new URL(request.url).searchParams.get("limit"), 100, 500);

  try {
    const workspace = await env.MANUT_DB.prepare(
      `SELECT id, slug
       FROM workspaces
       WHERE slug = ? AND deleted_at IS NULL
       LIMIT 1`
    )
      .bind(workspaceSlug)
      .first<{ id: string; slug: string }>();

    if (!workspace) {
      return Response.json(
        {
          error: "D1_WORKSPACE_NOT_FOUND",
          message: "No active D1 workspace exists for the requested slug.",
          workspace_slug: workspaceSlug,
        },
        { status: 404 }
      );
    }

    const result = await env.MANUT_DB.prepare(
      `SELECT p.id, p.workspace_id, p.name, p.identifier, p.network, p.created_at, p.updated_at
       FROM projects p
       JOIN workspaces w ON w.id = p.workspace_id
       WHERE w.slug = ? AND w.deleted_at IS NULL AND p.deleted_at IS NULL
       ORDER BY p.name COLLATE NOCASE ASC, p.created_at DESC
       LIMIT ?`
    )
      .bind(workspaceSlug, limit)
      .all<D1ProjectRow>();

    return Response.json({
      status: "shadow",
      source: "d1",
      domain: "projects",
      cutover_ready: false,
      workspace_id: workspace.id,
      workspace_slug: workspace.slug,
      count: result.results.length,
      projects: result.results.map(mapProject),
    });
  } catch (error) {
    console.error("D1_PROJECTS_QUERY_FAILED", error);
    return d1QueryFailed("projects");
  }
}
