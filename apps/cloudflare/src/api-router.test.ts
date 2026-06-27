/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";

import {
  WORKER_NATIVE_ROUTE_DEFINITIONS,
  isWorkerNativeApiEnabled,
  matchWorkerNativeRoute,
  resolveRequestRouting,
} from "./api-router";
import type { CloudflareBindings } from "./types";

describe("worker native api router", () => {
  it("defaults to enabled when legacy GKE origin is not configured", () => {
    expect(isWorkerNativeApiEnabled({})).toBe(true);
    expect(isWorkerNativeApiEnabled({ LEGACY_GKE_ORIGIN: "" })).toBe(true);
    expect(isWorkerNativeApiEnabled({ WORKER_NATIVE_API_ENABLED: "true" })).toBe(true);
    expect(isWorkerNativeApiEnabled({ WORKER_NATIVE_API_ENABLED: "false" })).toBe(false);
    expect(
      isWorkerNativeApiEnabled({
        LEGACY_GKE_ORIGIN: "https://legacy-gke.manut.internal",
      })
    ).toBe(false);
    expect(
      isWorkerNativeApiEnabled({
        LEGACY_GKE_ORIGIN: "https://legacy-gke.manut.internal",
        WORKER_NATIVE_API_ENABLED: "true",
      })
    ).toBe(true);
  });

  it("matches registered routes with trailing slash normalization", () => {
    const route = matchWorkerNativeRoute("GET", "/api/users/me/workspaces");

    expect(route).toMatchObject({
      route: {
        id: "users-me-workspaces",
        path: "/api/users/me/workspaces/",
        implemented: true,
      },
      params: {},
    });
  });

  it("routes issue APIs through worker-native handlers when legacy GKE is retired", () => {
    expect(matchWorkerNativeRoute("GET", "/api/workspaces/gogocash/projects/abc-123/issues/")).toMatchObject({
      route: { id: "workspace-project-issues-list" },
      params: { slug: "gogocash", projectId: "abc-123" },
    });

    const routing = resolveRequestRouting(
      new Request("https://app.manut.xyz/api/workspaces/gogocash/projects/abc-123/issues/"),
      {} satisfies CloudflareBindings
    );

    expect(routing.kind).toBe("worker-native");
    if (routing.kind === "worker-native") {
      expect(routing.route.id).toBe("workspace-project-issues-list");
    }
  });

  it("matches project shell routes used when opening a project", () => {
    expect(matchWorkerNativeRoute("GET", "/api/workspaces/gogocash/projects/abc-123/")).toMatchObject({
      route: { id: "workspace-project-detail" },
      params: { slug: "gogocash", projectId: "abc-123" },
    });
    expect(matchWorkerNativeRoute("GET", "/api/workspaces/gogocash/projects/abc-123/states/")).toMatchObject({
      route: { id: "workspace-project-states" },
      params: { slug: "gogocash", projectId: "abc-123" },
    });
    expect(matchWorkerNativeRoute("GET", "/api/workspaces/gogocash/projects/abc-123/intake-state/")).toMatchObject({
      route: { id: "workspace-project-intake-state" },
      params: { slug: "gogocash", projectId: "abc-123" },
    });
    expect(
      matchWorkerNativeRoute("GET", "/api/workspaces/gogocash/projects/abc-123/project-members/me/")
    ).toMatchObject({
      route: { id: "workspace-project-member-me" },
      params: { slug: "gogocash", projectId: "abc-123" },
    });
  });

  it("does not match unregistered routes", () => {
    expect(matchWorkerNativeRoute("POST", "/api/users/me/profile/")).toBeNull();
    expect(matchWorkerNativeRoute("POST", "/api/users/me/workspaces/")).toBeNull();
  });

  it("matches HEAD requests to GET native routes", () => {
    expect(matchWorkerNativeRoute("HEAD", "/api/workspaces/gogocash/projects/abc-123/issues/")).toMatchObject({
      route: { id: "workspace-project-issues-list" },
    });
  });

  it("matches profile and workspace member me routes", () => {
    expect(matchWorkerNativeRoute("GET", "/api/users/me/profile/")).toMatchObject({
      route: { id: "users-me-profile" },
    });
    expect(matchWorkerNativeRoute("GET", "/api/workspaces/gogocash/workspace-members/me/")).toMatchObject({
      route: { id: "workspace-member-me" },
      params: { slug: "gogocash" },
    });
  });

  it("resolves worker-native routing when legacy proxy is unavailable", () => {
    const request = new Request("https://app.manut.xyz/api/users/me/workspaces/");
    const legacyRetiredEnv = {} satisfies CloudflareBindings;
    const explicitlyDisabledEnv = { WORKER_NATIVE_API_ENABLED: "false" } satisfies CloudflareBindings;

    expect(resolveRequestRouting(request, legacyRetiredEnv)).toEqual({
      kind: "worker-native",
      route: WORKER_NATIVE_ROUTE_DEFINITIONS.find((route) => route.id === "users-me-workspaces"),
      params: {},
    });

    const disabledRouting = resolveRequestRouting(request, explicitlyDisabledEnv);
    expect(disabledRouting.kind).toBe("edge");
    if (disabledRouting.kind === "edge") {
      expect(disabledRouting.classification.action).toBe("legacy-proxy");
      expect(disabledRouting.classification.contract).toBe("api");
    }
  });

  it("matches workspace shell routes used on initial workspace load", () => {
    expect(matchWorkerNativeRoute("GET", "/api/users/me/workspaces/gogocash/project-roles/")).toMatchObject({
      route: { id: "users-me-workspace-project-roles" },
      params: { slug: "gogocash" },
    });
    expect(matchWorkerNativeRoute("GET", "/api/workspaces/gogocash/members/")).toMatchObject({
      route: { id: "workspace-members" },
      params: { slug: "gogocash" },
    });
    expect(matchWorkerNativeRoute("GET", "/api/workspaces/gogocash/states/")).toMatchObject({
      route: { id: "workspace-states" },
      params: { slug: "gogocash" },
    });
    expect(matchWorkerNativeRoute("PATCH", "/api/workspaces/gogocash/sidebar-preferences/")).toMatchObject({
      route: { id: "workspace-sidebar-preferences" },
      params: { slug: "gogocash" },
    });
    expect(matchWorkerNativeRoute("GET", "/api/workspaces/gogocash/home-preferences/")).toMatchObject({
      route: { id: "workspace-home-preferences" },
      params: { slug: "gogocash" },
    });
    expect(matchWorkerNativeRoute("GET", "/api/workspaces/gogocash/projects/details/")).toMatchObject({
      route: { id: "workspace-projects-details" },
      params: { slug: "gogocash" },
    });
    expect(matchWorkerNativeRoute("PATCH", "/api/workspaces/gogocash/home-preferences/quick_links/")).toMatchObject({
      route: { id: "workspace-home-preference-update" },
      params: { slug: "gogocash", key: "quick_links" },
    });
  });

  it("registers active slice 2-4 smoke routes as implemented", () => {
    expect(WORKER_NATIVE_ROUTE_DEFINITIONS.every((route) => route.implemented)).toBe(true);
    expect(WORKER_NATIVE_ROUTE_DEFINITIONS.map((route) => route.id)).toEqual([
      "users-me",
      "users-me-profile",
      "users-me-settings",
      "users-me-workspaces",
      "users-me-workspace-project-roles",
      "workspace-detail",
      "workspace-projects",
      "workspace-projects-details",
      "workspace-member-me",
      "workspace-members",
      "workspace-states",
      "workspace-sidebar-preferences",
      "workspace-sidebar-preferences",
      "workspace-home-preferences",
      "workspace-home-preference-update",
      "workspace-quick-links",
      "workspace-quick-links",
      "workspace-quick-link-detail",
      "workspace-quick-link-detail",
      "workspace-recent-visits",
      "workspace-project-detail",
      "workspace-project-states",
      "workspace-project-intake-state",
      "workspace-project-member-me",
      "workspace-project-issues-list",
      "workspace-project-issue-create",
      "workspace-project-issue-update",
      "workspace-project-issue-delete",
      "workspace-asset-presign",
    ]);
  });
});
