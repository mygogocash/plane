/**
 * Build SQLite INSERT statements for Slice 1 identity import.
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

function normalizeIntegerFlag(value, fallback = 0) {
  if (value === true || value === 1 || value === "1" || value === "t") {
    return 1;
  }

  if (value === false || value === 0 || value === "0" || value === "f") {
    return 0;
  }

  return fallback;
}

function normalizeJsonText(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value);
}

export function buildUserInsert(row) {
  return `INSERT OR REPLACE INTO users (
  id, email, display_name, first_name, last_name, avatar,
  is_active, is_bot, last_active, created_at, updated_at
) VALUES (
  ${sqlLiteral(row.id)},
  ${sqlLiteral(row.email)},
  ${sqlLiteral(row.display_name ?? "")},
  ${sqlLiteral(row.first_name ?? "")},
  ${sqlLiteral(row.last_name ?? "")},
  ${sqlLiteral(row.avatar ?? "")},
  ${normalizeIntegerFlag(row.is_active, 1)},
  ${normalizeIntegerFlag(row.is_bot, 0)},
  ${sqlLiteral(row.last_active)},
  ${sqlLiteral(row.created_at)},
  ${sqlLiteral(row.updated_at)}
);`;
}

export function buildProfileInsert(row) {
  return `INSERT OR REPLACE INTO profiles (
  user_id, is_onboarded, onboarding_step, is_tour_completed, created_at, updated_at
) VALUES (
  ${sqlLiteral(row.user_id)},
  ${normalizeIntegerFlag(row.is_onboarded, 0)},
  ${sqlLiteral(normalizeJsonText(row.onboarding_step))},
  ${normalizeIntegerFlag(row.is_tour_completed, 0)},
  ${sqlLiteral(row.created_at)},
  ${sqlLiteral(row.updated_at)}
);`;
}

export function buildWorkspaceMemberInsert(row) {
  return `INSERT OR REPLACE INTO workspace_members (
  id, workspace_id, member_id, role, is_active, created_at, updated_at
) VALUES (
  ${sqlLiteral(row.id)},
  ${sqlLiteral(row.workspace_id)},
  ${sqlLiteral(row.member_id)},
  ${Number.parseInt(String(row.role ?? 15), 10)},
  ${normalizeIntegerFlag(row.is_active, 1)},
  ${sqlLiteral(row.created_at)},
  ${sqlLiteral(row.updated_at)}
);`;
}

export function buildProjectLogoPropsUpdate(row) {
  const logoProps = normalizeJsonText(row.logo_props) ?? "{}";
  return `UPDATE projects
SET logo_props = ${sqlLiteral(logoProps)}
WHERE id = ${sqlLiteral(row.id)};`;
}

export function buildIdentityImportSql({
  users = [],
  profiles = [],
  workspaceMembers = [],
  projectLogoProps = [],
} = {}) {
  const statements = [
    ...users.map((row) => buildUserInsert(row)),
    ...profiles.map((row) => buildProfileInsert(row)),
    ...workspaceMembers.map((row) => buildWorkspaceMemberInsert(row)),
    ...projectLogoProps.map((row) => buildProjectLogoPropsUpdate(row)),
  ];

  return `${statements.join("\n")}\n`;
}
