/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { FormProvider, useForm } from "react-hook-form";
import { beforeEach, describe, expect, it, vi } from "vitest";
// plane imports
import type { TIssue, TIssueProperty } from "@plane/types";
// local imports
import { WorkItemModalAdditionalProperties } from "./modal-additional-properties";

const { entitlement, issuePropertyStoreRef } = vi.hoisted(() => ({
  entitlement: {
    workItemTypesEnabled: true,
  },
  issuePropertyStoreRef: {
    current: undefined as unknown,
  },
}));

vi.mock("@/plane-web/lib/self-host-entitlements", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/plane-web/lib/self-host-entitlements")>();
  type FeatureFlag = Parameters<typeof actual.isSelfHostedFeatureEnabled>[0];

  return {
    ...actual,
    isSelfHostedFeatureEnabled: (feature: FeatureFlag) =>
      feature === "work_item_types" ? entitlement.workItemTypesEnabled : actual.isSelfHostedFeatureEnabled(feature),
  };
});

vi.mock("@/hooks/store/use-issue-property", () => ({
  useIssueProperty: () => issuePropertyStoreRef.current,
}));

const issueProperty = (overrides: Partial<TIssueProperty>): TIssueProperty => ({
  id: "property-1",
  workspace_id: "workspace-1",
  issue_type: "type-bug",
  name: "severity",
  display_name: "Severity",
  property_type: "select",
  settings: {
    options: [
      { label: "High", value: "high" },
      { label: "Low", value: "low" },
    ],
  },
  is_required: false,
  default_value: null,
  sort_order: 0,
  is_active: true,
  ...overrides,
});

const renderAdditionalProperties = ({
  typeId,
  propertiesByType,
}: {
  typeId: string | null;
  propertiesByType: Record<string, TIssueProperty[]>;
}) => {
  const issuePropertyStore = {
    getPropertiesForType: (selectedTypeId: string) => propertiesByType[selectedTypeId] ?? [],
    getPropertiesLoadingForType: () => false,
    hasFetchedPropertiesForType: () => true,
    fetchPropertiesForType: vi.fn(),
  };
  issuePropertyStoreRef.current = issuePropertyStore;

  const TestHarness = () => {
    const methods = useForm<Partial<TIssue>>({
      defaultValues: {
        type_id: typeId,
        property_values: {},
      },
    });

    return (
      <FormProvider {...methods}>
        <WorkItemModalAdditionalProperties
          isDraft={false}
          projectId="project-1"
          workItemId="issue-1"
          workspaceSlug="acme"
        />
      </FormProvider>
    );
  };

  return renderToStaticMarkup(<TestHarness />);
};

describe("WorkItemModalAdditionalProperties", () => {
  beforeEach(() => {
    entitlement.workItemTypesEnabled = true;
  });

  it("renders dynamic property fields for the selected issue type", () => {
    const markup = renderAdditionalProperties({
      typeId: "type-bug",
      propertiesByType: {
        "type-bug": [
          issueProperty({ id: "severity", display_name: "Severity" }),
          issueProperty({ id: "release-notes", display_name: "Release notes", property_type: "text" }),
        ],
      },
    });

    expect(markup).toContain("Severity");
    expect(markup).toContain("Release notes");
    expect(markup).toContain('name="property_values.severity"');
    expect(markup).toContain('name="property_values.release-notes"');
  });

  it("removes previous type fields and renders the new type fields on type switch", () => {
    const bugMarkup = renderAdditionalProperties({
      typeId: "type-bug",
      propertiesByType: {
        "type-bug": [issueProperty({ id: "severity", display_name: "Severity" })],
        "type-story": [issueProperty({ id: "story-points", display_name: "Story points", property_type: "number" })],
      },
    });
    const storyMarkup = renderAdditionalProperties({
      typeId: "type-story",
      propertiesByType: {
        "type-bug": [issueProperty({ id: "severity", display_name: "Severity" })],
        "type-story": [issueProperty({ id: "story-points", display_name: "Story points", property_type: "number" })],
      },
    });

    expect(bugMarkup).toContain("Severity");
    expect(storyMarkup).not.toContain("Severity");
    expect(storyMarkup).toContain("Story points");
  });

  it("renders nothing when the selected issue type has no properties", () => {
    const markup = renderAdditionalProperties({
      typeId: "type-bug",
      propertiesByType: {
        "type-bug": [],
      },
    });

    expect(markup).toBe("");
  });

  it("hides when the work item types feature flag is off", () => {
    entitlement.workItemTypesEnabled = false;

    const markup = renderAdditionalProperties({
      typeId: "type-bug",
      propertiesByType: {
        "type-bug": [issueProperty({ id: "severity", display_name: "Severity" })],
      },
    });

    expect(markup).toBe("");
  });
});
