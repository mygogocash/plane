// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { describe, expect, it } from "vitest";

import { shouldReplaceSelectionOnAccept, validateTranslateInput } from "../translate.utils";

describe("translate editor helpers", () => {
  it("translate item replaces selection only on Accept; Cancel leaves text untouched", () => {
    expect(shouldReplaceSelectionOnAccept("accept")).toBe(true);
    expect(shouldReplaceSelectionOnAccept("cancel")).toBe(false);
  });

  it("empty selection or blank language → validation error, no replace", () => {
    expect(validateTranslateInput("", "es")).toMatchObject({
      ok: false,
      message: "Select text to translate.",
    });
    expect(validateTranslateInput("Hello", "")).toMatchObject({
      ok: false,
      message: "Choose a target language.",
    });
    expect(validateTranslateInput("   ", "es")).toMatchObject({ ok: false });
    expect(validateTranslateInput("Hello", "   ")).toMatchObject({ ok: false });
    expect(validateTranslateInput("Hello", "es")).toEqual({ ok: true });
  });
});
