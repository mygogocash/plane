// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { PageNavigationPaneInfoTabBacklinksList } from "./backlinks";

function ProjectPageService() {
  return {
    fetchBacklinks: () => Promise.resolve({ backlinks: [] }),
  };
}

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ workspaceSlug: "acme", projectId: "project-1" }),
}));

vi.mock("@/services/page", () => ({
  ProjectPageService,
}));

describe("PageNavigationPaneInfoTabBacklinksList", () => {
  it("renders backlink page links", () => {
    const markup = renderToStaticMarkup(
      <PageNavigationPaneInfoTabBacklinksList
        backlinks={[
          {
            id: "page-1",
            name: "Source Page",
            workspace__slug: "acme",
            project_ids: ["project-1"],
            project_identifiers: ["SRC"],
            updated_at: "2026-06-23T00:00:00Z",
          },
        ]}
      />
    );

    expect(markup).toContain("Source Page");
    expect(markup).toContain("SRC");
    expect(markup).toContain('href="/acme/projects/project-1/pages/page-1"');
  });

  it("renders the empty state when no backlinks exist", () => {
    const markup = renderToStaticMarkup(<PageNavigationPaneInfoTabBacklinksList backlinks={[]} />);

    expect(markup).toContain("No pages link here yet.");
  });
});
