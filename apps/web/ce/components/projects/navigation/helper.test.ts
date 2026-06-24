/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";

import { EProjectFeatureKey } from "@plane/constants";

import { getProjectFeatureNavigation } from "./helper";

describe("getProjectFeatureNavigation", () => {
  it("includes epics in the project navigation", () => {
    const navigationItems = getProjectFeatureNavigation("workspace", "project", {
      cycle_view: false,
      module_view: false,
      issue_views_view: false,
      page_view: false,
      inbox_view: false,
    });

    expect(navigationItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          href: "/workspace/projects/project/epics",
          key: EProjectFeatureKey.EPICS,
          name: "Epics",
          shouldRender: true,
        }),
      ])
    );
  });
});
