// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/markdown-to-component", () => ({
  MarkdownRenderer: ({ markdown }: { markdown: string }) => <div>{markdown}</div>,
}));

vi.mock("@plane/ui", () => ({
  EModalPosition: { TOP: "top", CENTER: "center" },
  EModalWidth: { XXL: "xxl" },
  ModalCore: ({ children, isOpen }: { children: React.ReactNode; isOpen?: boolean }) =>
    isOpen ? <div data-testid="ai-summary-modal">{children}</div> : null,
}));

vi.mock("@/plane-web/lib/self-host-entitlements", () => ({
  isSelfHostedFeatureEnabled: () => true,
}));

vi.mock("@plane/propel/toast", () => ({
  TOAST_TYPE: { SUCCESS: "success", ERROR: "error" },
  setToast: vi.fn(),
}));

import { AISummaryModal } from "../AISummaryModal";
import { GetDigestButton, requestEntityDigest } from "../GetDigestButton";
import { copyEntityShareLink } from "../summaries.utils";

const summary = {
  markdown: "## Digest\n\nCycle is on track with one blocker.",
  rollup: {
    percent_complete: 42,
    blockers: [{ issue_id: "issue-1", name: "Blocked item" }],
    at_risk: [{ issue_id: "issue-2", name: "At risk item" }],
  },
};

describe("AISummaryModal", () => {
  it("renders markdown and rollup stat cards on success", () => {
    const markup = renderToStaticMarkup(
      <AISummaryModal isOpen onClose={() => undefined} status="success" summary={summary} title="Cycle digest" />
    );

    expect(markup).toContain("Cycle is on track with one blocker.");
    expect(markup).toContain("42%");
    expect(markup).toContain("Blockers");
    expect(markup).toContain("At risk");
  });
});

describe("copyEntityShareLink", () => {
  it("copy share link calls createShareLink and surfaces the URL", async () => {
    const service = {
      summarizeEntity: vi.fn(),
      createShareLink: vi.fn().mockResolvedValue({
        ...summary,
        share_token: "token-123",
        share_url: "/api/workspaces/acme/summaries/shared/token-123/",
        expires_at: null,
      }),
    };

    const shareUrl = await copyEntityShareLink({
      workspaceSlug: "acme",
      entityType: "cycle",
      entityId: "cycle-1",
      service,
      origin: "https://app.manut.xyz",
    });

    expect(service.createShareLink).toHaveBeenCalledWith("acme", "cycle", "cycle-1");
    expect(shareUrl).toBe("https://app.manut.xyz/api/workspaces/acme/summaries/shared/token-123/");
  });
});

describe("GetDigestButton", () => {
  it("thinking copy shows during in-flight request", () => {
    const markup = renderToStaticMarkup(
      <GetDigestButton
        workspaceSlug="acme"
        entityType="cycle"
        entityId="cycle-1"
        isProviderConfigured
        initialStatus="loading"
        isModalOpen
      />
    );

    expect(markup).toContain("AI is thinking");
  });

  it("provider missing → disabled button with connect hint", () => {
    const markup = renderToStaticMarkup(
      <GetDigestButton workspaceSlug="acme" entityType="project" entityId="project-1" isProviderConfigured={false} />
    );

    expect(markup).toContain("Configure AI provider");
    expect(markup).toContain("disabled");
  });

  it("requestEntityDigest loads summarizeEntity for the scoped entity", async () => {
    const service = {
      summarizeEntity: vi.fn().mockResolvedValue(summary),
      createShareLink: vi.fn(),
    };

    const result = await requestEntityDigest({
      workspaceSlug: "acme",
      entityType: "initiative",
      entityId: "initiative-1",
      service,
    });

    expect(service.summarizeEntity).toHaveBeenCalledWith("acme", "initiative", "initiative-1");
    expect(result).toMatchObject({ status: "success", summary });
  });
});
