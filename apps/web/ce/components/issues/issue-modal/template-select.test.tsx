/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
// plane imports
import type { TWorkItemTemplate } from "@plane/types";
// components
import { WorkItemTemplateSettingsManager } from "@/components/settings/templates/work-item-template-manager";
// local imports
import { WorkItemTemplateSelect } from "./template-select";

const { entitlement, issueModalRef, templateStoreRef } = vi.hoisted(() => ({
  entitlement: {
    templatesEnabled: true,
  },
  issueModalRef: {
    current: {
      workItemTemplateId: null as string | null,
      setWorkItemTemplateId: vi.fn(),
    },
  },
  templateStoreRef: {
    current: undefined as unknown,
  },
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ workspaceSlug: "acme" }),
}));

vi.mock("@/hooks/context/use-issue-modal", () => ({
  useIssueModal: () => issueModalRef.current,
}));

vi.mock("@/hooks/store/use-work-item-template", () => ({
  useWorkItemTemplate: () => templateStoreRef.current,
}));

vi.mock("@/plane-web/lib/self-host-entitlements", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/plane-web/lib/self-host-entitlements")>();
  type FeatureFlag = Parameters<typeof actual.isSelfHostedFeatureEnabled>[0];

  return {
    ...actual,
    isSelfHostedFeatureEnabled: (feature: FeatureFlag) =>
      feature === "templates" ? entitlement.templatesEnabled : actual.isSelfHostedFeatureEnabled(feature),
  };
});

const template = (overrides: Partial<TWorkItemTemplate> = {}): TWorkItemTemplate => ({
  id: "template-1",
  project_id: "project-1",
  workspace_id: "workspace-1",
  name: "Bug report",
  description_html: "Default bug report",
  template_data: {},
  issue_type: "type-bug",
  is_active: true,
  created_at: "2026-06-14T00:00:00Z",
  updated_at: "2026-06-14T00:00:00Z",
  ...overrides,
});

const setTemplates = (templates: TWorkItemTemplate[]) => {
  templateStoreRef.current = {
    fetchTemplates: vi.fn(),
    getTemplatesForProject: () => templates,
    getActiveTemplatesForProject: (_projectId: string, typeId?: string | null) =>
      templates.filter((row) => row.is_active && (!typeId || !row.issue_type || row.issue_type === typeId)),
    getTemplatesLoadingForProject: () => false,
    hasFetchedTemplatesForProject: () => true,
    createTemplate: vi.fn(),
    updateTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
  };
};

describe("WorkItemTemplateSelect", () => {
  beforeEach(() => {
    entitlement.templatesEnabled = true;
    issueModalRef.current = {
      workItemTemplateId: null,
      setWorkItemTemplateId: vi.fn(),
    };
    setTemplates([]);
  });

  it("shows the self-host empty state when no templates exist", () => {
    const markup = renderToStaticMarkup(
      <WorkItemTemplateSelect projectId="project-1" typeId="type-bug" handleModalClose={vi.fn()} />
    );

    expect(markup).toContain("Self-hosted");
    expect(markup).toContain("no templates yet");
    expect(markup).not.toContain("Upgrade");
  });

  it("renders template options when templates are returned", () => {
    setTemplates([
      template({ id: "template-bug", name: "Bug report", issue_type: "type-bug" }),
      template({ id: "template-any", name: "Any work item", issue_type: null }),
      template({ id: "template-story", name: "Story kickoff", issue_type: "type-story" }),
    ]);

    const markup = renderToStaticMarkup(
      <WorkItemTemplateSelect projectId="project-1" typeId="type-bug" handleModalClose={vi.fn()} />
    );

    expect(markup).toContain("Bug report");
    expect(markup).toContain("Any work item");
    expect(markup).not.toContain("Story kickoff");
  });

  it("hides picker when the templates flag is off", () => {
    entitlement.templatesEnabled = false;
    setTemplates([template()]);

    const markup = renderToStaticMarkup(
      <WorkItemTemplateSelect projectId="project-1" typeId="type-bug" handleModalClose={vi.fn()} />
    );

    expect(markup).toBe("");
  });

  it("hides inactive templates from the picker but keeps them in the manager list", () => {
    setTemplates([
      template({ id: "template-active", name: "Active template", is_active: true }),
      template({ id: "template-inactive", name: "Inactive template", is_active: false }),
    ]);

    const pickerMarkup = renderToStaticMarkup(
      <WorkItemTemplateSelect projectId="project-1" typeId="type-bug" handleModalClose={vi.fn()} />
    );
    const managerMarkup = renderToStaticMarkup(
      <WorkItemTemplateSettingsManager workspaceSlug="acme" projectId="project-1" isEditable />
    );

    expect(pickerMarkup).toContain("Active template");
    expect(pickerMarkup).not.toContain("Inactive template");
    expect(managerMarkup).toContain("Active template");
    expect(managerMarkup).toContain("Inactive template");
  });
});
