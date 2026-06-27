/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import { stringToEmoji } from "@plane/propel/emoji-icon-picker";

describe("project sidebar logo emoji decoding", () => {
  it("decodes Plane decimal emoji values used by the emoji picker", () => {
    expect(stringToEmoji("128193")).toBe("📁");
  });

  it("renders raw Unicode emoji values stored in D1 backfill payloads", () => {
    expect(stringToEmoji("📁")).toBe("📁");
    expect(stringToEmoji("⚡")).toBe("⚡");
  });
});
