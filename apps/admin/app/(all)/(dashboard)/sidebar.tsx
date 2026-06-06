/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef } from "react";
import { observer } from "mobx-react";
// plane helpers
import { useOutsideClickDetector, useViewport } from "@plane/hooks";
import { cn } from "@plane/utils";
// hooks
import { useTheme } from "@/hooks/store";
// components
import { AdminSidebarDropdown } from "./sidebar-dropdown";
import { AdminSidebarHelpSection } from "./sidebar-help-section";
import { AdminSidebarMenu } from "./sidebar-menu";

export const AdminSidebar = observer(function AdminSidebar() {
  // store
  const { isSidebarCollapsed, toggleSidebar } = useTheme();
  const { isMobile } = useViewport();

  const ref = useRef<HTMLDivElement>(null);

  useOutsideClickDetector(ref, () => {
    if (isSidebarCollapsed === false) {
      if (window.innerWidth < 768) {
        toggleSidebar(!isSidebarCollapsed);
      }
    }
  });

  useEffect(() => {
    if (isMobile) {
      if (!isSidebarCollapsed) {
        toggleSidebar(true);
      }
    }
  }, [isMobile, isSidebarCollapsed, toggleSidebar]);

  return (
    <>
      {isMobile && !isSidebarCollapsed && (
        <button
          type="button"
          aria-label="Close admin sidebar"
          className="fixed inset-0 z-[19] bg-backdrop/40 md:hidden"
          onClick={() => toggleSidebar(true)}
        />
      )}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-20 h-full flex-shrink-0 flex-grow-0 flex-col border-r border-subtle bg-surface-1 shadow-raised-200 transition-transform duration-300 md:relative md:translate-x-0 md:shadow-none",
          isSidebarCollapsed
            ? "hidden -translate-x-full md:flex md:w-[70px]"
            : "flex w-[min(86vw,290px)] translate-x-0 md:w-[290px]"
        )}
      >
        <div ref={ref} className="flex h-full w-full flex-1 flex-col">
          <AdminSidebarDropdown />
          <AdminSidebarMenu />
          <AdminSidebarHelpSection />
        </div>
      </div>
    </>
  );
});
