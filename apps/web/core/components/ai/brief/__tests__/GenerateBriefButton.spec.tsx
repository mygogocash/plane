// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/plane-web/lib/self-host-entitlements", () => ({
  isSelfHostedFeatureEnabled: () => true,
}));

vi.mock("@plane/propel/toast", () => ({
  TOAST_TYPE: { SUCCESS: "success", ERROR: "error" },
  setToast: vi.fn(),
}));

import { GenerateBriefButton, buildBriefPagePath, requestGenerateBrief } from "../GenerateBriefButton";

describe("GenerateBriefButton", () => {
  it("generate brief success links the new page and shows regenerate control", () => {
    const markup = renderToStaticMarkup(
      <GenerateBriefButton
        workspaceSlug="acme"
        projectId="project-1"
        issueId="issue-1"
        isProviderConfigured
        initialPageId="page-123"
        initialStatus="success"
      />
    );

    expect(markup).toContain('data-testid="brief-page-link"');
    expect(markup).toContain("/acme/projects/project-1/pages/page-123");
    expect(markup).toContain('data-testid="regenerate-brief-control"');
    expect(markup).toContain("View brief");
  });

  it("provider missing → renders nothing", () => {
    const markup = renderToStaticMarkup(
      <GenerateBriefButton workspaceSlug="acme" projectId="project-1" issueId="issue-1" isProviderConfigured={false} />
    );

    expect(markup).toBe("");
  });
});

describe("requestGenerateBrief", () => {
  it("calls generateBrief and returns page link data on success", async () => {
    const service = {
      generateBrief: vi.fn().mockResolvedValue({ page_id: "page-123" }),
    };

    const result = await requestGenerateBrief({
      workspaceSlug: "acme",
      projectId: "project-1",
      issueId: "issue-1",
      service,
    });

    expect(service.generateBrief).toHaveBeenCalledWith("acme", "project-1", "issue-1", { regenerate: false });
    expect(result).toMatchObject({ status: "success", pageId: "page-123" });
    expect(buildBriefPagePath("acme", "project-1", "page-123")).toBe("/acme/projects/project-1/pages/page-123");
  });

  it("regenerate does not blindly destroy prior page (calls regenerate path)", async () => {
    const service = {
      generateBrief: vi.fn().mockResolvedValue({ page_id: "page-456", regenerated: true }),
    };

    const result = await requestGenerateBrief({
      workspaceSlug: "acme",
      projectId: "project-1",
      issueId: "issue-1",
      regenerate: true,
      service,
    });

    expect(service.generateBrief).toHaveBeenCalledWith("acme", "project-1", "issue-1", { regenerate: true });
    expect(result).toMatchObject({ status: "success", pageId: "page-456", regenerated: true });
  });
});
