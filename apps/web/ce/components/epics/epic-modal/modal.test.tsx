/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { TIssue } from "@plane/types";
// local imports
import { buildEpicModalPayload, CreateUpdateEpicModal, submitEpicModalForm } from "./modal";

vi.mock("next/navigation", () => ({
  useParams: () => ({
    projectId: "project-1",
    workspaceSlug: "acme",
  }),
}));

vi.mock("@plane/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@plane/ui")>();
  return {
    ...actual,
    EModalPosition: { TOP: "top" },
    EModalWidth: { XXL: "xxl" },
    ModalCore: ({ children, isOpen }: { children: React.ReactNode; isOpen: boolean }) =>
      isOpen ? <section>{children}</section> : null,
  };
});

vi.mock("@/components/dropdowns/project/dropdown", () => ({
  ProjectDropdown: ({ disabled, placeholder }: { disabled?: boolean; placeholder?: string }) => (
    <span data-disabled={disabled ? "true" : "false"}>{placeholder}</span>
  ),
}));

vi.mock("@/components/dropdowns/member/dropdown", () => ({
  MemberDropdown: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
}));

vi.mock("@/components/dropdowns/date", () => ({
  DateDropdown: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
}));

vi.mock("@/components/editor/rich-text", () => ({
  RichTextEditor: () => <div>Rich text editor</div>,
}));

vi.mock("@/hooks/store/use-editor-asset", () => ({
  useEditorAsset: () => ({
    duplicateEditorAsset: vi.fn(),
    uploadEditorAsset: vi.fn(),
  }),
}));

vi.mock("@/hooks/store/use-workspace", () => ({
  useWorkspace: () => ({
    getWorkspaceBySlug: () => ({ id: "workspace-1" }),
  }),
}));

vi.mock("@/hooks/store/user/user-user", () => ({
  useUser: () => ({
    projectsWithCreatePermissions: {
      "project-1": true,
    },
  }),
}));

describe("CreateUpdateEpicModal", () => {
  const formValues = {
    description_html: "<p>Coordinate launch readiness.</p>",
    lead_id: "member-1",
    name: " Launch readiness ",
    project_id: "project-1",
    start_date: "2026-07-01",
    target_date: "2026-07-31",
  };

  it("renders the scoped epic fields and actions when open", () => {
    const markup = renderToStaticMarkup(
      <CreateUpdateEpicModal isOpen onClose={vi.fn()} data={{ project_id: "project-1" }} />
    );

    expect(markup).toContain("Create epic");
    expect(markup).toContain("Epic title");
    expect(markup).toContain("Project");
    expect(markup).toContain("Lead");
    expect(markup).toContain("Description");
    expect(markup).toContain("Start date");
    expect(markup).toContain("Target date");
    expect(markup).toContain("Create");
  });

  it("disables project selection when requested", () => {
    const markup = renderToStaticMarkup(
      <CreateUpdateEpicModal isOpen isProjectSelectionDisabled onClose={vi.fn()} data={{ project_id: "project-1" }} />
    );

    expect(markup).toContain('data-disabled="true"');
  });

  it("builds a trimmed epic payload with a single lead assignee", () => {
    expect(buildEpicModalPayload(formValues)).toEqual({
      assignee_ids: ["member-1"],
      description_html: "<p>Coordinate launch readiness.</p>",
      name: "Launch readiness",
      project_id: "project-1",
      start_date: "2026-07-01",
      target_date: "2026-07-31",
    });
  });

  it("creates an epic through EpicService and closes on success", async () => {
    const response = { id: "epic-1", name: "Launch readiness" } as TIssue;
    const epicService = {
      create: vi.fn().mockResolvedValue(response),
      update: vi.fn(),
    };
    const onClose = vi.fn();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    await submitEpicModalForm({
      epicService,
      onClose,
      onSubmit,
      values: formValues,
      workspaceSlug: "acme",
    });

    expect(epicService.create).toHaveBeenCalledWith("acme", "project-1", {
      assignee_ids: ["member-1"],
      description_html: "<p>Coordinate launch readiness.</p>",
      name: "Launch readiness",
      project_id: "project-1",
      start_date: "2026-07-01",
      target_date: "2026-07-31",
    });
    expect(epicService.update).not.toHaveBeenCalled();
    expect(onSubmit).toHaveBeenCalledWith(response);
    expect(onClose).toHaveBeenCalled();
  });

  it("updates an existing epic through EpicService", async () => {
    const response = { id: "epic-1", name: "Launch readiness" } as TIssue;
    const epicService = {
      create: vi.fn(),
      update: vi.fn().mockResolvedValue(response),
    };

    await submitEpicModalForm({
      data: { id: "epic-1", project_id: "project-1" },
      epicService,
      onClose: vi.fn(),
      values: formValues,
      workspaceSlug: "acme",
    });

    expect(epicService.create).not.toHaveBeenCalled();
    expect(epicService.update).toHaveBeenCalledWith(
      "acme",
      "project-1",
      "epic-1",
      expect.objectContaining({
        name: "Launch readiness",
      })
    );
  });
});
