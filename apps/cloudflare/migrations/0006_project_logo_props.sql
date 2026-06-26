-- Store project logo_props (emoji/icon) in D1 so the workspace sidebar
-- renders real project icons instead of the dark skeleton fallback.
-- Postgres stores this as a JSONField; D1 stores the JSON text.

ALTER TABLE projects ADD COLUMN logo_props TEXT;
