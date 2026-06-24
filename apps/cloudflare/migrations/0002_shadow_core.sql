CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  logo TEXT,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS workspaces_slug_active_idx
  ON workspaces (slug)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  identifier TEXT NOT NULL,
  network INTEGER NOT NULL DEFAULT 2,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS projects_identifier_workspace_active_idx
  ON projects (identifier, workspace_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS projects_workspace_active_idx
  ON projects (workspace_id, deleted_at);
