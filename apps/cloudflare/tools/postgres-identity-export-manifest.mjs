/**
 * Canonical Postgres export queries for Slice 1 identity import.
 */

export const POSTGRES_IDENTITY_EXPORT_QUERIES = {
  users: `SELECT
  u.id::text AS id,
  u.email,
  u.display_name,
  u.first_name,
  u.last_name,
  u.avatar,
  CASE WHEN u.is_active THEN 1 ELSE 0 END AS is_active,
  CASE WHEN u.is_bot THEN 1 ELSE 0 END AS is_bot,
  u.last_active::text AS last_active,
  u.created_at::text AS created_at,
  u.updated_at::text AS updated_at
FROM users u
WHERE u.is_bot = false
  AND (
    u.is_active = true
    OR EXISTS (
      SELECT 1
      FROM workspace_members wm
      WHERE wm.member_id = u.id
        AND wm.deleted_at IS NULL
        AND wm.is_active = true
    )
  )
ORDER BY u.created_at ASC;`,
  profiles: `SELECT
  p.user_id::text AS user_id,
  CASE WHEN p.is_onboarded THEN 1 ELSE 0 END AS is_onboarded,
  p.onboarding_step::text AS onboarding_step,
  CASE WHEN p.is_tour_completed THEN 1 ELSE 0 END AS is_tour_completed,
  p.created_at::text AS created_at,
  p.updated_at::text AS updated_at
FROM profiles p
JOIN users u ON u.id = p.user_id
WHERE u.is_bot = false
ORDER BY p.created_at ASC;`,
  workspace_members: `SELECT
  wm.id::text AS id,
  wm.workspace_id::text AS workspace_id,
  wm.member_id::text AS member_id,
  wm.role,
  CASE WHEN wm.is_active THEN 1 ELSE 0 END AS is_active,
  wm.created_at::text AS created_at,
  wm.updated_at::text AS updated_at
FROM workspace_members wm
JOIN users u ON u.id = wm.member_id
WHERE wm.deleted_at IS NULL
  AND wm.is_active = true
  AND u.is_bot = false
ORDER BY wm.created_at ASC;`,
  project_logo_props: `SELECT
  p.id::text AS id,
  COALESCE(p.logo_props::text, '{}') AS logo_props
FROM projects p
WHERE p.deleted_at IS NULL
ORDER BY p.created_at ASC;`,
};

export const KUBECTL_IDENTITY_EXPORT_PYTHON = `import json
import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "plane.settings.production")

import django

django.setup()

from django.db import connection

QUERIES = ${JSON.stringify(POSTGRES_IDENTITY_EXPORT_QUERIES, null, 2)}

payload = {}

with connection.cursor() as cursor:
    for key, sql in QUERIES.items():
        cursor.execute(sql)
        columns = [col[0] for col in cursor.description]
        payload[key] = [dict(zip(columns, row)) for row in cursor.fetchall()]

print(json.dumps(payload))
`;
