/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";

import { getWorkflowTargetStateLabels } from "./workflow-group-tree.utils";

describe("getWorkflowTargetStateLabels", () => {
  it("maps known state ids to display names and falls back to the id", () => {
    const labels = getWorkflowTargetStateLabels(["state-a", "state-b", "state-c"], (stateId) => {
      if (stateId === "state-a") return "In Progress";
      if (stateId === "state-b") return "Done";
      return undefined;
    });

    expect(labels).toEqual(["In Progress", "Done", "state-c"]);
  });
});
