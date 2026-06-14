import { afterEach, describe, expect, it, vi } from "vitest";

import { buildClientErrorPayload, reportClientError } from "./client-error-report";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("buildClientErrorPayload", () => {
  it("does not include fields longer than the API log limit", () => {
    const error = new Error("x".repeat(2500));
    error.stack = "s".repeat(2500);

    const payload = buildClientErrorPayload(error);

    expect(payload.message).toHaveLength(2000);
    expect(payload.stack).toHaveLength(2000);
  });

  it("captures the current browser route", () => {
    vi.stubGlobal("navigator", { userAgent: "test-agent" });
    vi.stubGlobal("window", {
      location: {
        href: "https://app.manut.xyz/gogocash/",
        pathname: "/gogocash/",
      },
    });

    const payload = buildClientErrorPayload(new TypeError("failed"));

    expect(payload.name).toBe("TypeError");
    expect(payload.message).toBe("failed");
    expect(payload.route).toBe("/gogocash/");
    expect(payload.url).toBe("https://app.manut.xyz/gogocash/");
    expect(payload.user_agent).toBe("test-agent");
  });
});

describe("reportClientError", () => {
  it("sends sanitized client errors to the API in production", () => {
    const open = vi.fn();
    const setRequestHeader = vi.fn();
    const send = vi.fn();

    class MockXMLHttpRequest {
      open = open;
      setRequestHeader = setRequestHeader;
      send = send;
    }

    vi.stubEnv("DEV", false);
    vi.stubGlobal("XMLHttpRequest", MockXMLHttpRequest);
    vi.stubGlobal("navigator", { userAgent: "test-agent" });
    vi.stubGlobal("window", {
      location: {
        href: "https://app.manut.xyz/gogocash/",
        pathname: "/gogocash/",
      },
    });

    reportClientError(new TypeError("failed"));

    expect(open).toHaveBeenCalledWith("POST", "/api/client-errors/", true);
    expect(setRequestHeader).toHaveBeenCalledWith("Content-Type", "application/json");
    expect(send).toHaveBeenCalledTimes(1);

    const requestBody = JSON.parse(send.mock.calls[0][0]);
    expect(requestBody).toMatchObject({
      message: "failed",
      name: "TypeError",
      route: "/gogocash/",
      stack: expect.any(String),
      url: "https://app.manut.xyz/gogocash/",
      user_agent: "test-agent",
    });
  });
});
