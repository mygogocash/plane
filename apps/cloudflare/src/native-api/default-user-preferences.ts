/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type SidebarPreferenceRow = {
  key: string;
  is_pinned: boolean;
  sort_order: number;
};

export type HomeWidgetPreferenceRow = {
  key: string;
  is_enabled: boolean;
  sort_order: number;
  config: Record<string, unknown>;
};

/** Keys aligned with Plane `WorkspaceUserPreference.UserPreferenceKeys` plus CE sidebar items. */
export const SIDEBAR_PREFERENCE_KEYS = [
  "views",
  "active_cycles",
  "initiatives",
  "analytics",
  "archives",
  "drafts",
  "your_work",
  "stickies",
  "ai_chat",
] as const;

const DEFAULT_PINNED_SIDEBAR_KEYS = new Set(["drafts", "your_work", "stickies"]);

export function buildDefaultSidebarPreferences(): Record<string, SidebarPreferenceRow> {
  const preferences: Record<string, SidebarPreferenceRow> = {};

  SIDEBAR_PREFERENCE_KEYS.forEach((key, index) => {
    preferences[key] = {
      key,
      is_pinned: DEFAULT_PINNED_SIDEBAR_KEYS.has(key),
      sort_order: 65535 + index * 10000,
    };
  });

  return preferences;
}

/** Keys auto-created by Plane home bootstrap (excludes quick_tutorial / new_at_plane). */
export const HOME_WIDGET_KEYS = ["quick_links", "recents", "my_stickies"] as const;

export function buildDefaultHomeWidgetPreferences(): HomeWidgetPreferenceRow[] {
  return [
    { key: "quick_links", is_enabled: true, sort_order: 999, config: {} },
    { key: "recents", is_enabled: true, sort_order: 998, config: {} },
    { key: "my_stickies", is_enabled: true, sort_order: 997, config: {} },
  ];
}
