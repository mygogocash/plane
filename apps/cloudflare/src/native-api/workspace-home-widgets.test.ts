/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { D1Database, D1PreparedStatement } from "@cloudflare/workers-types";
import { describe, expect, it } from "vitest";

import type { CloudflareBindings } from "../types";
import {
  createWorkspaceQuickLink,
  deleteWorkspaceQuickLink,
  listWorkspaceQuickLinks,
  listWorkspaceRecentVisits,
} from "./workspace-home-widgets-db";

const WORKSPACE_ID = "workspace-1";
const USER_ID = "user-1";
const SLUG = "gogocash";

function createHomeWidgetsD1(): D1Database {
  const quickLinks: Array<{
    id: string;
    workspace_id: string;
    owner_id: string;
    title: string | null;
    url: string;
    metadata: string;
    created_by_id: string;
    updated_by_id: string;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
  }> = [];

  return {
    prepare(query: string) {
      const state = { args: [] as unknown[] };
      const statement = {
        bind(...args: unknown[]) {
          state.args = args;
          return statement;
        },
        async all<T>() {
          if (query.includes("FROM workspace_user_links")) {
            const [workspaceId, userId] = state.args as [string, string];
            return {
              results: quickLinks
                .filter((row) => row.workspace_id === workspaceId && row.owner_id === userId && row.deleted_at === null)
                .map((row) => ({
                  id: row.id,
                  workspace_id: row.workspace_id,
                  owner_id: row.owner_id,
                  title: row.title,
                  url: row.url,
                  metadata: row.metadata,
                  created_by_id: row.created_by_id,
                  updated_by_id: row.updated_by_id,
                  created_at: row.created_at,
                  updated_at: row.updated_at,
                })) as T[],
            };
          }

          if (query.includes("FROM user_recent_visits")) {
            return { results: [] as T[] };
          }

          return { results: [] as T[] };
        },
        async first<T>() {
          if (query.includes("FROM workspace_user_links") && query.includes("WHERE id = ?")) {
            const id = state.args[0] as string;
            const row = quickLinks.find((entry) => entry.id === id && entry.deleted_at === null);
            if (!row) {
              return null;
            }

            return {
              id: row.id,
              workspace_id: row.workspace_id,
              owner_id: row.owner_id,
              title: row.title,
              url: row.url,
              metadata: row.metadata,
              created_by_id: row.created_by_id,
              updated_by_id: row.updated_by_id,
              created_at: row.created_at,
              updated_at: row.updated_at,
            } as T;
          }

          return null;
        },
        async run() {
          if (query.includes("INSERT INTO workspace_user_links")) {
            const [id, workspaceId, ownerId, title, url, createdById, updatedById, createdAt, updatedAt] =
              state.args as [string, string, string, string | null, string, string, string, string, string];

            quickLinks.push({
              id,
              workspace_id: workspaceId,
              owner_id: ownerId,
              title,
              url,
              metadata: "{}",
              created_by_id: createdById,
              updated_by_id: updatedById,
              created_at: createdAt,
              updated_at: updatedAt,
              deleted_at: null,
            });

            return { success: true, meta: { changes: 1 } };
          }

          if (query.includes("UPDATE workspace_user_links") && query.includes("deleted_at = ?")) {
            const [deletedAt, updatedAt, updatedById, workspaceId, ownerId, id] = state.args as [
              string,
              string,
              string,
              string,
              string,
              string,
            ];
            const row = quickLinks.find(
              (entry) =>
                entry.id === id &&
                entry.workspace_id === workspaceId &&
                entry.owner_id === ownerId &&
                entry.deleted_at === null
            );

            if (!row) {
              return { success: true, meta: { changes: 0 } };
            }

            row.deleted_at = deletedAt;
            row.updated_at = updatedAt;
            row.updated_by_id = updatedById;
            return { success: true, meta: { changes: 1 } };
          }

          return { success: true, meta: { changes: 0 } };
        },
      };

      return statement as unknown as D1PreparedStatement;
    },
  } as unknown as D1Database;
}

describe("workspace home widgets db", () => {
  const env = { MANUT_DB: createHomeWidgetsD1() } as CloudflareBindings;
  const scope = { workspaceId: WORKSPACE_ID, userId: USER_ID, workspaceSlug: SLUG };

  it("creates, lists, and deletes quick links", async () => {
    const created = await createWorkspaceQuickLink(env, scope, {
      title: "Docs",
      url: "docs.example.com",
    });
    expect(created).toMatchObject({
      title: "Docs",
      url: "http://docs.example.com",
      workspace_slug: SLUG,
    });

    const links = await listWorkspaceQuickLinks(env, scope);
    expect(links).toHaveLength(1);

    const deleted = await deleteWorkspaceQuickLink(env, scope, (created as { id: string }).id);
    expect(deleted).toBeNull();

    const afterDelete = await listWorkspaceQuickLinks(env, scope);
    expect(afterDelete).toHaveLength(0);
  });

  it("returns an empty recent visits list when no visits exist", async () => {
    const visits = await listWorkspaceRecentVisits(env, scope);
    expect(visits).toEqual([]);
  });
});
