/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Regression for the production crash (frontend route error d33250f0 on /gogocash/):
// the projects sidebar <Transition> rendered a Fragment wrapping TWO children
// (the init-loader skeleton + Disclosure.Panel). Under Headless UI v2 a Fragment
// transition must forward a ref to a single child element, so the multi-child
// Fragment threw 'Passing props on "Fragment"!' and crashed the workspace shell on
// every authenticated load while projects were still loading. Keep the real
// <Transition> (@headlessui/react) and <Loader> (@plane/ui) so the defect is exercised.

vi.mock("next/navigation", () => ({
  useParams: () => ({ workspaceSlug: "gogocash" }),
  usePathname: () => "/gogocash/",
}));

vi.mock("@plane/i18n", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/hooks/store/use-app-theme", () => ({
  useAppTheme: () => ({
    isExtendedProjectSidebarOpened: false,
    toggleExtendedProjectSidebar: vi.fn(),
  }),
}));

vi.mock("@/hooks/store/use-command-palette", () => ({
  useCommandPalette: () => ({ toggleCreateProjectModal: vi.fn() }),
}));

vi.mock("@/hooks/store/use-project", () => ({
  useProject: () => ({
    loader: "init-loader",
    getPartialProjectById: vi.fn(),
    joinedProjectIds: [],
    updateProjectView: vi.fn(),
  }),
}));

vi.mock("@/hooks/store/user", () => ({
  useUserPermissions: () => ({ allowPermissions: () => true }),
}));

vi.mock("@/hooks/use-navigation-preferences", () => ({
  useProjectNavigationPreferences: () => ({
    preferences: { showLimitedProjects: false, limitedProjectsCount: 0 },
  }),
}));

vi.mock("@/components/project/create-project-modal", () => ({
  CreateProjectModal: () => null,
}));

vi.mock("@/components/sidebar/sidebar-navigation", () => ({
  SidebarNavItem: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock("./projects-list-item", () => ({
  SidebarProjectsListItem: () => null,
}));

vi.mock("@plane/propel/tooltip", () => ({
  Tooltip: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

vi.mock("@plane/propel/icon-button", () => ({
  IconButton: () => <button type="button" />,
}));

import { SidebarProjectsList } from "./projects-list";

describe("SidebarProjectsList", () => {
  it("renders the projects transition without throwing while projects are loading", () => {
    expect(() => renderToStaticMarkup(<SidebarProjectsList />)).not.toThrow();
  });
});
