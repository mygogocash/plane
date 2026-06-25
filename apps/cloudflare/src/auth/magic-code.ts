/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { CloudflareBindings } from "../types";

const MAGIC_TTL_SECONDS = 600;
const MAX_GENERATE_ATTEMPTS = 2;
const MAX_VERIFY_ATTEMPTS = 5;

export type MagicCodeRecord = {
  current_attempt: number;
  email: string;
  token: string;
};

function magicKey(email: string): string {
  return `magic:${email.toLowerCase().trim()}`;
}

function verifyAttemptsKey(email: string): string {
  return `magic:${email.toLowerCase().trim()}:verify_attempts`;
}

function randomToken(): string {
  return String((crypto.getRandomValues(new Uint32Array(1))[0] % 900000) + 100000);
}

export async function initiateMagicCode(
  env: CloudflareBindings,
  email: string
): Promise<{ key: string; token: string }> {
  if (!env.CONFIG) {
    throw new Error("CONFIG_BINDING_MISSING");
  }

  const normalizedEmail = email.toLowerCase().trim();
  const key = magicKey(normalizedEmail);
  const existing = await env.CONFIG.get(key);
  let record: MagicCodeRecord;

  if (existing) {
    const parsed = JSON.parse(existing) as MagicCodeRecord;
    const nextAttempt = parsed.current_attempt + 1;
    if (nextAttempt > MAX_GENERATE_ATTEMPTS) {
      throw new MagicCodeError("EMAIL_CODE_ATTEMPT_EXHAUSTED_SIGN_IN", "5085");
    }

    record = {
      current_attempt: nextAttempt,
      email: normalizedEmail,
      token: randomToken(),
    };
  } else {
    record = {
      current_attempt: 0,
      email: normalizedEmail,
      token: randomToken(),
    };
  }

  await env.CONFIG.put(key, JSON.stringify(record), { expirationTtl: MAGIC_TTL_SECONDS });
  await env.CONFIG.delete(verifyAttemptsKey(normalizedEmail));

  return { key: normalizedEmail, token: record.token };
}

export async function verifyMagicCode(env: CloudflareBindings, email: string, code: string): Promise<void> {
  if (!env.CONFIG) {
    throw new Error("CONFIG_BINDING_MISSING");
  }

  const normalizedEmail = email.toLowerCase().trim();
  const key = magicKey(normalizedEmail);
  const existing = await env.CONFIG.get(key);
  if (!existing) {
    throw new MagicCodeError("INVALID_MAGIC_CODE_SIGN_IN", "5090");
  }

  const record = JSON.parse(existing) as MagicCodeRecord;
  if (record.token !== code.trim()) {
    const attemptsKey = verifyAttemptsKey(normalizedEmail);
    const current = Number((await env.CONFIG.get(attemptsKey)) ?? "0") + 1;
    await env.CONFIG.put(attemptsKey, String(current), { expirationTtl: MAGIC_TTL_SECONDS });

    if (current >= MAX_VERIFY_ATTEMPTS) {
      await env.CONFIG.delete(key);
      await env.CONFIG.delete(attemptsKey);
      throw new MagicCodeError("INVALID_MAGIC_CODE_SIGN_IN", "5090");
    }

    throw new MagicCodeError("INVALID_MAGIC_CODE_SIGN_IN", "5090");
  }

  await env.CONFIG.delete(key);
  await env.CONFIG.delete(verifyAttemptsKey(normalizedEmail));
}

export class MagicCodeError extends Error {
  constructor(
    readonly errorMessage: string,
    readonly errorCode: string
  ) {
    super(errorMessage);
    this.name = "MagicCodeError";
  }

  toPayload(): Record<string, string> {
    return {
      error_code: this.errorCode,
      error_message: this.errorMessage,
    };
  }
}
