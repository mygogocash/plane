/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { TIssueProperty, TIssuePropertyValues } from "@plane/types";
// local imports
import { EpicProperties, saveEpicPropertyValues } from "./properties";

vi.mock("@/components/dropdowns/member/dropdown", () => ({
  MemberDropdown: ({ placeholder, value }: { placeholder?: string; value?: string | null }) => (
    <span data-value={value ?? ""}>{placeholder}</span>
  ),
}));

const epicProperty = (overrides: Partial<TIssueProperty>): TIssueProperty => ({
  id: "property-1",
  workspace_id: "workspace-1",
  issue_type: "type-epic",
  name: "launch-summary",
  display_name: "Launch summary",
  property_type: "text",
  settings: {},
  is_multi: false,
  is_required: false,
  default_value: null,
  sort_order: 0,
  is_active: true,
  ...overrides,
});

describe("EpicProperties", () => {
  it("renders text, multi-option, and member property fields", () => {
    const markup = renderToStaticMarkup(
      <EpicProperties
        workspaceSlug="acme"
        projectId="project-1"
        epicId="epic-1"
        issueTypeId="type-epic"
        initialProperties={[
          epicProperty({ id: "summary", display_name: "Summary", property_type: "text" }),
          epicProperty({
            id: "tier",
            display_name: "Tier",
            property_type: "option",
            is_multi: true,
            settings: {
              options: [
                { label: "Beta", value: "option-beta" },
                { label: "GA", value: "option-ga" },
              ],
            },
          }),
          epicProperty({ id: "owner", display_name: "Owner", property_type: "member" }),
        ]}
        initialValues={{
          owner: "member-1",
          summary: "Launch in Q3",
          tier: ["option-beta", "option-ga"],
        }}
      />
    );

    expect(markup).toContain("Summary");
    expect(markup).toContain("Tier");
    expect(markup).toContain("Owner");
    expect(markup).toContain('name="summary"');
    expect(markup).toContain('multiple=""');
    expect(markup).toContain('data-value="member-1"');
  });

  it("persists each edited property value through EpicService", async () => {
    const setPropertyValue = vi.fn().mockResolvedValue({ property_values: {} });
    const values: TIssuePropertyValues = {
      owner: "member-1",
      summary: "Launch in Q3",
      tier: ["option-beta", "option-ga"],
    };

    await saveEpicPropertyValues({
      epicId: "epic-1",
      projectId: "project-1",
      service: {
        setPropertyValue,
      },
      values,
      workspaceSlug: "acme",
    });

    expect(setPropertyValue).toHaveBeenCalledWith("acme", "project-1", "epic-1", "summary", "Launch in Q3");
    expect(setPropertyValue).toHaveBeenCalledWith("acme", "project-1", "epic-1", "tier", ["option-beta", "option-ga"]);
    expect(setPropertyValue).toHaveBeenCalledWith("acme", "project-1", "epic-1", "owner", "member-1");
  });
});
