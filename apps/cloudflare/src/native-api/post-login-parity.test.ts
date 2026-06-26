/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";

import { app } from "../index";
import type { CloudflareBindings } from "../types";
import { createWorkerSession } from "../auth/session";
import { buildUserSettingsWorkspacePayload, mapUserProfilePayload, mapWorkspaceMemberMePayload } from "./db";

const FRONK_USER_ID = "86b06908-f09d-4e9b-8b39-bc74aa9d1008";
const GOGOCASH_WORKSPACE_ID = "c0c5b239-912f-4397-966d-7d6c5b40f415";
const FASTWORK_PROJECT_ID = "75def81d-6882-47e3-a9c7-92c9791e4914";
const MEMBER_ROW_ID = "eaea3f26-ca5e-4e7a-9ad2-f3ff847e041c";

function fakeKv(store = new Map<string, string>()) {
  return {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
  } as KVNamespace;
}

function fakeD1ForFronk(): D1Database {
  const users = [
    {
      id: FRONK_USER_ID,
      email: "fronk.kunanon@gogocash.co",
      display_name: "Fronk",
      first_name: "Kunanon",
      last_name: "Jarat",
      avatar: "",
      is_active: 1,
      is_bot: 0,
      last_active: "2026-06-25T01:08:44.120Z",
      created_at: "2026-06-05T13:32:13.644Z",
      updated_at: "2026-06-25T01:08:44.120Z",
    },
  ];
  const profiles = [
    {
      user_id: FRONK_USER_ID,
      is_onboarded: 1,
      onboarding_step:
        '{"workspace_join": true, "profile_complete": true, "workspace_create": true, "workspace_invite": true}',
      is_tour_completed: 1,
      created_at: "2026-06-05T13:32:13.711Z",
      updated_at: "2026-06-16T02:35:03.897Z",
    },
  ];
  const workspaces = [
    {
      id: GOGOCASH_WORKSPACE_ID,
      name: "GoGoCash",
      slug: "gogocash",
      logo: null,
      timezone: "Asia/Bangkok",
      created_at: "2026-06-05T00:00:00.000Z",
      updated_at: "2026-06-05T00:00:00.000Z",
      role: 20,
      total_members: 2,
    },
  ];
  const workspaceMembers = [
    {
      id: MEMBER_ROW_ID,
      workspace_id: GOGOCASH_WORKSPACE_ID,
      member_id: FRONK_USER_ID,
      role: 20,
      is_active: 1,
      created_at: "2026-06-05T13:32:43.730Z",
      updated_at: "2026-06-05T13:32:43.730Z",
      slug: "gogocash",
    },
  ];
  const projects = [
    {
      id: FASTWORK_PROJECT_ID,
      workspace_id: GOGOCASH_WORKSPACE_ID,
      name: "Fastwork",
      identifier: "FAST",
      network: 2,
      logo_props: JSON.stringify({ in_use: "emoji", emoji: { value: "⚡" } }),
      created_at: "2026-06-05T00:00:00.000Z",
      updated_at: "2026-06-05T00:00:00.000Z",
    },
  ];

  return {
    prepare(query: string) {
      const state = { args: [] as unknown[] };
      return {
        bind(...args: unknown[]) {
          state.args = args;
          return this;
        },
        async all<T>() {
          if (query.includes("FROM workspaces w") && query.includes("JOIN workspace_members")) {
            return { results: workspaces as T[] };
          }
          if (query.includes("FROM projects p") && query.includes("project_id")) {
            return {
              results: [{ project_id: FASTWORK_PROJECT_ID, role: 20 }] as T[],
            };
          }
          if (query.includes("FROM issues")) {
            return { results: [] as T[] };
          }
          if (query.includes("JOIN users u ON u.id = wm.member_id")) {
            return {
              results: [
                {
                  ...workspaceMembers[0],
                  email: users[0].email,
                  display_name: users[0].display_name,
                  first_name: users[0].first_name,
                  last_name: users[0].last_name,
                  avatar: users[0].avatar,
                },
              ] as T[],
            };
          }
          return { results: [] as T[] };
        },
        async first<T>() {
          if (query.includes("FROM users") && query.includes("email = ?")) {
            return (users.find((row) => row.email === state.args[0]) ?? null) as T | null;
          }
          if (query.includes("FROM users") && query.includes("WHERE id = ?")) {
            return (users.find((row) => row.id === state.args[0]) ?? null) as T | null;
          }
          if (query.includes("FROM profiles")) {
            return (profiles.find((row) => row.user_id === state.args[0]) ?? null) as T | null;
          }
          if (query.includes("FROM workspace_members wm") && query.includes("w.slug = ?")) {
            const slug = state.args[0];
            const memberId = state.args[1];
            return (workspaceMembers.find((row) => row.slug === slug && row.member_id === memberId) ??
              null) as T | null;
          }
          if (query.includes("FROM workspaces w") && query.includes("w.slug = ?")) {
            const slug = state.args[0];
            const memberId = state.args[1];
            if (slug === "gogocash" && memberId === FRONK_USER_ID) {
              return workspaces[0] as T;
            }
            return null;
          }
          if (query.includes("FROM projects") && query.includes("WHERE id = ?")) {
            const projectId = state.args[0];
            const workspaceId = state.args[1];
            return (projects.find((row) => row.id === projectId && row.workspace_id === workspaceId) ??
              null) as T | null;
          }
          return null;
        },
      } as unknown as D1PreparedStatement;
    },
  } as unknown as D1Database;
}

