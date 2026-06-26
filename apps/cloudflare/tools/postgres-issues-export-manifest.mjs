/**
 * Canonical Postgres export query for Slice 4 issue import.
 */

export const POSTGRES_ISSUES_EXPORT_QUERY = `SELECT
  i.id::text AS id,
  i.project_id::text AS project_id,
  i.workspace_id::text AS workspace_id,
  i.name,
  COALESCE(i.description_html, '<p></p>') AS description_html,
  COALESCE(i.priority, 'none') AS priority,
  i.state_id::text AS state_id,
  i.sequence_id,
  i.sort_order,
  i.created_by::text AS created_by,
  i.updated_by::text AS updated_by,
  i.deleted_at::text AS deleted_at,
  i.created_at::text AS created_at,
  i.updated_at::text AS updated_at
FROM issues i
JOIN projects p ON p.id = i.project_id
WHERE i.deleted_at IS NULL
  AND p.deleted_at IS NULL
ORDER BY i.created_at ASC;`;

export const KUBECTL_ISSUES_EXPORT_PYTHON = `import json
import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "plane.settings.production")

import django

django.setup()

from django.db import connection

SQL = ${JSON.stringify(POSTGRES_ISSUES_EXPORT_QUERY)}

with connection.cursor() as cursor:
    cursor.execute(SQL)
    columns = [column[0] for column in cursor.description]
    issues = [dict(zip(columns, row)) for row in cursor.fetchall()]

print(json.dumps({"issues": issues}))
`;
