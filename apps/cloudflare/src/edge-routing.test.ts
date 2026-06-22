import { afterEach, describe, expect, it, vi } from "vitest";

import { buildLegacyProxyRequest, classifyEdgeRoute, proxyToLegacyOrigin } from "./edge-routing";
import { app } from "./index";
import type { CloudflareBindings } from "./types";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Cloudflare edge route classification", () => {
  it.each([
    ["/api/instances/", "local"],
    ["/api/cloudflare/migration-status", "local"],
    ["/api/cloudflare/live/rooms/shadow-room/health", "local"],
  ])("classifies %s as %s Worker handling", (path, action) => {
    expect(classifyEdgeRoute(new Request(`https://app.manut.xyz${path}`))).toMatchObject({
      action,
    });
  });

  it.each([
    ["/api/workspaces/", "api"],
    ["/auth/login", "auth"],
    ["/live/workspace/ws-id/", "live"],
    ["/uploads", "uploads"],
    ["/uploads/logo.png", "uploads"],
    ["/spaces", "spaces"],
    ["/spaces/my-workspace/issues", "spaces"],
    ["/god-mode", "god-mode"],
    ["/god-mode/users", "god-mode"],
    ["/assets/index.js", "static"],
    ["/favicon.ico", "static"],
    ["/", "app-shell"],
    ["/workspace/my-workspace/issues/123", "app-shell"],
  ])("classifies %s as legacy %s proxy candidate", (path, contract) => {
    expect(classifyEdgeRoute(new Request(`https://app.manut.xyz${path}`))).toMatchObject({
      action: "legacy-proxy",
      contract,
    });
  });

  it("keeps unsafe app-shell methods on the legacy app during shadow routing", () => {
    expect(
      classifyEdgeRoute(
        new Request("https://app.manut.xyz/workspace/my-workspace/issues/123", {
          method: "POST",
        })
      )
    ).toMatchObject({
      action: "legacy-proxy",
      contract: "app-shell",
    });
  });
});

describe("legacy proxy helper", () => {
  it("builds a legacy origin request while preserving path and search", () => {
    const proxyRequest = buildLegacyProxyRequest(
      new Request("https://app.manut.xyz/api/workspaces/?cursor=abc"),
      "https://legacy-gke.manut.internal",
      "api"
    );

    expect(proxyRequest.url).toBe("https://legacy-gke.manut.internal/api/workspaces/?cursor=abc");
    expect(proxyRequest.method).toBe("GET");
    expect(proxyRequest.headers.get("x-forwarded-host")).toBe("app.manut.xyz");
    expect(proxyRequest.headers.get("x-manut-edge-route")).toBe("legacy-gke");
    expect(proxyRequest.headers.get("x-manut-edge-contract")).toBe("api");
  });

  it("builds a legacy origin request while preserving unsafe method bodies", async () => {
    const proxyRequest = buildLegacyProxyRequest(
      new Request("https://app.manut.xyz/workspace/my-workspace/issues/123", {
        body: JSON.stringify({ name: "Updated issue" }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      }),
      "https://legacy-gke.manut.internal",
      "app-shell"
    );

    expect(proxyRequest.url).toBe("https://legacy-gke.manut.internal/workspace/my-workspace/issues/123");
    expect(proxyRequest.method).toBe("POST");
    expect(proxyRequest.headers.get("content-type")).toBe("application/json");
    await expect(proxyRequest.json()).resolves.toEqual({ name: "Updated issue" });
  });

  it("proxies candidate routes to the configured legacy GKE origin", async () => {
    const fetchMock = vi.fn(async (request: Request) => {
      return Response.json(
        {
          proxied_url: request.url,
        },
        { status: 209 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const env = {
      LEGACY_GKE_ORIGIN: "https://legacy-gke.manut.internal",
    } satisfies CloudflareBindings;

    const response = await proxyToLegacyOrigin(
      new Request("https://app.manut.xyz/auth/login?next=%2Fspaces"),
      env,
      "auth"
    );

    expect(response.status).toBe(209);
    expect(response.headers.get("x-manut-edge-route")).toBe("legacy-gke");
    expect(response.headers.get("x-manut-edge-contract")).toBe("auth");
    expect(response.headers.get("x-manut-cloudflare-phase")).toBe("frontend-edge-routing");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(response.json()).resolves.toEqual({
      proxied_url: "https://legacy-gke.manut.internal/auth/login?next=%2Fspaces",
    });
  });

  it("returns an explicit error when the legacy origin is not configured", async () => {
    const response = await proxyToLegacyOrigin(new Request("https://app.manut.xyz/auth/login"), {});

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      error: "LEGACY_GKE_ORIGIN_NOT_CONFIGURED",
    });
  });
});

describe("edge routing integration", () => {
  it("keeps /api/instances/ served locally instead of proxying to legacy GKE", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const env = {
      APP_ENV: "test",
      APP_ORIGIN: "https://app.manut.xyz",
      INSTANCE_VERSION: "test-version",
      LEGACY_GKE_ORIGIN: "https://legacy-gke.manut.internal",
    } satisfies CloudflareBindings;

    const response = await app.request("/api/instances/", {}, env);

    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      config: {
        is_email_password_enabled: true,
      },
      instance: {
        current_version: "test-version",
      },
    });
  });
});
