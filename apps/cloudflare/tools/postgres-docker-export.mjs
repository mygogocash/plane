/**
 * Export JSON payloads from a local Docker Postgres container via psql.
 */

import { execFileSync } from "node:child_process";

export function exportJsonObjectFromDockerPostgres(
  { container = "plane-db", user = "plane", database = "plane", query },
  { maxBuffer = 100 * 1024 * 1024 } = {}
) {
  const wrappedQuery = `SELECT json_build_object('rows', COALESCE(json_agg(row_to_json(t)), '[]'::json)) FROM (${query}) t;`;

  const stdout = execFileSync(
    "docker",
    ["exec", container, "psql", "-U", user, "-d", database, "-t", "-A", "-c", wrappedQuery],
    { encoding: "utf8", maxBuffer }
  );

  const trimmed = stdout.trim();
  if (!trimmed) {
    return { rows: [] };
  }

  const parsed = JSON.parse(trimmed);
  return {
    rows: Array.isArray(parsed.rows) ? parsed.rows : [],
  };
}
