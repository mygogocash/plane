/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import { getViewportBreakpoint } from "./use-viewport";

describe("getViewportBreakpoint", () => {
  it("subject__given_phone_width__then_returns_mobile", () => {
    expect(getViewportBreakpoint(360)).toBe("mobile");
    expect(getViewportBreakpoint(767)).toBe("mobile");
  });

  it("subject__given_tablet_width__then_returns_tablet", () => {
    expect(getViewportBreakpoint(768)).toBe("tablet");
    expect(getViewportBreakpoint(1023)).toBe("tablet");
  });

  it("subject__given_desktop_width__then_returns_desktop", () => {
    expect(getViewportBreakpoint(1024)).toBe("desktop");
    expect(getViewportBreakpoint(1440)).toBe("desktop");
  });
});
