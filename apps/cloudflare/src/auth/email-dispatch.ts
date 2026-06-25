/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { CloudflareJobEnvelope } from "../jobs";
import type { CloudflareBindings } from "../types";
import { buildMagicSignInEmailSubject, buildMagicSignInHtml, buildMagicSignInPlainText } from "./magic-signin-email";

export type EmailDispatchPayload = {
  to: string;
  template: string;
  idempotencyKey: string;
  data?: Record<string, unknown>;
};

export function isResendConfigured(env: CloudflareBindings): boolean {
  return Boolean(env.RESEND_API_KEY?.trim());
}

export function resolveResendFromEmail(env: CloudflareBindings): string {
  return env.RESEND_FROM_EMAIL?.trim() || "Manut <no-reply@gogocash.co>";
}

export async function dispatchMagicLoginEmail(env: CloudflareBindings, payload: EmailDispatchPayload): Promise<void> {
  const token = typeof payload.data?.token === "string" ? payload.data.token : "";
  if (!token) {
    throw new Error("MAGIC_EMAIL_TOKEN_MISSING");
  }

  const apiKey = env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.log("MANUT_MAGIC_EMAIL", JSON.stringify({ to: payload.to, token }));
    return;
  }

  const from = resolveResendFromEmail(env);
  const subject = buildMagicSignInEmailSubject(token);
  const html = buildMagicSignInHtml(payload.to, token);
  const text = buildMagicSignInPlainText(payload.to, token);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": payload.idempotencyKey,
    },
    body: JSON.stringify({
      from,
      to: [payload.to],
      subject,
      html,
      text,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`RESEND_FAILED:${response.status}:${body}`);
  }
}

export async function sendMagicLoginEmail(env: CloudflareBindings, email: string, token: string): Promise<void> {
  await dispatchMagicLoginEmail(env, {
    to: email,
    template: "magic-login",
    idempotencyKey: `magic:${email}:${token}`,
    data: { token },
  });
}

export async function handleEmailDispatchJob(envelope: CloudflareJobEnvelope, env: CloudflareBindings): Promise<void> {
  const payload = envelope.payload as EmailDispatchPayload;

  if (payload.template === "magic-login") {
    await dispatchMagicLoginEmail(env, payload);
    return;
  }

  console.log("EMAIL_DISPATCH_UNSUPPORTED_TEMPLATE", payload.template);
}
