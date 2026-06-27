/**
 * Build SQLite INSERT statements for project states import.
 */

function sqlLiteral(value) {
  if (value === null || value === undefined) {
    return "NULL";
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }

  return `'${String(value).replace(/'/g, "''")}'`;
}

export function buildStateInsert(row) {
  return `INSERT OR REPLACE INTO states (
  id, project_id, workspace_id, name, description, color, "group", sequence, is_default,
  deleted_at, created_at, updated_at
) VALUES (
  ${sqlLiteral(row.id)},
  ${sqlLiteral(row.project_id)},
  ${sqlLiteral(row.workspace_id)},
  ${sqlLiteral(row.name)},
  ${sqlLiteral(row.description ?? "")},
  ${sqlLiteral(row.color)},
  ${sqlLiteral(row.group)},
  ${Number.parseFloat(String(row.sequence ?? 0))},
  ${Number.parseInt(String(row.default ?? row.is_default ?? 0), 10)},
  ${sqlLiteral(row.deleted_at)},
  ${sqlLiteral(row.created_at)},
  ${sqlLiteral(row.updated_at)}
);`;
}

export function buildStatesImportSql({ states = [] } = {}) {
  const statements = states.map((row) => buildStateInsert(row));
  return `${statements.join("\n")}\n`;
}
