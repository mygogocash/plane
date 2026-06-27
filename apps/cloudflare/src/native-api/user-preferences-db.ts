/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { CloudflareBindings } from "../types";
import {
  buildDefaultHomeWidgetPreferences,
  buildDefaultSidebarPreferences,
  HOME_WIDGET_KEYS,
  SIDEBAR_PREFERENCE_KEYS,
  type HomeWidgetPreferenceRow,
  type SidebarPreferenceRow,
} from "./default-user-preferences";
import { d1QueryFailed, newUuid, nowIso, requireDatabase, isResponse } from "./http";

type PreferenceScope = {
  workspaceId: string;
  userId: string;
};

export async function getSidebarPreferences(env: CloudflareBindings, scope: PreferenceScope) {
  const db = requireDatabase(env);
  if (isResponse(db)) {
    return db;
  }

  try {
    await ensureSidebarPreferenceRows(db, scope);

    const result = await db
      .prepare(
        `SELECT key, is_pinned, sort_order
         FROM workspace_user_preferences
         WHERE workspace_id = ?
           AND user_id = ?
           AND deleted_at IS NULL
         ORDER BY sort_order ASC`
      )
      .bind(scope.workspaceId, scope.userId)
      .all<{ key: string; is_pinned: number; sort_order: number }>();

    const preferences: Record<string, SidebarPreferenceRow> = {};
    for (const row of result.results ?? []) {
      preferences[row.key] = {
        key: row.key,
        is_pinned: Boolean(row.is_pinned),
        sort_order: row.sort_order,
      };
    }

    return preferences;
  } catch (error) {
    console.error("D1_SIDEBAR_PREFERENCES_READ_FAILED", error);
    return d1QueryFailed("sidebar-preferences");
  }
}

export async function patchSidebarPreferences(
  env: CloudflareBindings,
  scope: PreferenceScope,
  updates: Array<{ key: string; is_pinned?: boolean; sort_order?: number }>
) {
  const db = requireDatabase(env);
  if (isResponse(db)) {
    return db;
  }

  try {
    await ensureSidebarPreferenceRows(db, scope);

    await Promise.all(
      updates.map(async (update) => {
        const key = update.key?.trim();
        if (!key) {
          return;
        }

        const fields: string[] = [];
        const values: unknown[] = [];

        if (typeof update.is_pinned === "boolean") {
          fields.push("is_pinned = ?");
          values.push(update.is_pinned ? 1 : 0);
        }

        if (typeof update.sort_order === "number" && Number.isFinite(update.sort_order)) {
          fields.push("sort_order = ?");
          values.push(update.sort_order);
        }

        if (fields.length === 0) {
          return;
        }

        fields.push("updated_at = ?");
        values.push(nowIso());
        values.push(scope.workspaceId, scope.userId, key);

        await db
          .prepare(
            `UPDATE workspace_user_preferences
             SET ${fields.join(", ")}
             WHERE workspace_id = ?
               AND user_id = ?
               AND key = ?
               AND deleted_at IS NULL`
          )
          .bind(...values)
          .run();
      })
    );

    return await getSidebarPreferences(env, scope);
  } catch (error) {
    console.error("D1_SIDEBAR_PREFERENCES_PATCH_FAILED", error);
    return d1QueryFailed("sidebar-preferences");
  }
}

export async function getHomeWidgetPreferences(env: CloudflareBindings, scope: PreferenceScope) {
  const db = requireDatabase(env);
  if (isResponse(db)) {
    return db;
  }

  try {
    await ensureHomeWidgetPreferenceRows(db, scope);

    const result = await db
      .prepare(
        `SELECT key, is_enabled, sort_order, config
         FROM workspace_home_preferences
         WHERE workspace_id = ?
           AND user_id = ?
           AND deleted_at IS NULL
         ORDER BY sort_order DESC`
      )
      .bind(scope.workspaceId, scope.userId)
      .all<{ key: string; is_enabled: number; sort_order: number; config: string }>();

    return (result.results ?? []).map((row) => mapHomeWidgetRow(row));
  } catch (error) {
    console.error("D1_HOME_PREFERENCES_READ_FAILED", error);
    return d1QueryFailed("home-preferences");
  }
}

