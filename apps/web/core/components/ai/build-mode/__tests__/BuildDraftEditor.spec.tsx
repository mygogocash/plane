// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { BuildDraftEditor } from "../BuildDraftEditor";
import { applyBuildDraft } from "../build-draft.utils";

const draft = {
  name: "Mobile launch",
  description: "Ship the mobile app",
  work_items: [
    { name: "Auth flow", description: "OAuth login", priority: "high", estimate: 3, labels: ["mobile"] },
    { name: "Onboarding", priority: "medium" },
  ],
  suggested_cycle: { name: "Sprint 1", start_date: "2026-07-01", end_date: "2026-07-14" },
};

describe("BuildDraftEditor render", () => {
  it("renders the editable draft (name/desc/work_items/suggested_cycle)", () => {
    const markup = renderToStaticMarkup(
      <BuildDraftEditor draft={draft} draftToken="token-1" projectId="project-1" workspaceSlug="acme" />
    );

    expect(markup).toContain("Mobile launch");
    expect(markup).toContain("Ship the mobile app");
    expect(markup).toContain("Auth flow");
    expect(markup).toContain("Onboarding");
    expect(markup).toContain("Sprint 1");
    expect(markup).toContain("Apply draft");
    expect(markup).toContain("2 work items");
  });

  it("renders per-item warnings from a prior apply", () => {
    const markup = renderToStaticMarkup(
      <BuildDraftEditor
        draft={draft}
        draftToken="token-1"
        projectId="project-1"
        workspaceSlug="acme"
        initialWarnings={["Label mobile not found — skipped"]}
      />
    );

    expect(markup).toContain("Label mobile not found — skipped");
  });

  it("renders an empty state when there is no draft", () => {
    const markup = renderToStaticMarkup(
      <BuildDraftEditor draft={null} draftToken={null} projectId="project-1" workspaceSlug="acme" />
    );

    expect(markup).toContain("No draft yet");
    expect(markup).not.toContain("Apply draft");
  });
});

describe("applyBuildDraft", () => {
  it("Apply calls applyBuildDraft with the draft token and surfaces warnings", async () => {
    const service = {
      applyBuildDraft: vi.fn().mockResolvedValue({
        project_id: "project-2",
        issue_ids: ["issue-1"],
        warnings: ["Assignee skipped"],
      }),
    };

    const result = await applyBuildDraft({
      workspaceSlug: "acme",
      projectId: "project-1",
      draftToken: "token-1",
      draft,
      service,
    });

    expect(service.applyBuildDraft).toHaveBeenCalledWith("acme", "project-1", {
      draft_token: "token-1",
      project_draft: draft,
    });
    expect(result).toMatchObject({ status: "applied", warnings: ["Assignee skipped"] });
  });

  it("returns an error result when apply fails (nothing persisted client-side)", async () => {
    const service = {
      applyBuildDraft: vi.fn().mockRejectedValue({ error: "Quota exceeded" }),
    };

    const result = await applyBuildDraft({
      workspaceSlug: "acme",
      projectId: "project-1",
      draftToken: "token-1",
      draft,
      service,
    });

    expect(result).toEqual({ status: "error", message: "Quota exceeded" });
  });
});
