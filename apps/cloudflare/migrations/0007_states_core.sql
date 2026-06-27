-- Slice 4 project workflow states (required for imported issue state_id parity).

CREATE TABLE IF NOT EXISTS states (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL,
  "group" TEXT NOT NULL,
  sequence REAL NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

CREATE INDEX IF NOT EXISTS states_project_active_idx
  ON states (project_id, deleted_at);
