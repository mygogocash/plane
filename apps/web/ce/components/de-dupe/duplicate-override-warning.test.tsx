// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

/* SPDX-FileCopyrightText: 2023-present 650 Industries, Inc. <https://650.io/> */
/* SPDX-License-Identifier: AGPL-3.0-only */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  buildDuplicateOverridePayload,
  DUPLICATE_OVERRIDE_WARNING_TEXT,
  DuplicateOverrideWarning,
  shouldRequireDuplicateOverride,
} from "./duplicate-override-warning";

describe("DuplicateOverrideWarning", () => {
  it("renders an explicit create-anyway acknowledgement control", () => {
    const markup = renderToStaticMarkup(<DuplicateOverrideWarning checked={false} onCheckedChange={vi.fn()} />);

    expect(markup).toContain(DUPLICATE_OVERRIDE_WARNING_TEXT);
    expect(markup).toContain('type="checkbox"');
    expect(markup).toContain('aria-label="Create anyway after reviewing duplicate matches"');
  });

  it("requires acknowledgement only for unresolved high-confidence matches", () => {
    expect(shouldRequireDuplicateOverride(true, false)).toBe(true);
    expect(shouldRequireDuplicateOverride(true, true)).toBe(false);
    expect(shouldRequireDuplicateOverride(false, false)).toBe(false);
  });

  it("builds the override payload for acknowledged high-confidence matches", () => {
    expect(
      buildDuplicateOverridePayload(
        [
          { id: "issue-1", is_high_confidence: true },
          { id: "issue-2", is_high_confidence: false },
          { id: "issue-3", is_high_confidence: true },
        ],
        true,
        true,
        0.85
      )
    ).toEqual({
      acknowledged: true,
      candidate_issue_ids: ["issue-1", "issue-3"],
      threshold: 0.85,
    });
  });

  it("does not build an override payload before acknowledgement or without a high-confidence match", () => {
    expect(
      buildDuplicateOverridePayload([{ id: "issue-1", is_high_confidence: true }], false, true, 0.85)
    ).toBeUndefined();
    expect(
      buildDuplicateOverridePayload([{ id: "issue-1", is_high_confidence: true }], true, false, 0.85)
    ).toBeUndefined();
  });
});
