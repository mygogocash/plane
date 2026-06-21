import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const instanceConfig = sqliteTable("instance_config", {
  key: text("key").primaryKey().notNull(),
  value: text("value").notNull(),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const migrationAudit = sqliteTable("migration_audit", {
  id: text("id").primaryKey().notNull(),
  source: text("source").notNull(),
  target: text("target").notNull(),
  status: text("status").notNull(),
  sourceCount: integer("source_count"),
  targetCount: integer("target_count"),
  checksum: text("checksum"),
  details: text("details"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const uploadObjectAudit = sqliteTable("upload_object_audit", {
  objectKey: text("object_key").primaryKey().notNull(),
  sourceBucket: text("source_bucket").notNull(),
  targetBucket: text("target_bucket").notNull(),
  sourceEtag: text("source_etag"),
  targetEtag: text("target_etag"),
  sizeBytes: integer("size_bytes"),
  status: text("status").notNull(),
  checkedAt: text("checked_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const jobAudit = sqliteTable("job_audit", {
  id: text("id").primaryKey().notNull(),
  queueName: text("queue_name").notNull(),
  jobType: text("job_type").notNull(),
  status: text("status").notNull(),
  attempts: integer("attempts").notNull().default(0),
  payload: text("payload"),
  lastError: text("last_error"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
