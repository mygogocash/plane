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

  it("routes issue APIs to legacy GKE until D1 issue import is populated", () => {
    expect(matchWorkerNativeRoute("GET", "/api/workspaces/gogocash/projects/abc-123/issues/")).toBeNull();

    const routing = resolveRequestRouting(
      new Request("https://app.manut.xyz/api/workspaces/gogocash/projects/abc-123/issues/"),
      { WORKER_NATIVE_API_ENABLED: "true" } satisfies CloudflareBindings
    );

    expect(routing.kind).toBe("edge");
    if (routing.kind === "edge") {
      expect(routing.classification.action).toBe("legacy-proxy");
    }
  });

  it("does not match unregistered routes", () => {
    expect(matchWorkerNativeRoute("POST", "/api/users/me/profile/")).toBeNull();
    expect(matchWorkerNativeRoute("POST", "/api/users/me/workspaces/")).toBeNull();
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
    expect(matchWorkerNativeRoute("GET", "/api/workspaces/gogocash/sidebar-preferences/")).toMatchObject({
      route: { id: "workspace-sidebar-preferences" },
      params: { slug: "gogocash" },
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
      "workspace-member-me",
      "workspace-members",
      "workspace-states",
      "workspace-sidebar-preferences",
      "workspace-asset-presign",
    ]);
  });
});
