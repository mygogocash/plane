/**
 * Canonical Postgres export query for project states import.
 */

export const POSTGRES_STATES_EXPORT_QUERY = `SELECT
  s.id::text AS id,
  s.project_id::text AS project_id,
  s.workspace_id::text AS workspace_id,
  s.name,
  COALESCE(s.description, '') AS description,
  s.color,
  s."group",
  s.sequence,
  CASE WHEN s."default" THEN 1 ELSE 0 END AS default,
  s.deleted_at::text AS deleted_at,
  s.created_at::text AS created_at,
  s.updated_at::text AS updated_at
FROM states s
JOIN projects p ON p.id = s.project_id
WHERE s.deleted_at IS NULL
  AND p.deleted_at IS NULL
ORDER BY s.created_at ASC;`;
