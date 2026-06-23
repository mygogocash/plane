import { describe, expect, it } from "vitest";

import { shouldQueryDuplicateIssues } from "./use-debounced-duplicate-issues";

describe("shouldQueryDuplicateIssues", () => {
  it("requires workspace, project, and a title long enough to query", () => {
    expect(shouldQueryDuplicateIssues("acme", "project-1", "login")).toBe(true);
    expect(shouldQueryDuplicateIssues(undefined, "project-1", "login")).toBe(false);
    expect(shouldQueryDuplicateIssues("acme", undefined, "login")).toBe(false);
    expect(shouldQueryDuplicateIssues("acme", "project-1", "bug")).toBe(false);
  });
});
