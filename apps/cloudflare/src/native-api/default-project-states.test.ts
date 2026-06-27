/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";

import { buildDefaultIntakeState, buildDefaultProjectStates } from "./default-project-states";

describe("default project states", () => {
  it("builds stable backlog through cancelled states for a project", () => {
    const states = buildDefaultProjectStates("project-1", "workspace-1");

    expect(states).toHaveLength(5);
    expect(states[0]).toMatchObject({
      id: "project-1-backlog",
      name: "Backlog",
      group: "backlog",
      default: true,
      project_id: "project-1",
      workspace_id: "workspace-1",
    });
    expect(states.map((state) => state.group)).toEqual(["backlog", "unstarted", "started", "completed", "cancelled"]);
  });

  it("builds a triage intake state for a project", () => {
    expect(buildDefaultIntakeState("project-1", "workspace-1")).toMatchObject({
      id: "project-1-intake",
      group: "triage",
      name: "Triage",
      project_id: "project-1",
      workspace_id: "workspace-1",
    });
  });
});