describe("post-login API parity", () => {
  it("maps profile payload with parsed onboarding flags", () => {
    const payload = mapUserProfilePayload({
      user_id: FRONK_USER_ID,
      is_onboarded: 1,
      onboarding_step:
        '{"workspace_join": true, "profile_complete": true, "workspace_create": true, "workspace_invite": true}',
      is_tour_completed: 1,
      created_at: "2026-06-05T13:32:13.711Z",
      updated_at: "2026-06-16T02:35:03.897Z",
    });

    expect(payload).toMatchObject({
      id: FRONK_USER_ID,
      user: FRONK_USER_ID,
      is_onboarded: true,
      is_tour_completed: true,
      onboarding_step: {
        workspace_join: true,
        profile_complete: true,
        workspace_create: true,
        workspace_invite: true,
      },
    });
  });

  it("builds settings workspace payload with slug fallbacks", () => {
    const payload = buildUserSettingsWorkspacePayload([
      {
        id: GOGOCASH_WORKSPACE_ID,
        name: "GoGoCash",
        slug: "gogocash",
        logo: null,
        timezone: "Asia/Bangkok",
        created_at: "2026-06-05T00:00:00.000Z",
        updated_at: "2026-06-05T00:00:00.000Z",
        role: 20,
        total_members: 2,
      },
    ]);

    expect(payload).toMatchObject({
      last_workspace_slug: "gogocash",
      fallback_workspace_slug: "gogocash",
      last_workspace_id: GOGOCASH_WORKSPACE_ID,
      fallback_workspace_id: GOGOCASH_WORKSPACE_ID,
      invites: 0,
    });
  });

  it("maps workspace member me payload for gogocash", () => {
    const payload = mapWorkspaceMemberMePayload({
      id: MEMBER_ROW_ID,
      workspace_id: GOGOCASH_WORKSPACE_ID,
      member_id: FRONK_USER_ID,
      role: 20,
      is_active: 1,
      created_at: "2026-06-05T13:32:43.730Z",
      updated_at: "2026-06-05T13:32:43.730Z",
    });

    expect(payload).toMatchObject({
      id: MEMBER_ROW_ID,
      workspace: GOGOCASH_WORKSPACE_ID,
      member: FRONK_USER_ID,
      role: 20,
      draft_issue_count: 0,
      company_role: null,
    });
  });

  it("serves profile, settings, and workspace member me for an authenticated session", async () => {
    const kv = fakeKv();
    const env = {
      APP_ENV: "test",
      APP_ORIGIN: "https://app.manut.xyz",
      CONFIG: kv,
      MANUT_DB: fakeD1ForFronk(),
      WORKER_NATIVE_API_ENABLED: "true",
    } satisfies CloudflareBindings;

    const { setCookie } = await createWorkerSession(env, FRONK_USER_ID);
    const cookie = setCookie.split(";")[0];
    const headers = { cookie };

    const profileResponse = await app.request("/api/users/me/profile/", { headers }, env);
    expect(profileResponse.status).toBe(200);
    await expect(profileResponse.json()).resolves.toMatchObject({
      is_onboarded: true,
      onboarding_step: { workspace_join: true },
    });

    const settingsResponse = await app.request("/api/users/me/settings/", { headers }, env);
    expect(settingsResponse.status).toBe(200);
    await expect(settingsResponse.json()).resolves.toMatchObject({
      email: "fronk.kunanon@gogocash.co",
      workspace: {
        last_workspace_slug: "gogocash",
        fallback_workspace_slug: "gogocash",
      },
    });

    const memberResponse = await app.request("/api/workspaces/gogocash/workspace-members/me/", { headers }, env);
    expect(memberResponse.status).toBe(200);
    await expect(memberResponse.json()).resolves.toMatchObject({
      role: 20,
      workspace: GOGOCASH_WORKSPACE_ID,
    });

    const projectRolesResponse = await app.request(
      "/api/users/me/workspaces/gogocash/project-roles/",
      { headers },
      env
    );
    expect(projectRolesResponse.status).toBe(200);
    await expect(projectRolesResponse.json()).resolves.toEqual({
      [FASTWORK_PROJECT_ID]: 20,
    });

    const projectDetailResponse = await app.request(
      `/api/workspaces/gogocash/projects/${FASTWORK_PROJECT_ID}/`,
      { headers },
      env
    );
    expect(projectDetailResponse.status).toBe(200);
    await expect(projectDetailResponse.json()).resolves.toMatchObject({
      id: FASTWORK_PROJECT_ID,
      name: "Fastwork",
      identifier: "FAST",
      member_role: 20,
      logo_props: { in_use: "emoji", emoji: { value: "⚡" } },
      description_html: "<p></p>",
    });

    const projectStatesResponse = await app.request(
      `/api/workspaces/gogocash/projects/${FASTWORK_PROJECT_ID}/states/`,
      { headers },
      env
    );
    expect(projectStatesResponse.status).toBe(200);
    await expect(projectStatesResponse.json()).resolves.toEqual([]);

    const projectMemberMeResponse = await app.request(
      `/api/workspaces/gogocash/projects/${FASTWORK_PROJECT_ID}/project-members/me/`,
      { headers },
      env
    );
    expect(projectMemberMeResponse.status).toBe(200);
    await expect(projectMemberMeResponse.json()).resolves.toMatchObject({
      member: FRONK_USER_ID,
      role: 20,
    });

    const issuesResponse = await app.request(
      `/api/workspaces/gogocash/projects/${FASTWORK_PROJECT_ID}/issues/`,
      { headers },
      env
    );
    expect(issuesResponse.status).toBe(200);
    await expect(issuesResponse.json()).resolves.toMatchObject({
      grouped_by: "state",
      results: [],
      total_count: 0,
    });

    const labelsResponse = await app.request(
      `/api/workspaces/gogocash/projects/${FASTWORK_PROJECT_ID}/issue-labels/`,
      { headers },
      env
    );
    expect(labelsResponse.status).toBe(200);
    await expect(labelsResponse.json()).resolves.toEqual([]);

    const clientErrorResponse = await app.request(
      "/api/client-errors/",
      { method: "POST", headers, body: JSON.stringify({ message: "test" }) },
      env
    );
    expect(clientErrorResponse.status).toBe(204);

    const membersResponse = await app.request("/api/workspaces/gogocash/members/", { headers }, env);
    expect(membersResponse.status).toBe(200);
    await expect(membersResponse.json()).resolves.toEqual([
      expect.objectContaining({
        id: MEMBER_ROW_ID,
        role: 20,
        member: expect.objectContaining({
          id: FRONK_USER_ID,
          email: "fronk.kunanon@gogocash.co",
        }),
      }),
    ]);

    const statesResponse = await app.request("/api/workspaces/gogocash/states/", { headers }, env);
    expect(statesResponse.status).toBe(200);
    await expect(statesResponse.json()).resolves.toEqual([]);

    const sidebarResponse = await app.request("/api/workspaces/gogocash/sidebar-preferences/", { headers }, env);
    expect(sidebarResponse.status).toBe(200);
    await expect(sidebarResponse.json()).resolves.toEqual({});
  });
});
