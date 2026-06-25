/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  dispatchMagicLoginEmail,
  isResendConfigured,
  resolveResendFromEmail,
  sendMagicLoginEmail,
} from "./email-dispatch";
import type { CloudflareBindings } from "../types";

describe("email dispatch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("detects when Resend is configured", () => {
    expect(isResendConfigured({ RESEND_API_KEY: "re_test" })).toBe(true);
    expect(isResendConfigured({})).toBe(false);
  });

  it("defaults the sender to the verified GoGoCash domain", () => {
    expect(resolveResendFromEmail({})).toBe("Manut <no-reply@gogocash.co>");
    expect(resolveResendFromEmail({ RESEND_FROM_EMAIL: "Manut <login@manut.xyz>" })).toBe("Manut <login@manut.xyz>");
  });

  it("posts a branded magic-login email to Resend", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await dispatchMagicLoginEmail(
      {
        RESEND_API_KEY: "re_test_key",
        RESEND_FROM_EMAIL: "Manut <no-reply@gogocash.co>",
      } satisfies CloudflareBindings,
      {
        to: "ops@manut.xyz",
        template: "magic-login",
        idempotencyKey: "magic:ops@manut.xyz:123456",
        data: { token: "123456" },
      }
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer re_test_key",
      "Idempotency-Key": "magic:ops@manut.xyz:123456",
    });

    const body = JSON.parse(String(init.body));
    expect(body.from).toBe("Manut <no-reply@gogocash.co>");
    expect(body.to).toEqual(["ops@manut.xyz"]);
    expect(body.subject).toContain("123456");
    expect(body.html).toContain("123456");
    expect(body.text).toContain("ops@manut.xyz");
  });

  it("logs when Resend is not configured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await sendMagicLoginEmail({}, "ops@manut.xyz", "654321");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalled();
  });
});
