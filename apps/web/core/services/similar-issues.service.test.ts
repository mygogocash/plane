// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { describe, expect, it, vi } from "vitest";

import { duplicateCandidateToSimilarIssue, SimilarIssuesService } from "./similar-issues.service";

describe("SimilarIssuesService", () => {
  it("keeps the existing similar-issues list response shape", async () => {
    const service = new SimilarIssuesService();
    const getSpy = vi.spyOn(service as any, "get").mockResolvedValue({
      data: {
        results: [{ id: "issue-1", name: "Login crash", confidence: 0.86 }],
      },
    });

    const result = await service.list("acme", "project-1", "login crash", 3);

    expect(getSpy).toHaveBeenCalledWith("/api/workspaces/acme/projects/project-1/issues/similar/", {
      params: { title: "login crash", limit: 3 },
    });
    expect(result).toEqual([{ id: "issue-1", name: "Login crash", confidence: 0.86 }]);
  });

  it("calls duplicate-check and maps candidates to similar issue cards", async () => {
    const service = new SimilarIssuesService();
    vi.spyOn(service as any, "post").mockResolvedValue({
      data: {
        candidates: [
          {
            issue_id: "issue-1",
            name: "Login crash",
            score: 0.91,
            matched_on: ["title"],
          },
        ],
        high_confidence: true,
        threshold: 0.65,
        retrieval: "keyword",
      },
    });

    const result = await service.listDuplicates("acme", "project-1", {
      title: "Login crash",
      description: "",
      project_id: "project-1",
    });

    expect(result).toMatchObject([
      {
        id: "issue-1",
        name: "Login crash",
        confidence: 0.91,
        matched_on: ["title"],
      },
    ]);
  });

  it("maps duplicate-check candidates to existing de-dupe issue shape", () => {
    expect(
      duplicateCandidateToSimilarIssue({
        issue_id: "issue-1",
        name: "Checkout failure",
        score: 0.72,
        matched_on: ["title", "description"],
      })
    ).toMatchObject({
      id: "issue-1",
      name: "Checkout failure",
      confidence: 0.72,
      matched_on: ["title", "description"],
    });
  });
  it("marks duplicate candidates that meet the blocking threshold", () => {
    expect(
      duplicateCandidateToSimilarIssue(
        {
          issue_id: "issue-1",
          name: "Login dashboard crash",
          score: 0.91,
          matched_on: ["title"],
        },
        0.65
      )
    ).toMatchObject({
      is_high_confidence: true,
      duplicate_threshold: 0.65,
    });

    expect(
      duplicateCandidateToSimilarIssue(
        {
          issue_id: "issue-2",
          name: "Settings copy issue",
          score: 0.42,
          matched_on: ["description"],
        },
        0.65
      )
    ).toMatchObject({
      is_high_confidence: false,
      duplicate_threshold: 0.65,
    });
  });
});
