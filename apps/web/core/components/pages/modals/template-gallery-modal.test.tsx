// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { TPageTemplate } from "@plane/types";

import { TemplateGalleryModal } from "./template-gallery-modal";

const template = (overrides: Partial<TPageTemplate> = {}): TPageTemplate => ({
  id: "template-1",
  workspace: "workspace-1",
  project: null,
  name: "Runbook",
  description_json: {},
  description_binary: null,
  description_html: "<p>Restore service</p>",
  description_stripped: "Restore service",
  logo_props: {},
  template_type: "runbook",
  access: 0,
  owned_by: "user-1",
  is_active: true,
  created_at: "2026-06-23T00:00:00Z",
  updated_at: "2026-06-23T00:00:00Z",
  ...overrides,
});

describe("TemplateGalleryModal", () => {
  it("renders empty state when no templates are available", () => {
    const markup = renderToStaticMarkup(
      <TemplateGalleryModal isOpen workspaceSlug="acme" projectId="project-1" onClose={vi.fn()} initialTemplates={[]} />
    );

    expect(markup).toContain("Start from a template");
    expect(markup).toContain("No page templates are available");
  });

  it("renders available templates with access labels", () => {
    const markup = renderToStaticMarkup(
      <TemplateGalleryModal
        isOpen
        workspaceSlug="acme"
        projectId="project-1"
        onClose={vi.fn()}
        initialTemplates={[
          template(),
          template({ id: "template-2", name: "Private Charter", template_type: "charter", access: 1 }),
        ]}
      />
    );

    expect(markup).toContain("Runbook");
    expect(markup).toContain("Private Charter");
    expect(markup).toContain("Public");
    expect(markup).toContain("Private");
    expect(markup).toContain("Use template");
  });

  it("renders nothing when closed", () => {
    const markup = renderToStaticMarkup(
      <TemplateGalleryModal
        isOpen={false}
        workspaceSlug="acme"
        projectId="project-1"
        onClose={vi.fn()}
        initialTemplates={[template()]}
      />
    );

    expect(markup).toBe("");
  });
});
