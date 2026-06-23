/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useParams: () => ({}),
}));

vi.mock("@/hooks/store/use-app-theme", () => ({
  useAppTheme: () => ({
    isExtendedSidebarOpened: false,
    toggleExtendedSidebar: vi.fn(),
  }),
}));

vi.mock("@/hooks/store/user", () => ({
  useUserPermissions: () => ({
    allowPermissions: () => true,
  }),
}));

vi.mock("@/hooks/use-navigation-preferences", () => ({
  useWorkspaceNavigationPreferences: () => ({
    preferences: { items: {} },
    updateWorkspaceItemSortOrder: vi.fn(),
  }),
}));

vi.mock("@/plane-web/components/workspace/sidebar/extended-sidebar-item", () => ({
  ExtendedSidebarItem: () => <div>item</div>,
}));

vi.mock("./extended-sidebar-wrapper", () => ({
  ExtendedSidebarWrapper: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import { ExtendedAppSidebar } from "./extended-sidebar";

describe("ExtendedAppSidebar", () => {
  it("does not throw before the workspace route param is available", () => {
    expect(() => renderToStaticMarkup(<ExtendedAppSidebar />)).not.toThrow();
  });
});
