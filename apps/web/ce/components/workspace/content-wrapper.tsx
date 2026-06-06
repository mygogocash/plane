/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { observer } from "mobx-react";
// plane imports
import { useViewport } from "@plane/hooks";
import { cn } from "@plane/utils";
import { AppRailRoot } from "@/components/navigation";
import { useAppRailVisibility } from "@/lib/app-rail";
// local imports
import { TopNavigationRoot } from "../navigations";

export const WorkspaceContentWrapper = observer(function WorkspaceContentWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  // Use the context to determine if app rail should render
  const { shouldRenderAppRail } = useAppRailVisibility();
  const { isMobile } = useViewport();
  const shouldShowAppRail = shouldRenderAppRail && !isMobile;

  return (
    <div className="relative flex size-full flex-col overflow-hidden bg-canvas transition-all duration-300 ease-in-out">
      <TopNavigationRoot />
      <div className="relative flex size-full min-w-0 overflow-hidden">
        {/* Conditionally render AppRailRoot based on context */}
        {shouldShowAppRail && <AppRailRoot />}
        <div
          className={cn(
            "relative size-full min-w-0 flex-grow overflow-hidden pb-0 transition-all duration-300 ease-in-out md:pr-2 md:pb-2 md:pl-2",
            {
              "md:pl-0!": shouldShowAppRail,
            }
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
});
