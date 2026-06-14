/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
// plane imports
import type { TIssueProperty } from "@plane/types";

const { mockService } = vi.hoisted(() => ({
  mockService: {
    list: vi.fn(),
  },
}));

vi.mock("@/services/issue-property.service", () => ({
  IssuePropertyService: function IssuePropertyService() {
    return mockService;
  },
}));

import { IssuePropertyStore } from "./issue-property.store";

const SLUG = "acme";
const ISSUE_TYPE = "type-bug";

const property = (overrides: Partial<TIssueProperty> = {}): TIssueProperty => ({
  id: "property-1",
  workspace_id: "workspace-1",
  issue_type: ISSUE_TYPE,
  name: "severity",
  display_name: "Severity",
  property_type: "select",
  settings: { options: [{ label: "High", value: "high" }] },
  is_required: false,
  default_value: null,
  sort_order: 0,
  is_active: true,
  ...overrides,
});

describe("IssuePropertyStore", () => {
  let store: IssuePropertyStore;

  beforeEach(() => {
    vi.clearAllMocks();
    store = new IssuePropertyStore({} as never);
  });

  it("fetches and caches properties by issue type id", async () => {
    const rows = [property()];
    mockService.list.mockResolvedValue(rows);

    await store.fetchPropertiesForType(SLUG, ISSUE_TYPE);

    expect(mockService.list).toHaveBeenCalledWith(SLUG, ISSUE_TYPE);
    expect(store.getPropertiesForType(ISSUE_TYPE)).toEqual(rows);
    expect(store.getPropertiesLoadingForType(ISSUE_TYPE)).toBe(false);
    expect(store.hasFetchedPropertiesForType(ISSUE_TYPE)).toBe(true);
  });

  it("clears the loading state when the service rejects", async () => {
    mockService.list.mockRejectedValue({ error: "offline" });

    await expect(store.fetchPropertiesForType(SLUG, ISSUE_TYPE)).rejects.toEqual({ error: "offline" });

    expect(store.getPropertiesLoadingForType(ISSUE_TYPE)).toBe(false);
    expect(store.hasFetchedPropertiesForType(ISSUE_TYPE)).toBe(false);
  });
});
