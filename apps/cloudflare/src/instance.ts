import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { instanceConfig } from "./schema";
import type { CloudflareBindings, InstancePayload } from "./types";

async function readConfigValue(env: CloudflareBindings, key: string): Promise<string | null> {
  if (!env.MANUT_DB) {
    return null;
  }

  const db = drizzle(env.MANUT_DB);
  const rows = await db
    .select({ value: instanceConfig.value })
    .from(instanceConfig)
    .where(eq(instanceConfig.key, key))
    .limit(1);
  return rows[0]?.value ?? null;
}

export async function buildInstancePayload(env: CloudflareBindings, now = new Date()): Promise<InstancePayload> {
  const configuredVersion = await readConfigValue(env, "current_version");
  const configuredName = await readConfigValue(env, "instance_name");
  const configuredInstanceId = await readConfigValue(env, "instance_id");
  const currentVersion = configuredVersion ?? env.INSTANCE_VERSION ?? "cloudflare-preview";
  const timestamp = now.toISOString();

  return {
    config: {
      admin_base_url: null,
      app_base_url: env.APP_ORIGIN ?? "https://app.manut.xyz",
      enable_signup: false,
      file_size_limit: 5_242_880,
      github_app_name: "",
      has_llm_configured: false,
      has_unsplash_configured: false,
      instance_changelog_url: "https://manut.xyz/",
      is_email_password_enabled: true,
      is_gitea_enabled: false,
      is_github_enabled: false,
      is_gitlab_enabled: false,
      is_google_enabled: false,
      is_magic_login_enabled: true,
      is_self_managed: true,
      is_smtp_configured: true,
      is_workspace_creation_disabled: false,
      posthog_api_key: null,
      posthog_host: null,
      slack_client_id: null,
      space_base_url: null,
    },
    instance: {
      created_at: timestamp,
      created_by: null,
      current_version: currentVersion,
      deleted_at: null,
      domain: "",
      edition: "PLANE_COMMUNITY",
      id: env.INSTANCE_ID ?? "cloudflare-preview-instance",
      instance_id: configuredInstanceId ?? "cloudflare-preview",
      instance_name: configuredName ?? env.INSTANCE_NAME ?? "Manut",
      is_current_version_deprecated: false,
      is_setup_done: true,
      is_signup_screen_visited: false,
      is_support_required: true,
      is_telemetry_enabled: false,
      is_test: false,
      is_verified: false,
      last_checked_at: timestamp,
      latest_version: currentVersion,
      namespace: null,
      updated_at: timestamp,
      updated_by: null,
      whitelist_emails: null,
      workspaces_exist: true,
    },
  };
}
