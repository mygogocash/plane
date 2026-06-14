/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// hooks
import { useProject } from "@/hooks/store/use-project";
// plane web imports
import { ProjectEpicsPageRoot } from "@/plane-web/components/epics/epics-route";
import type { Route } from "./+types/page";

function ProjectEpicsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId } = params;
  const { getProjectById } = useProject();
  const project = getProjectById(projectId);
  const pageTitle = project?.name ? `${project.name} - Epics` : undefined;

  return <ProjectEpicsPageRoot workspaceSlug={workspaceSlug} projectId={projectId} pageTitle={pageTitle} />;
}

export default observer(ProjectEpicsPage);
