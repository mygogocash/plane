/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
// types
import type { TRecurringIssue } from "@/types/recurring-work-item";
// local imports
import { IssueRecurrenceBadge } from "./recurrence-badge";

const issue = (overrides: Partial<TRecurringIssue> = {}): TRecurringIssue =>
  ({
    id: "issue-1",
    name: "Generated issue",
    project_id: "project-1",
    is_recurring: true,
    ...overrides,
  }) as TRecurringIssue;

describe("IssueRecurrenceBadge", () => {
  it("renders a recurrence badge for generated recurring work items", () => {
    const markup = renderToStaticMarkup(<IssueRecurrenceBadge issue={issue()} />);

    expect(markup).toContain("Recurring");
  });

  it("renders nothing for manually created work items", () => {
    const markup = renderToStaticMarkup(<IssueRecurrenceBadge issue={issue({ is_recurring: false })} />);

    expect(markup).toBe("");
  });
});
