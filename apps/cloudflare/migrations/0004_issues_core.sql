-- Slice 4 issue table (minimal columns for authenticated smoke CRUD).

CREATE TABLE IF NOT EXISTS issues (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description_html TEXT NOT NULL DEFAULT '<p></p>',
  priority TEXT NOT NULL DEFAULT 'none',
  state_id TEXT,
  sequence_id INTEGER NOT NULL DEFAULT 1,
  sort_order REAL NOT NULL DEFAULT 65535,
  created_by TEXT,
  updated_by TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

CREATE INDEX IF NOT EXISTS issues_project_active_idx
  ON issues (project_id, deleted_at);

CREATE INDEX IF NOT EXISTS issues_workspace_active_idx
  ON issues (workspace_id, deleted_at);

CREATE TABLE IF NOT EXISTS file_assets (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT,
  project_id TEXT,
  entity_type TEXT NOT NULL,
  entity_identifier TEXT,
  attributes TEXT NOT NULL DEFAULT '{}',
  storage_key TEXT NOT NULL,
  created_by TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS file_assets_workspace_active_idx
  ON file_assets (workspace_id, deleted_at);
