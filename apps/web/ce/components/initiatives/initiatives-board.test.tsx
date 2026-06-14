/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { renderToStaticMarkup } from "react-dom/server";
import type { TInitiative } from "@plane/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
// local imports
import { InitiativesPageRoot } from "./root";
import { createDefaultInitiativeViewState, InitiativesBoard, updateInitiativeViewState } from "./initiatives-board";

const { entitlement, liveInitiativesFetch } = vi.hoisted(() => ({
  entitlement: {
    initiativesEnabled: false,
  },
  liveInitiativesFetch: vi.fn(),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
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

vi.mock("./workspace-view", () => ({
  InitiativesWorkspaceView: () => {
    liveInitiativesFetch();
    return <div>Live initiatives workspace</div>;
  },
}));

vi.mock("@/plane-web/lib/self-host-entitlements", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/plane-web/lib/self-host-entitlements")>();
  type FeatureFlag = Parameters<typeof actual.isSelfHostedFeatureEnabled>[0];

  return {
    ...actual,
    isSelfHostedFeatureEnabled: (feature: FeatureFlag) =>
      feature === "initiatives" ? entitlement.initiativesEnabled : actual.isSelfHostedFeatureEnabled(feature),
  };
});

const initiativeFactory = (overrides: Partial<TInitiative>): TInitiative => ({
  id: "initiative-1",
  name: "Initiative",
  state: "DRAFT",
  lead_id: null,
  sort_order: 0,
  ...overrides,
});

const markupBetween = (markup: string, startMarker: string, endMarker: string) => {
  const start = markup.indexOf(startMarker);
  const end = markup.indexOf(endMarker, start + startMarker.length);

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);

  return markup.slice(start, end);
};

describe("InitiativesBoard", () => {
  beforeEach(() => {
    entitlement.initiativesEnabled = false;
    liveInitiativesFetch.mockReset();
  });

  it("renders exactly five lifecycle columns and places initiatives in their state column", () => {
    const markup = renderToStaticMarkup(
      <InitiativesBoard
        initiatives={[
          initiativeFactory({ id: "draft-initiative", name: "Draft launch", state: "DRAFT" }),
          initiativeFactory({ id: "active-initiative", name: "Active rollout", state: "ACTIVE" }),
        ]}
        viewState={createDefaultInitiativeViewState()}
      />
    );

    expect(markup.match(/data-testid="initiative-state-column"/g) ?? []).toHaveLength(5);
    expect(markup).toContain("Draft");
    expect(markup).toContain("Planned");
    expect(markup).toContain("Active");
    expect(markup).toContain("Completed");
    expect(markup).toContain("Closed");
    expect(markupBetween(markup, 'aria-label="Draft initiatives"', 'aria-label="Planned initiatives"')).toContain(
      "Draft launch"
    );
    expect(markupBetween(markup, 'aria-label="Active initiatives"', 'aria-label="Completed initiatives"')).toContain(
      "Active rollout"
    );
  });

  it("renders the create-your-first-initiative empty state and fetches no data when the initiatives flag is false", () => {
    const markup = renderToStaticMarkup(<InitiativesPageRoot workspaceSlug="acme" pageTitle="Acme - Initiatives" />);

    expect(markup).toContain("Create your first initiative");
    expect(markup).not.toContain("Live initiatives workspace");
    expect(liveInitiativesFetch).not.toHaveBeenCalled();
  });

  it("persists a state and lead filter when switching board to timeline", () => {
    const boardState = updateInitiativeViewState(createDefaultInitiativeViewState(), {
      leadId: "lead-1",
      state: "ACTIVE",
    });
    const timelineState = updateInitiativeViewState(boardState, { layout: "timeline" });
    const markup = renderToStaticMarkup(
      <InitiativesBoard
        initiatives={[
          initiativeFactory({ id: "lead-active", name: "Lead initiative", lead_id: "lead-1", state: "ACTIVE" }),
          initiativeFactory({ id: "other-active", name: "Other initiative", lead_id: "lead-2", state: "ACTIVE" }),
        ]}
        viewState={timelineState}
      />
    );

    expect(timelineState).toMatchObject({ layout: "timeline", leadId: "lead-1", state: "ACTIVE" });
    expect(markup).toContain('data-active-layout="timeline"');
    expect(markup).toContain('data-filter-lead-id="lead-1"');
    expect(markup).toContain('data-filter-state="ACTIVE"');
    expect(markup).toContain("Lead initiative");
    expect(markup).not.toContain("Other initiative");
  });
});
