// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@plane/propel/toast", () => ({
  TOAST_TYPE: {
    ERROR: "error",
    SUCCESS: "success",
  },
  setToast: vi.fn(),
}));

import { DeDupeButtonRoot } from "./de-dupe-button";
import {
  DuplicateModalRoot,
  formatMatchedFields,
  linkDuplicateIssue,
  shouldRenderDuplicateBanner,
} from "./duplicate-modal";
import type { TSimilarIssue } from "@/types/similar-issue";

const issue = (overrides: Partial<TSimilarIssue> = {}): TSimilarIssue => ({
  id: "issue-1",
  name: "Checkout payment fails on mobile",
  confidence: 0.86,
  ...overrides,
});

describe("DeDupeButtonRoot", () => {
  it("shows similar-items banner trigger with confidence count", () => {
    const markup = renderToStaticMarkup(
      <DeDupeButtonRoot
        workspaceSlug="acme"
        isDuplicateModalOpen={false}
        label="2 duplicate issues found"
        handleOnClick={vi.fn()}
      />
    );

    expect(markup).toContain("2 duplicate issues found");
    expect(markup).toContain('aria-expanded="false"');
  });
});

describe("DuplicateModalRoot", () => {
  it("shows similar-items banner with confidence and link action", () => {
    const markup = renderToStaticMarkup(
      <DuplicateModalRoot
        workspaceSlug="acme"
        projectId="project-1"
        rootIssueId="issue-root"
        issues={[
          issue({ matched_on: ["title", "description"] }),
          issue({ id: "issue-2", name: "Checkout fails after 3DS", confidence: 0.72 }),
        ]}
        handleDuplicateIssueModal={vi.fn()}
      />
    );

    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain("Similar work items");
    expect(markup).toContain("86%");
    expect(markup).toContain("Matched on title and description");
    expect(markup).toContain("Checkout payment fails on mobile");
    expect(markup).toContain("Link as duplicate");
  });

  it("formats matched fields for transparent duplicate scoring", () => {
    expect(formatMatchedFields(["title"])).toBe("title");
    expect(formatMatchedFields(["title", "description"])).toBe("title and description");
    expect(formatMatchedFields(["source_issue", "description"])).toBe("source issue and description");
  });

  it("does not render when results are empty or dismissed", () => {
    expect(shouldRenderDuplicateBanner([], false)).toBe(false);
    expect(shouldRenderDuplicateBanner([issue()], true)).toBe(false);
    expect(
      renderToStaticMarkup(<DuplicateModalRoot workspaceSlug="acme" issues={[]} handleDuplicateIssueModal={vi.fn()} />)
    ).toBe("");
  });

  it("link as duplicate creates a duplicate relation payload", async () => {
    const createIssueRelations = vi.fn().mockResolvedValue([]);

    await linkDuplicateIssue({
      workspaceSlug: "acme",
      projectId: "project-1",
      rootIssueId: "issue-root",
      duplicateIssueId: "issue-1",
      createIssueRelations,
    });

    expect(createIssueRelations).toHaveBeenCalledWith("acme", "project-1", "issue-root", {
      relation_type: "duplicate",
      issues: ["issue-1"],
    });
  });
});
