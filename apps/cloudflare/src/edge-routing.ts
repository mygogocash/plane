import type { CloudflareBindings } from "./types";

export type LegacyRouteContract = "api" | "auth" | "live" | "uploads" | "spaces" | "god-mode" | "static" | "app-shell";

export type EdgeRouteClassification =
  | {
      action: "local";
      path: string;
      reason: "worker-route" | "future-worker-route";
    }
  | {
      action: "legacy-proxy";
      contract: LegacyRouteContract;
      path: string;
    }
  | {
      action: "not-found";
      path: string;
      reason: "unsupported-app-shell-method";
    };

const localWorkerPaths = new Set([
  "/healthz",
  "/api/instances",
  "/api/instances/",
  "/api/cloudflare/d1/workspaces",
  "/api/cloudflare/migration-status",
  "/api/cloudflare/routes",
]);

const staticPathPrefixes = ["/assets/", "/static/", "/_next/", "/build/", "/images/", "/fonts/", "/icons/"] as const;

const staticFileNames = new Set([
  "/favicon.ico",
  "/manifest.json",
  "/robots.txt",
  "/service-worker.js",
  "/site.webmanifest",
]);

const staticExtensionPattern =
  /\.(?:avif|css|gif|ico|jpe?g|js|json|map|mjs|png|svg|ttf|txt|webmanifest|webp|woff2?|xml)$/i;

function getUrl(input: Request | URL | string): URL {
  if (input instanceof Request) {
    return new URL(input.url);
  }

  if (input instanceof URL) {
    return input;
  }

  return new URL(input, "https://app.manut.xyz");
}

function pathMatches(path: string, basePath: string): boolean {
  return path === basePath || path.startsWith(`${basePath}/`);
}

function isLocalWorkerPath(path: string): boolean {
  return (
    localWorkerPaths.has(path) ||
    /^\/api\/cloudflare\/d1\/workspaces\/[^/]+\/projects\/?$/.test(path) ||
    pathMatches(path, "/api/cloudflare/live/rooms")
  );
}

function isStaticPath(path: string): boolean {
  return (
    staticFileNames.has(path) ||
    staticPathPrefixes.some((prefix) => path.startsWith(prefix)) ||
    staticExtensionPattern.test(path)
  );
}

function classifyLegacyContract(path: string): LegacyRouteContract | null {
  if (pathMatches(path, "/api")) {
    return "api";
  }

  if (pathMatches(path, "/auth")) {
    return "auth";
  }

  if (pathMatches(path, "/live")) {
    return "live";
  }

  if (pathMatches(path, "/uploads")) {
    return "uploads";
  }

  if (pathMatches(path, "/spaces")) {
    return "spaces";
  }

  if (pathMatches(path, "/god-mode")) {
    return "god-mode";
  }

  if (isStaticPath(path)) {
    return "static";
  }

  return null;
}

export function classifyEdgeRoute(input: Request | URL | string): EdgeRouteClassification {
  const url = getUrl(input);
  const path = url.pathname;

  if (isLocalWorkerPath(path)) {
    return {
      action: "local",
      path,
      reason: path.startsWith("/uploads") ? "future-worker-route" : "worker-route",
    };
  }

  const legacyContract = classifyLegacyContract(path);

  if (legacyContract) {
    return {
      action: "legacy-proxy",
      contract: legacyContract,
      path,
    };
  }

  return {
    action: "legacy-proxy",
    contract: "app-shell",
    path,
  };
}

function buildLegacyUrl(requestUrl: URL, legacyOrigin: string): URL {
  const target = new URL(legacyOrigin);
  target.pathname = requestUrl.pathname;
  target.search = requestUrl.search;
  target.hash = "";
  return target;
}

function hasRequestBody(method: string): boolean {
  return method !== "GET" && method !== "HEAD";
}

export function buildLegacyProxyRequest(
  request: Request,
  legacyOrigin: string,
  contract?: LegacyRouteContract
): Request {
  const requestUrl = new URL(request.url);
  const targetUrl = buildLegacyUrl(requestUrl, legacyOrigin);
  const headers = new Headers(request.headers);

  headers.delete("host");
  headers.set("x-forwarded-host", requestUrl.host);
  headers.set("x-forwarded-proto", requestUrl.protocol.replace(":", ""));
  headers.set("x-manut-edge-route", "legacy-gke");
  if (contract) {
    headers.set("x-manut-edge-contract", contract);
  }

  const init: RequestInit & { duplex?: "half" } = {
    headers,
    method: request.method,
    redirect: "manual",
  };

  if (hasRequestBody(request.method) && request.body) {
    init.body = request.body;
    init.duplex = "half";
  }

  return new Request(targetUrl.toString(), init);
}

function withLegacyProxyHeaders(response: Response, contract?: LegacyRouteContract): Response {
  const headers = new Headers(response.headers);

  headers.set("x-manut-edge-route", "legacy-gke");
  headers.set("x-manut-cloudflare-phase", "frontend-edge-routing");
  if (contract) {
    headers.set("x-manut-edge-contract", contract);
  }

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

function legacyOriginResponse(error: string, message: string, contract?: LegacyRouteContract): Response {
  return Response.json(
    {
      error,
      message,
    },
    {
      status: 502,
      headers: {
        "x-manut-edge-route": "legacy-gke",
        "x-manut-cloudflare-phase": "frontend-edge-routing",
        ...(contract ? { "x-manut-edge-contract": contract } : {}),
      },
    }
  );
}

export async function proxyToLegacyOrigin(
  request: Request,
  env: CloudflareBindings,
  contract?: LegacyRouteContract
): Promise<Response> {
  const legacyOrigin = env.LEGACY_GKE_ORIGIN?.trim();

  if (!legacyOrigin) {
    return legacyOriginResponse(
      "LEGACY_GKE_ORIGIN_NOT_CONFIGURED",
      "This route is a legacy proxy candidate, but LEGACY_GKE_ORIGIN is not configured.",
      contract
    );
  }

  try {
    const requestUrl = new URL(request.url);
    const legacyUrl = new URL(legacyOrigin);

    if (legacyUrl.origin === requestUrl.origin) {
      return legacyOriginResponse(
        "LEGACY_GKE_ORIGIN_MATCHES_WORKER_ORIGIN",
        "Refusing to proxy to the same origin as the Worker request.",
        contract
      );
    }

    const response = await fetch(buildLegacyProxyRequest(request, legacyOrigin, contract));
    return withLegacyProxyHeaders(response, contract);
  } catch (error) {
    console.error("LEGACY_GKE_PROXY_FAILED", error);
    return legacyOriginResponse(
      "LEGACY_GKE_PROXY_FAILED",
      "Failed to proxy the request to the legacy GKE origin.",
      contract
    );
  }
}