export async function patchHomeWidgetPreference(
  env: CloudflareBindings,
  scope: PreferenceScope,
  key: string,
  update: { is_enabled?: boolean; sort_order?: number; config?: Record<string, unknown> }
) {
  const db = requireDatabase(env);
  if (isResponse(db)) {
    return db;
  }

  try {
    await ensureHomeWidgetPreferenceRows(db, scope);

    const fields: string[] = [];
    const values: unknown[] = [];

    if (typeof update.is_enabled === "boolean") {
      fields.push("is_enabled = ?");
      values.push(update.is_enabled ? 1 : 0);
    }

    if (typeof update.sort_order === "number" && Number.isFinite(update.sort_order)) {
      fields.push("sort_order = ?");
      values.push(update.sort_order);
    }

    if (update.config && typeof update.config === "object") {
      fields.push("config = ?");
      values.push(JSON.stringify(update.config));
    }

    if (fields.length === 0) {
      return errorPreferenceNotFound();
    }

    fields.push("updated_at = ?");
    values.push(nowIso());
    values.push(scope.workspaceId, scope.userId, key);

    const result = await db
      .prepare(
        `UPDATE workspace_home_preferences
         SET ${fields.join(", ")}
         WHERE workspace_id = ?
           AND user_id = ?
           AND key = ?
           AND deleted_at IS NULL`
      )
      .bind(...values)
      .run();

    if (!result.success || result.meta.changes === 0) {
      return errorPreferenceNotFound();
    }

    const row = await db
      .prepare(
        `SELECT key, is_enabled, sort_order, config
         FROM workspace_home_preferences
         WHERE workspace_id = ?
           AND user_id = ?
           AND key = ?
           AND deleted_at IS NULL
         LIMIT 1`
      )
      .bind(scope.workspaceId, scope.userId, key)
      .first<{ key: string; is_enabled: number; sort_order: number; config: string }>();

    if (!row) {
      return errorPreferenceNotFound();
    }

    return mapHomeWidgetRow(row);
  } catch (error) {
    console.error("D1_HOME_PREFERENCES_PATCH_FAILED", error);
    return d1QueryFailed("home-preferences");
  }
}

function mapHomeWidgetRow(row: {
  key: string;
  is_enabled: number;
  sort_order: number;
  config: string;
}): HomeWidgetPreferenceRow {
  let config: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(row.config);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      config = parsed as Record<string, unknown>;
    }
  } catch {
    config = {};
  }

  return {
    key: row.key,
    is_enabled: Boolean(row.is_enabled),
    sort_order: row.sort_order,
    config,
  };
}

function errorPreferenceNotFound(): Response {
  return Response.json({ detail: "Preference not found" }, { status: 400 });
}

async function ensureSidebarPreferenceRows(db: D1Database, scope: PreferenceScope) {
  const defaults = buildDefaultSidebarPreferences();
  const timestamp = nowIso();

  await Promise.all(
    SIDEBAR_PREFERENCE_KEYS.map((key) => {
      const defaultRow = defaults[key];

      return db
        .prepare(
          `INSERT INTO workspace_user_preferences (
             id, workspace_id, user_id, key, is_pinned, sort_order, created_at, updated_at
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(workspace_id, user_id, key) DO NOTHING`
        )
        .bind(
          newUuid(),
          scope.workspaceId,
          scope.userId,
          key,
          defaultRow.is_pinned ? 1 : 0,
          defaultRow.sort_order,
          timestamp,
          timestamp
        )
        .run();
    })
  );
}

async function ensureHomeWidgetPreferenceRows(db: D1Database, scope: PreferenceScope) {
  const defaults = buildDefaultHomeWidgetPreferences();
  const timestamp = nowIso();

  await Promise.all(
    defaults.map((widget) =>
      db
        .prepare(
          `INSERT INTO workspace_home_preferences (
             id, workspace_id, user_id, key, is_enabled, sort_order, config, created_at, updated_at
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(workspace_id, user_id, key) DO NOTHING`
        )
        .bind(
          newUuid(),
          scope.workspaceId,
          scope.userId,
          widget.key,
          widget.is_enabled ? 1 : 0,
          widget.sort_order,
          JSON.stringify(widget.config),
          timestamp,
          timestamp
        )
        .run()
    )
  );

  const missingKeys = await Promise.all(
    HOME_WIDGET_KEYS.map(async (key) => {
      const exists = await db
        .prepare(
          `SELECT 1
           FROM workspace_home_preferences
           WHERE workspace_id = ?
             AND user_id = ?
             AND key = ?
             AND deleted_at IS NULL
           LIMIT 1`
        )
        .bind(scope.workspaceId, scope.userId, key)
        .first();

      return exists ? null : key;
    })
  );

  await Promise.all(
    missingKeys
      .filter((key): key is string => key !== null)
      .map((key) => {
        const fallback = defaults.find((widget) => widget.key === key);
        if (!fallback) {
          return Promise.resolve();
        }

        return db
          .prepare(
            `INSERT INTO workspace_home_preferences (
               id, workspace_id, user_id, key, is_enabled, sort_order, config, created_at, updated_at
             )
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            newUuid(),
            scope.workspaceId,
            scope.userId,
            fallback.key,
            fallback.is_enabled ? 1 : 0,
            fallback.sort_order,
            JSON.stringify(fallback.config),
            timestamp,
            timestamp
          )
          .run();
      })
  );
}
