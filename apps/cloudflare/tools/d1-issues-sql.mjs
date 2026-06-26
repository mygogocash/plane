/**
 * Build SQLite INSERT statements for Slice 4 issue import.
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

export function buildIssueInsert(row) {
  return `INSERT OR REPLACE INTO issues (
  id, project_id, workspace_id, name, description_html, priority, state_id,
  sequence_id, sort_order, created_by, updated_by, deleted_at, created_at, updated_at
) VALUES (
  ${sqlLiteral(row.id)},
  ${sqlLiteral(row.project_id)},
  ${sqlLiteral(row.workspace_id)},
  ${sqlLiteral(row.name)},
  ${sqlLiteral(row.description_html ?? "<p></p>")},
  ${sqlLiteral(row.priority ?? "none")},
  ${sqlLiteral(row.state_id)},
  ${Number.parseInt(String(row.sequence_id ?? 1), 10)},
  ${Number.parseFloat(String(row.sort_order ?? 65535))},
  ${sqlLiteral(row.created_by)},
  ${sqlLiteral(row.updated_by)},
  ${sqlLiteral(row.deleted_at)},
  ${sqlLiteral(row.created_at)},
  ${sqlLiteral(row.updated_at)}
);`;
}

export function buildIssuesImportSql({ issues = [] } = {}) {
  const statements = issues.map((row) => buildIssueInsert(row));
  return `${statements.join("\n")}\n`;
}
