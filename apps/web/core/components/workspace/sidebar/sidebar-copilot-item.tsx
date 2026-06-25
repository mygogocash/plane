/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { Sparkles } from "lucide-react";
import { useParams } from "next/navigation";
// components
import { SidebarNavItem } from "@/components/sidebar/sidebar-navigation";
// hooks
import { useAppTheme } from "@/hooks/store/use-app-theme";
import { useCopilot } from "@/hooks/store/use-copilot";
import { MOBILE_BREAKPOINT } from "@/hooks/use-platform-os";

export const SidebarCopilotItem = observer(function SidebarCopilotItem() {
  const { workspaceSlug } = useParams();
  const copilot = useCopilot();
  const { toggleSidebar, isExtendedSidebarOpened, toggleExtendedSidebar } = useAppTheme();

  const slug = workspaceSlug?.toString();
  if (!slug) return null;

  const handleClick = () => {
    copilot.openPanel();
    if (window.innerWidth < MOBILE_BREAKPOINT) toggleSidebar();
    if (isExtendedSidebarOpened) toggleExtendedSidebar(false);
  };

  return (
    <SidebarNavItem isActive={copilot.isPanelOpen}>
      <button
        type="button"
        onClick={handleClick}
        className="flex w-full items-center gap-1.5 py-[1px] text-left"
        aria-label="Copilot"
      >
        <Sparkles className="size-4 flex-shrink-0" />
        <p className="text-13 leading-5 font-medium">Copilot</p>
      </button>
    </SidebarNavItem>
  );
});
