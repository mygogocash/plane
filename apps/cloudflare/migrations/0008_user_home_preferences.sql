-- Per-user workspace sidebar pins and home dashboard widget preferences.

CREATE TABLE IF NOT EXISTS workspace_user_preferences (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  is_pinned INTEGER NOT NULL DEFAULT 0,
  sort_order REAL NOT NULL DEFAULT 65535,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE (workspace_id, user_id, key)
);

CREATE INDEX IF NOT EXISTS idx_workspace_user_preferences_lookup
  ON workspace_user_preferences (workspace_id, user_id);

CREATE TABLE IF NOT EXISTS workspace_home_preferences (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  sort_order REAL NOT NULL DEFAULT 65535,
  config TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE (workspace_id, user_id, key)
);

CREATE INDEX IF NOT EXISTS idx_workspace_home_preferences_lookup
  ON workspace_home_preferences (workspace_id, user_id);
