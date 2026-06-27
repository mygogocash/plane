/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";

import { buildDefaultHomeWidgetPreferences, buildDefaultSidebarPreferences } from "./default-user-preferences";
import {
  getSidebarPreferences,
  patchSidebarPreferences,
  getHomeWidgetPreferences,
  patchHomeWidgetPreference,
} from "./user-preferences-db";
import type { CloudflareBindings } from "../types";

const WORKSPACE_ID = "workspace-1";
const USER_ID = "user-1";

type SidebarRow = {
  workspace_id: string;
  user_id: string;
  key: string;
  is_pinned: number;
  sort_order: number;
  deleted_at: string | null;
};

type HomeRow = {
  workspace_id: string;
  user_id: string;
  key: string;
  is_enabled: number;
  sort_order: number;
  config: string;
  deleted_at: string | null;
};

function createPreferenceD1() {
  const sidebarRows: SidebarRow[] = [];
  const homeRows: HomeRow[] = [];

  const db = {
    prepare(query: string) {
      const state = { args: [] as unknown[] };
      const api = {
        bind(...args: unknown[]) {
          state.args = args;
          return api;
        },
        async all<T>() {
          if (query.includes("FROM workspace_user_preferences")) {
            const [workspaceId, userId] = state.args as [string, string];
            const results = sidebarRows
              .filter((row) => row.workspace_id === workspaceId && row.user_id === userId && row.deleted_at === null)
              .map((row) => ({
                key: row.key,
                is_pinned: row.is_pinned,
                sort_order: row.sort_order,
              }));
            return { results: results as T[] };
          }

          if (query.includes("FROM workspace_home_preferences")) {
            const [workspaceId, userId] = state.args as [string, string];
            const results = homeRows
              .filter((row) => row.workspace_id === workspaceId && row.user_id === userId && row.deleted_at === null)
              .map((row) => ({
                key: row.key,
                is_enabled: row.is_enabled,
                sort_order: row.sort_order,
                config: row.config,
              }));
            return { results: results as T[] };
          }

          return { results: [] as T[] };
        },
        async first<T>() {
          if (query.includes("FROM workspace_home_preferences") && query.includes("LIMIT 1")) {
            const [workspaceId, userId, key] = state.args as [string, string, string];
            const row = homeRows.find(
              (entry) =>
                entry.workspace_id === workspaceId &&
                entry.user_id === userId &&
                entry.key === key &&
                entry.deleted_at === null
            );
            return (
              row
                ? {
                    key: row.key,
                    is_enabled: row.is_enabled,
                    sort_order: row.sort_order,
                    config: row.config,
                  }
                : null
            ) as T | null;
          }

          if (query.includes("FROM workspace_home_preferences") && query.includes("SELECT 1")) {
            const [workspaceId, userId, key] = state.args as [string, string, string];
            const exists = homeRows.some(
              (entry) =>
                entry.workspace_id === workspaceId &&
                entry.user_id === userId &&
                entry.key === key &&
                entry.deleted_at === null
            );
            return (exists ? { ok: 1 } : null) as T | null;
          }

          return null;
        },
        async run() {
          if (query.includes("INSERT INTO workspace_user_preferences")) {
            const [_id, workspaceId, userId, key, isPinned, sortOrder] = state.args as [
              string,
              string,
              string,
              string,
              number,
              number,
              string,
              string,
            ];
            const exists = sidebarRows.some(
              (row) => row.workspace_id === workspaceId && row.user_id === userId && row.key === key
            );
            if (!exists) {
              sidebarRows.push({
                workspace_id: workspaceId,
                user_id: userId,
                key,
                is_pinned: isPinned,
                sort_order: sortOrder,
                deleted_at: null,
              });
            }
            return { success: true, meta: { changes: exists ? 0 : 1 } };
          }

          if (query.includes("UPDATE workspace_user_preferences")) {
            const workspaceId = state.args[state.args.length - 3] as string;
            const userId = state.args[state.args.length - 2] as string;
            const key = state.args[state.args.length - 1] as string;
            const row = sidebarRows.find(
              (entry) =>
                entry.workspace_id === workspaceId &&
                entry.user_id === userId &&
                entry.key === key &&
                entry.deleted_at === null
            );
            if (!row) {
              return { success: true, meta: { changes: 0 } };
            }

            if (query.includes("is_pinned = ?")) {
              row.is_pinned = state.args[0] as number;
            }
            if (query.includes("sort_order = ?")) {
              const sortIndex = query.includes("is_pinned = ?") ? 1 : 0;
              row.sort_order = state.args[sortIndex] as number;
            }

            return { success: true, meta: { changes: 1 } };
          }

          if (query.includes("INSERT INTO workspace_home_preferences")) {
            const workspaceId = state.args[1] as string;
            const userId = state.args[2] as string;
            const key = state.args[3] as string;
            const exists = homeRows.some(
              (row) => row.workspace_id === workspaceId && row.user_id === userId && row.key === key
            );
            if (!exists) {
              homeRows.push({
                workspace_id: workspaceId,
                user_id: userId,
                key,
                is_enabled: state.args[4] as number,
                sort_order: state.args[5] as number,
                config: state.args[6] as string,
                deleted_at: null,
              });
            }
            return { success: true, meta: { changes: exists ? 0 : 1 } };
          }

          if (query.includes("UPDATE workspace_home_preferences")) {
            const workspaceId = state.args[state.args.length - 3] as string;
            const userId = state.args[state.args.length - 2] as string;
            const key = state.args[state.args.length - 1] as string;
            const row = homeRows.find(
              (entry) =>
                entry.workspace_id === workspaceId &&
                entry.user_id === userId &&
                entry.key === key &&
                entry.deleted_at === null
            );
            if (!row) {
              return { success: true, meta: { changes: 0 } };
            }

            if (query.includes("is_enabled = ?")) {
              row.is_enabled = state.args[0] as number;
            }
            if (query.includes("sort_order = ?")) {
              const sortIndex = query.includes("is_enabled = ?") ? 1 : 0;
              row.sort_order = state.args[sortIndex] as number;
            }

            return { success: true, meta: { changes: 1 } };
          }

          return { success: true, meta: { changes: 0 } };
        },
      };

      return api;
    },
  } as unknown as D1Database;

  return { db, sidebarRows, homeRows };
}

