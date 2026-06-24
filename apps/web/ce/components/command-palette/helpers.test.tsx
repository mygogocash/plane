// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { commandGroups } from "./helpers";

vi.mock("@plane/propel/icons", () => ({
  CycleIcon: () => <span data-testid="cycle-icon" />,
  ModuleIcon: () => <span data-testid="module-icon" />,
  PageIcon: () => <span data-testid="page-icon" />,
  ProjectIcon: () => <span data-testid="project-icon" />,
  ViewsIcon: () => <span data-testid="views-icon" />,
}));

vi.mock("@/plane-web/components/issues/issue-details/issue-identifier", () => ({
  IssueIdentifier: () => <span data-testid="issue-identifier" />,
}));

const basePageResult = {
  id: "page-1",
  name: "Release Notes",
  project_ids: ["project-1"],
  project__identifiers: ["REL"],
  workspace__slug: "acme",
};

describe("commandGroups.page", () => {
  it("renders a plain-text snippet when the page search result provides one", () => {
    const markup = renderToStaticMarkup(
      commandGroups.page.itemName({
        ...basePageResult,
        snippet: "globalsearchmarker <script>alert(1)</script>",
      })
    );

    expect(markup).toContain("Release Notes");
    expect(markup).toContain("globalsearchmarker");
    expect(markup).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(markup).not.toContain("<script>alert(1)</script>");
  });

  it("renders a page row without a snippet block when snippet is absent", () => {
    const markup = renderToStaticMarkup(commandGroups.page.itemName(basePageResult));

    expect(markup).toContain("Release Notes");
    expect(markup).not.toContain("line-clamp-2");
  });
});
