export type CloudflareBindings = {
  MANUT_DB?: D1Database;
  UPLOADS?: R2Bucket;
  JOBS?: Queue;
  CONFIG?: KVNamespace;
  LIVE_ROOMS?: DurableObjectNamespace;
  APP_ENV?: string;
  APP_ORIGIN?: string;
  LEGACY_GKE_ORIGIN?: string;
  INSTANCE_VERSION?: string;
};

export type InstancePayload = {
  current_version: string;
  deployment_target: "cloudflare";
  is_email_password_enabled: boolean;
  is_google_enabled: boolean;
  is_setup_done: boolean;
  is_signup_enabled: boolean;
  name: "Manut";
  smtp: boolean;
  updated_at: string;
};
