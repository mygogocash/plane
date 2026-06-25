-- Slice 1 identity tables (schema only; import via Postgres → D1 pipeline).
-- Minimal columns for GET /api/users/me/ and GET /api/users/me/workspaces/ parity.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT,
  first_name TEXT,
  last_name TEXT,
  avatar TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  is_bot INTEGER NOT NULL DEFAULT 0,
  last_active TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_active_idx
  ON users (email)
  WHERE is_active = 1;

CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY NOT NULL,
  is_onboarded INTEGER NOT NULL DEFAULT 0,
  onboarding_step TEXT,
  is_tour_completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS workspace_members (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  role INTEGER NOT NULL DEFAULT 15,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (member_id) REFERENCES users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS workspace_members_workspace_member_active_idx
  ON workspace_members (workspace_id, member_id)
  WHERE is_active = 1;

CREATE INDEX IF NOT EXISTS workspace_members_member_active_idx
  ON workspace_members (member_id, is_active);
