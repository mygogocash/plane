/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
// local imports
import { ProjectEpicsPageRoot } from "./epics-route";

const { entitlement, liveLayout } = vi.hoisted(() => ({
  entitlement: {
    epicsEnabled: false,
  },
  liveLayout: vi.fn(),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));

vi.mock("@/hooks/use-app-router", () => ({
  useAppRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/components/issues/issue-layouts/roots/epic-layout-root", () => ({
  EpicLayoutRoot: () => {
    liveLayout();
    return <div>Live epics layout</div>;
  },
}));

vi.mock("@/components/empty-state/detailed-empty-state-root", () => ({
  DetailedEmptyState: ({
    description,
    primaryButton,
    title,
  }: {
    description?: string;
    primaryButton?: { text: string };
    title: string;
  }) => (
    <section>
      <h1>{title}</h1>
      {description && <p>{description}</p>}
      {primaryButton && <button>{primaryButton.text}</button>}
    </section>
  ),
}));

vi.mock("@/plane-web/lib/self-host-entitlements", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/plane-web/lib/self-host-entitlements")>();
  type FeatureFlag = Parameters<typeof actual.isSelfHostedFeatureEnabled>[0];

  return {
    ...actual,
    isSelfHostedFeatureEnabled: (feature: FeatureFlag) =>
      feature === "epics" ? entitlement.epicsEnabled : actual.isSelfHostedFeatureEnabled(feature),
  };
});

describe("ProjectEpicsPageRoot", () => {
  beforeEach(() => {
    entitlement.epicsEnabled = false;
    liveLayout.mockReset();
  });

  it("renders the settings CTA and requests no live epic layout when epics are disabled", () => {
    const markup = renderToStaticMarkup(
      <ProjectEpicsPageRoot workspaceSlug="acme" projectId="project-1" pageTitle="Acme - Epics" />
    );

    expect(markup).toContain("Epics are disabled");
    expect(markup).toContain("Enable epics in project settings");
    expect(markup).not.toContain("Live epics layout");
    expect(liveLayout).not.toHaveBeenCalled();
  });

  it("renders the live epic layout when epics are enabled", () => {
    entitlement.epicsEnabled = true;

    const markup = renderToStaticMarkup(
      <ProjectEpicsPageRoot workspaceSlug="acme" projectId="project-1" pageTitle="Acme - Epics" />
    );

    expect(markup).toContain("Live epics layout");
    expect(liveLayout).toHaveBeenCalledTimes(1);
  });
});
