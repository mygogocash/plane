/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { CloudflareBindings } from "./types";
import { classifyEdgeRoute, type EdgeRouteClassification } from "./edge-routing";

export type WorkerNativeRouteId =
  | "users-me"
  | "users-me-settings"
  | "users-me-workspaces"
  | "workspace-detail"
  | "workspace-projects"
  | "workspace-project-issues-list"
  | "workspace-project-issue-create"
  | "workspace-project-issue-update"
  | "workspace-project-issue-delete"
  | "workspace-asset-presign";

export type WorkerNativeRouteDefinition = {
  id: WorkerNativeRouteId;
  method: string;
  path: string;
  slice: string;
  implemented: boolean;
};

type WorkerNativeRouteMatcher = WorkerNativeRouteDefinition & {
  pattern: RegExp;
  paramNames: string[];
};

const WORKER_NATIVE_ROUTE_MATCHERS: WorkerNativeRouteMatcher[] = [
  {
    id: "users-me",
    method: "GET",
    path: "/api/users/me/",
    slice: "worker-native-api-migration-slice-2",
    implemented: true,
    pattern: /^\/api\/users\/me\/$/,
    paramNames: [],
  },
  {
    id: "users-me-settings",
    method: "GET",
    path: "/api/users/me/settings/",
    slice: "worker-native-api-migration-slice-2",
    implemented: true,
    pattern: /^\/api\/users\/me\/settings\/$/,
    paramNames: [],
  },
  {
    id: "users-me-workspaces",
    method: "GET",
    path: "/api/users/me/workspaces/",
    slice: "worker-native-api-migration-slice-2",
    implemented: true,
    pattern: /^\/api\/users\/me\/workspaces\/$/,
    paramNames: [],
  },
  {
    id: "workspace-detail",
    method: "GET",
    path: "/api/workspaces/:slug/",
    slice: "worker-native-api-migration-slice-3",
    implemented: true,
    pattern: /^\/api\/workspaces\/([^/]+)\/$/,
    paramNames: ["slug"],
  },
  {
    id: "workspace-projects",
    method: "GET",
    path: "/api/workspaces/:slug/projects/",
    slice: "worker-native-api-migration-slice-3",
    implemented: true,
    pattern: /^\/api\/workspaces\/([^/]+)\/projects\/$/,
    paramNames: ["slug"],
  },
  // Issue CRUD stays on legacy GKE until D1 issue import is populated (manut-prod currently has 0 rows).
  {
    id: "workspace-asset-presign",
    method: "POST",
    path: "/api/assets/v2/workspaces/:slug/",
    slice: "worker-native-api-migration-slice-4",
    implemented: true,
    pattern: /^\/api\/assets\/v2\/workspaces\/([^/]+)\/$/,
    paramNames: ["slug"],
  },
];

/** Slice 4 issue handlers exist but are not routed until D1 issue import is live. */
export const WORKER_NATIVE_DEFERRED_ROUTE_DEFINITIONS: WorkerNativeRouteDefinition[] = [
  {
    id: "workspace-project-issues-list",
    method: "GET",
    path: "/api/workspaces/:slug/projects/:projectId/issues/",
    slice: "worker-native-api-migration-slice-4",
    implemented: true,
  },
  {
    id: "workspace-project-issue-create",
    method: "POST",
    path: "/api/workspaces/:slug/projects/:projectId/issues/",
    slice: "worker-native-api-migration-slice-4",
    implemented: true,
  },
  {
    id: "workspace-project-issue-update",
    method: "PATCH",
    path: "/api/workspaces/:slug/projects/:projectId/issues/:issueId/",
    slice: "worker-native-api-migration-slice-4",
    implemented: true,
  },
  {
    id: "workspace-project-issue-delete",
    method: "DELETE",
    path: "/api/workspaces/:slug/projects/:projectId/issues/:issueId/",
    slice: "worker-native-api-migration-slice-4",
    implemented: true,
  },
];

export const WORKER_NATIVE_ROUTE_DEFINITIONS: WorkerNativeRouteDefinition[] = WORKER_NATIVE_ROUTE_MATCHERS.map(
  ({ pattern: _pattern, paramNames: _paramNames, ...definition }) => definition
);

export type MatchedWorkerNativeRoute = {
  route: WorkerNativeRouteDefinition;
  params: Record<string, string>;
};

export type ResolvedEdgeRouting =
  | {
      kind: "worker-native";
      route: WorkerNativeRouteDefinition;
      params: Record<string, string>;
    }
  | {
      kind: "edge";
      classification: EdgeRouteClassification;
    };

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname;
  }

  return pathname.endsWith("/") ? pathname : `${pathname}/`;
}

export function isWorkerNativeApiEnabled(env: CloudflareBindings): boolean {
  return env.WORKER_NATIVE_API_ENABLED?.toLowerCase() === "true";
}

export function matchWorkerNativeRoute(method: string, pathname: string): MatchedWorkerNativeRoute | null {
  const normalizedMethod = method.toUpperCase();
  const normalizedPath = normalizePath(pathname);

  for (const matcher of WORKER_NATIVE_ROUTE_MATCHERS) {
    if (matcher.method !== normalizedMethod) {
      continue;
    }

    const match = normalizedPath.match(matcher.pattern);
    if (!match) {
      continue;
    }

    const params: Record<string, string> = {};
    matcher.paramNames.forEach((name, index) => {
      params[name] = decodeURIComponent(match[index + 1] ?? "");
    });

    const { pattern: _pattern, paramNames: _paramNames, ...route } = matcher;
    return { route, params };
  }

  return null;
}

export function resolveRequestRouting(request: Request, env: CloudflareBindings): ResolvedEdgeRouting {
  const url = new URL(request.url);

  if (isWorkerNativeApiEnabled(env)) {
    const matched = matchWorkerNativeRoute(request.method, url.pathname);
    if (matched) {
      return { kind: "worker-native", route: matched.route, params: matched.params };
    }
  }

  return {
    kind: "edge",
    classification: classifyEdgeRoute(request),
  };
}
