// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { describe, expect, it } from "vitest";

import { buildWorkersAISmokeReport, DEFAULT_WORKERS_AI_MODEL } from "../tools/workers-ai-smoke.mjs";

describe("workers-ai-smoke", () => {
  it("reports missing credentials without calling Workers AI", async () => {
    let called = false;

    const report = await buildWorkersAISmokeReport({
      accountId: "",
      apiToken: "",
      fetchImpl: async () => {
        called = true;
        throw new Error("should not fetch");
      },
      now: () => new Date("2026-06-23T12:00:00.000Z"),
    });

    expect(called).toBe(false);
    expect(report).toMatchObject({
      type: "cloudflare-workers-ai-smoke",
      timestamp: "2026-06-23T12:00:00.000Z",
      model: DEFAULT_WORKERS_AI_MODEL,
      ok: false,
      checks: [{ id: "credentials", ok: false }],
    });
  });

  it("calls Cloudflare Workers AI with GLM messages and redacts token from report", async () => {
    let request: { url: string; init: RequestInit } | undefined;

    const report = await buildWorkersAISmokeReport({
      accountId: "account-123",
      apiToken: "secret-token",
      prompt: "Say manut smoke",
      expected: "manut smoke",
      fetchImpl: async (url, init) => {
        request = { url: String(url), init: init as RequestInit };
        return new Response(
          JSON.stringify({
            result: {
              choices: [{ message: { content: "manut smoke ok" } }],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      },
      now: () => new Date("2026-06-23T12:00:00.000Z"),
    });

    expect(request?.url).toBe("https://api.cloudflare.com/client/v4/accounts/account-123/ai/run/@cf/zai-org/glm-5.2");
    expect(request?.init.method).toBe("POST");
    expect(request?.init.headers).toMatchObject({
      authorization: "Bearer secret-token",
      "content-type": "application/json",
    });
    expect(JSON.parse(String(request?.init.body))).toMatchObject({
      messages: [{ role: "system" }, { role: "user", content: "Say manut smoke" }],
    });
    expect(report.ok).toBe(true);
    expect(JSON.stringify(report)).not.toContain("secret-token");
    expect(report.checks.at(-1)).toMatchObject({
      id: "workers-ai-run",
      ok: true,
      status: 200,
      response_excerpt: "manut smoke ok",
    });
  });

  it("fails when expected text is not present", async () => {
    const report = await buildWorkersAISmokeReport({
      accountId: "account-123",
      apiToken: "secret-token",
      expected: "expected text",
      fetchImpl: async () =>
        new Response(JSON.stringify({ result: { response: "different response" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    });

    expect(report.ok).toBe(false);
    expect(report.checks.at(-1)).toMatchObject({
      id: "workers-ai-run",
      ok: false,
      status: 200,
      response_excerpt: "different response",
    });
  });
});
