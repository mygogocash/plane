CREATE TABLE IF NOT EXISTS instance_config (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS migration_audit (
  id TEXT PRIMARY KEY NOT NULL,
  source TEXT NOT NULL,
  target TEXT NOT NULL,
  status TEXT NOT NULL,
  source_count INTEGER,
  target_count INTEGER,
  checksum TEXT,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS upload_object_audit (
  object_key TEXT PRIMARY KEY NOT NULL,
  source_bucket TEXT NOT NULL,
  target_bucket TEXT NOT NULL,
  source_etag TEXT,
  target_etag TEXT,
  size_bytes INTEGER,
  status TEXT NOT NULL,
  checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS job_audit (
  id TEXT PRIMARY KEY NOT NULL,
  queue_name TEXT NOT NULL,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  payload TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO instance_config (key, value)
VALUES
  ('name', 'Manut'),
  ('deployment_target', 'cloudflare-foundation'),
  ('current_version', 'cloudflare-preview');
