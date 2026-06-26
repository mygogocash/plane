/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { CloudflareBindings } from "./types";
import { classifyEdgeRoute, type EdgeRouteClassification } from "./edge-routing";

export type WorkerNativeRouteId =
  | "users-me"
  | "users-me-profile"
  | "users-me-settings"
  | "users-me-workspaces"
  | "users-me-workspace-project-roles"
  | "workspace-detail"
  | "workspace-projects"
  | "workspace-member-me"
  | "workspace-members"
  | "workspace-states"
  | "workspace-sidebar-preferences"
  | "workspace-project-detail"
  | "workspace-project-states"
  | "workspace-project-member-me"
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
    id: "users-me-profile",
    method: "GET",
    path: "/api/users/me/profile/",
    slice: "worker-native-api-migration-slice-2",
    implemented: true,
    pattern: /^\/api\/users\/me\/profile\/$/,
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
    id: "users-me-workspace-project-roles",
    method: "GET",
    path: "/api/users/me/workspaces/:slug/project-roles/",
    slice: "worker-native-api-migration-slice-3",
    implemented: true,
    pattern: /^\/api\/users\/me\/workspaces\/([^/]+)\/project-roles\/$/,
    paramNames: ["slug"],
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
  {
    id: "workspace-member-me",
    method: "GET",
    path: "/api/workspaces/:slug/workspace-members/me/",
    slice: "worker-native-api-migration-slice-3",
    implemented: true,
    pattern: /^\/api\/workspaces\/([^/]+)\/workspace-members\/me\/$/,
    paramNames: ["slug"],
  },
  {
    id: "workspace-members",
    method: "GET",
    path: "/api/workspaces/:slug/members/",
    slice: "worker-native-api-migration-slice-3",
    implemented: true,
    pattern: /^\/api\/workspaces\/([^/]+)\/members\/$/,
    paramNames: ["slug"],
  },
  {
    id: "workspace-states",
    method: "GET",
    path: "/api/workspaces/:slug/states/",
    slice: "worker-native-api-migration-slice-3",
    implemented: true,
    pattern: /^\/api\/workspaces\/([^/]+)\/states\/$/,
    paramNames: ["slug"],
  },
  {
    id: "workspace-sidebar-preferences",
    method: "GET",
    path: "/api/workspaces/:slug/sidebar-preferences/",
    slice: "worker-native-api-migration-slice-3",
    implemented: true,
    pattern: /^\/api\/workspaces\/([^/]+)\/sidebar-preferences\/$/,
    paramNames: ["slug"],
  },
  {
    id: "workspace-project-detail",
    method: "GET",
    path: "/api/workspaces/:slug/projects/:projectId/",
    slice: "worker-native-api-migration-slice-4",
    implemented: true,
    pattern: /^\/api\/workspaces\/([^/]+)\/projects\/([^/]+)\/$/,
    paramNames: ["slug", "projectId"],
  },
  {
    id: "workspace-project-states",
    method: "GET",
    path: "/api/workspaces/:slug/projects/:projectId/states/",
    slice: "worker-native-api-migration-slice-4",
    implemented: true,
    pattern: /^\/api\/workspaces\/([^/]+)\/projects\/([^/]+)\/states\/$/,
    paramNames: ["slug", "projectId"],
  },
  {
    id: "workspace-project-member-me",
    method: "GET",
    path: "/api/workspaces/:slug/projects/:projectId/project-members/me/",
    slice: "worker-native-api-migration-slice-4",
    implemented: true,
    pattern: /^\/api\/workspaces\/([^/]+)\/projects\/([^/]+)\/project-members\/me\/$/,
    paramNames: ["slug", "projectId"],
  },
  {
    id: "workspace-project-issues-list",
    method: "GET",
    path: "/api/workspaces/:slug/projects/:projectId/issues/",
    slice: "worker-native-api-migration-slice-4",
    implemented: true,
    pattern: /^\/api\/workspaces\/([^/]+)\/projects\/([^/]+)\/issues\/$/,
    paramNames: ["slug", "projectId"],
  },
  {
    id: "workspace-project-issue-create",
    method: "POST",
    path: "/api/workspaces/:slug/projects/:projectId/issues/",
    slice: "worker-native-api-migration-slice-4",
    implemented: true,
    pattern: /^\/api\/workspaces\/([^/]+)\/projects\/([^/]+)\/issues\/$/,
    paramNames: ["slug", "projectId"],
  },
  {
    id: "workspace-project-issue-update",
    method: "PATCH",
    path: "/api/workspaces/:slug/projects/:projectId/issues/:issueId/",
    slice: "worker-native-api-migration-slice-4",
    implemented: true,
    pattern: /^\/api\/workspaces\/([^/]+)\/projects\/([^/]+)\/issues\/([^/]+)\/$/,
    paramNames: ["slug", "projectId", "issueId"],
  },
  {
    id: "workspace-project-issue-delete",
    method: "DELETE",
    path: "/api/workspaces/:slug/projects/:projectId/issues/:issueId/",
    slice: "worker-native-api-migration-slice-4",
    implemented: true,
    pattern: /^\/api\/workspaces\/([^/]+)\/projects\/([^/]+)\/issues\/([^/]+)\/$/,
    paramNames: ["slug", "projectId", "issueId"],
  },
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

/** Reserved for routes implemented but intentionally withheld from production routing. */
export const WORKER_NATIVE_DEFERRED_ROUTE_DEFINITIONS: WorkerNativeRouteDefinition[] = [];

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
  const explicit = env.WORKER_NATIVE_API_ENABLED?.trim().toLowerCase();
  if (explicit === "true") {
    return true;
  }
  if (explicit === "false") {
    return false;
  }

  // Legacy GKE proxy was retired; without an origin configured, native routes are the only backend.
  return !env.LEGACY_GKE_ORIGIN?.trim();
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
