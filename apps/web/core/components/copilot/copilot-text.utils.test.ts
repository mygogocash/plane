/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
// local imports
import { htmlToText, textToHtml } from "./copilot-text.utils";

describe("copilot text utilities", () => {
  it("converts sanitized HTML to editable text", () => {
    const result = htmlToText('<p>Plan kickoff</p><script>alert("x")</script><p>Assign owner<br/>Set due date</p>');

    expect(result).toBe("Plan kickoff\nAssign owner\nSet due date");
  });

  it("escapes editable text before storing it as HTML", () => {
    const result = textToHtml('First line\n<script>alert("x")</script>');

    expect(result).toBe("<p>First line<br/>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</p>");
  });
});
