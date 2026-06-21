import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { instanceConfig } from "./schema";
import type { CloudflareBindings, InstancePayload } from "./types";

async function readConfigValue(env: CloudflareBindings, key: string): Promise<string | null> {
  if (!env.MANUT_DB) {
    return null;
  }

  try {
    const db = drizzle(env.MANUT_DB);
    const rows = await db
      .select({ value: instanceConfig.value })
      .from(instanceConfig)
      .where(eq(instanceConfig.key, key))
      .limit(1);
    return rows[0]?.value ?? null;
  } catch {
    return null;
  }
}

export async function buildInstancePayload(env: CloudflareBindings, now = new Date()): Promise<InstancePayload> {
  const configuredVersion = await readConfigValue(env, "current_version");

  return {
    current_version: configuredVersion ?? env.INSTANCE_VERSION ?? "cloudflare-preview",
    deployment_target: "cloudflare",
    is_email_password_enabled: true,
    is_google_enabled: false,
    is_setup_done: true,
    is_signup_enabled: false,
    name: "Manut",
    smtp: true,
    updated_at: now.toISOString(),
  };
}
