-- Workspace home widgets: quick links and recent visits.

CREATE TABLE IF NOT EXISTS workspace_user_links (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  title TEXT,
  url TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_by_id TEXT,
  updated_by_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (owner_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS workspace_user_links_workspace_owner_active_idx
  ON workspace_user_links (workspace_id, owner_id, deleted_at);

CREATE TABLE IF NOT EXISTS user_recent_visits (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  project_id TEXT,
  user_id TEXT NOT NULL,
  entity_name TEXT NOT NULL,
  entity_identifier TEXT,
  visited_at TEXT NOT NULL,
  created_by_id TEXT,
  updated_by_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS user_recent_visits_workspace_user_active_idx
  ON user_recent_visits (workspace_id, user_id, deleted_at, visited_at);
