/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useParams: () => ({}),
  usePathname: () => "/",
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));

vi.mock("@plane/i18n", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/components/empty-state/simple-empty-state-root", () => ({
  SimpleEmptyState: () => <div>empty</div>,
}));

vi.mock("@/hooks/store/use-home", () => ({
  useHome: () => ({
    isAnyWidgetEnabled: false,
    loading: false,
    orderedWidgets: [],
    showWidgetSettings: false,
    toggleWidgetSettings: vi.fn(),
    widgetsMap: {},
  }),
}));

vi.mock("@/hooks/store/use-project", () => ({
  useProject: () => ({ loader: "loaded" }),
}));

vi.mock("@/plane-web/components/home/header", () => ({
  HomePageHeader: () => <div>header</div>,
}));

vi.mock("../stickies/widget", () => ({
  StickiesWidget: () => <div>stickies</div>,
}));

vi.mock("./widgets", () => ({
  HomeLoader: () => <div>loading</div>,
  NoProjectsEmptyState: () => <div>no projects</div>,
  RecentActivityWidget: () => <div>recents</div>,
}));

vi.mock("./widgets/links", () => ({
  DashboardQuickLinks: () => <div>links</div>,
}));

vi.mock("./widgets/manage", () => ({
  ManageWidgetsModal: () => null,
}));

import { DashboardWidgets } from "./home-dashboard-widgets";

describe("DashboardWidgets", () => {
  it("does not throw before the workspace route param is available", () => {
    expect(() => renderToStaticMarkup(<DashboardWidgets />)).not.toThrow();
  });
});
