-- Bootstrap canonical GoGoCash workspace row for identity import joins.
-- Identity import writes workspace_members before guaranteeing workspace rows exist.

INSERT OR REPLACE INTO workspaces (
  id,
  name,
  slug,
  logo,
  timezone,
  deleted_at,
  created_at,
  updated_at
) VALUES (
  'c0c5b239-912f-4397-966d-7d6c5b40f415',
  'GoGoCash',
  'gogocash',
  NULL,
  'Asia/Bangkok',
  NULL,
  '2026-06-05 13:32:13.644501+00',
  '2026-06-05 13:32:43.730545+00'
);
