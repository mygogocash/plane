#!/usr/bin/env node

// Copyright 2023-present Plane Authors. All rights reserved.
// SPDX-License-Identifier: AGPL-3.0-only

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const CLOUDFLARE_DIR = resolve(SCRIPT_DIR, "..");

function readApiKey() {
  const direct = process.env.RESEND_API_KEY?.trim();
  if (direct) {
    return direct;
  }

  const smtpPassword = process.env.EMAIL_HOST_PASSWORD?.trim();
  if (smtpPassword?.startsWith("re_")) {
    return smtpPassword;
  }

  return "";
}

function usage() {
  console.error(`Usage:
  RESEND_API_KEY=re_... pnpm --filter @manut/cloudflare resend:wire-production

Optional:
  RESEND_FROM_EMAIL="Manut <no-reply@gogocash.co>"  (also set in wrangler.toml)
  EMAIL_HOST_PASSWORD=re_...                        (accepted as RESEND_API_KEY fallback)

This sets the production Worker secret RESEND_API_KEY via wrangler.`);
  process.exit(1);
}

const apiKey = readApiKey();
if (!apiKey) {
  usage();
}

const putSecret = spawnSync("pnpm", ["exec", "wrangler", "secret", "put", "RESEND_API_KEY", "--env", "production"], {
  cwd: CLOUDFLARE_DIR,
  input: apiKey,
  encoding: "utf8",
  stdio: ["pipe", "inherit", "inherit"],
});

if (putSecret.status !== 0) {
  process.exit(putSecret.status ?? 1);
}

console.log("RESEND_API_KEY stored on production Worker manut-app.");

const deploy = spawnSync("pnpm", ["exec", "wrangler", "deploy", "--env", "production"], {
  cwd: CLOUDFLARE_DIR,
  stdio: "inherit",
});

process.exit(deploy.status ?? 1);