describe("user preference defaults", () => {
  it("pins personal sidebar items by default", () => {
    const defaults = buildDefaultSidebarPreferences();
    expect(defaults.views.is_pinned).toBe(false);
    expect(defaults.initiatives.is_pinned).toBe(false);
    expect(defaults.drafts.is_pinned).toBe(true);
    expect(defaults.your_work.is_pinned).toBe(true);
    expect(defaults.stickies.is_pinned).toBe(true);
  });

  it("enables core home widgets by default", () => {
    const widgets = buildDefaultHomeWidgetPreferences();
    expect(widgets.map((widget) => widget.key)).toEqual(["quick_links", "recents", "my_stickies"]);
    expect(widgets.every((widget) => widget.is_enabled)).toBe(true);
  });
});

describe("user preference persistence", () => {
  it("creates defaults and persists sidebar pin toggles", async () => {
    const { db } = createPreferenceD1();
    const env = { MANUT_DB: db } satisfies CloudflareBindings;
    const scope = { workspaceId: WORKSPACE_ID, userId: USER_ID };

    const initial = await getSidebarPreferences(env, scope);
    expect(initial.views?.is_pinned).toBe(false);

    await patchSidebarPreferences(env, scope, [
      { key: "views", is_pinned: true, sort_order: initial.views.sort_order },
    ]);

    const updated = await getSidebarPreferences(env, scope);
    expect(updated.views?.is_pinned).toBe(true);
  });

  it("creates defaults and persists home widget toggles", async () => {
    const { db } = createPreferenceD1();
    const env = { MANUT_DB: db } satisfies CloudflareBindings;
    const scope = { workspaceId: WORKSPACE_ID, userId: USER_ID };

    const initial = await getHomeWidgetPreferences(env, scope);
    expect(initial.find((widget) => widget.key === "quick_links")?.is_enabled).toBe(true);

    const patched = await patchHomeWidgetPreference(env, scope, "quick_links", { is_enabled: false });
    expect(patched).toMatchObject({ key: "quick_links", is_enabled: false });

    const updated = await getHomeWidgetPreferences(env, scope);
    expect(updated.find((widget) => widget.key === "quick_links")?.is_enabled).toBe(false);
  });
});
