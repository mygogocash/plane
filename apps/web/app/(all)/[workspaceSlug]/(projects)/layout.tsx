/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { Outlet } from "react-router";
import { ProjectsAppPowerKProvider } from "@/components/power-k/projects-app-provider";
// plane web components
import { ProjectAppSidebar } from "./_sidebar";
import { ExtendedProjectSidebar } from "./extended-project-sidebar";

function WorkspaceLayout() {
  return (
    <>
      <ProjectsAppPowerKProvider />
      <div className="relative flex h-full w-full min-w-0 flex-col overflow-hidden border-subtle md:rounded-lg md:border">
        <div id="full-screen-portal" className="absolute inset-0 w-full" />
        <div className="relative flex size-full min-w-0 overflow-hidden">
          <ProjectAppSidebar />
          <ExtendedProjectSidebar />
          <main className="relative flex h-full w-full min-w-0 flex-col overflow-hidden bg-surface-1">
            <Outlet />
          </main>
        </div>
      </div>
    </>
  );
}

export default observer(WorkspaceLayout);
