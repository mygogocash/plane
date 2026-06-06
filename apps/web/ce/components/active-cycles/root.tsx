/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import { EmptyStateDetailed } from "@plane/propel/empty-state";
import { ContentWrapper, ERowVariant, Loader } from "@plane/ui";
// components
import { ListLayout } from "@/components/core/list";
import { ActiveCycleRoot } from "@/plane-web/components/cycles";
// hooks
import { useCycle } from "@/hooks/store/use-cycle";
import { useProject } from "@/hooks/store/use-project";
import { useWorkspace } from "@/hooks/store/use-workspace";

const WORKSPACE_ACTIVE_CYCLES_LOADER_KEYS = ["active-cycle-loader-1", "active-cycle-loader-2", "active-cycle-loader-3"];

const WorkspaceActiveCyclesLoader = () => (
  <ContentWrapper variant={ERowVariant.HUGGING}>
    <Loader className="space-y-4 p-4">
      {WORKSPACE_ACTIVE_CYCLES_LOADER_KEYS.map((key) => (
        <Loader.Item key={key} height="140px" width="100%" />
      ))}
    </Loader>
  </ContentWrapper>
);

export const WorkspaceActiveCyclesRoot = observer(function WorkspaceActiveCyclesRoot() {
  const { workspaceSlug: routerWorkspaceSlug } = useParams();
  const workspaceSlug = routerWorkspaceSlug?.toString();
  // plane hooks
  const { t } = useTranslation();
  // store hooks
  const { currentWorkspace } = useWorkspace();
  const { fetchProjects, getProjectById } = useProject();
  const { fetchWorkspaceCycles } = useCycle();

  const { data: activeCycles, isLoading } = useSWR(
    workspaceSlug && currentWorkspace ? `WORKSPACE_ACTIVE_CYCLES_${workspaceSlug}` : null,
    async () => {
      await fetchProjects(workspaceSlug as string);
      return fetchWorkspaceCycles(workspaceSlug as string, "current");
    },
    { revalidateIfStale: false, revalidateOnFocus: false }
  );

  if (!workspaceSlug) return null;

  if (isLoading || !activeCycles) return <WorkspaceActiveCyclesLoader />;

  if (activeCycles.length === 0) {
    return (
      <div className="grid h-full w-full place-items-center">
        <EmptyStateDetailed
          assetKey="cycle"
          title={t("workspace_empty_state.active_cycles.title")}
          description={t("workspace_empty_state.active_cycles.description")}
        />
      </div>
    );
  }

  return (
    <ContentWrapper variant={ERowVariant.HUGGING}>
      <ListLayout>
        {activeCycles.map((cycle) => {
          const project = getProjectById(cycle.project_id);

          return (
            <div key={cycle.id} className="border-b border-subtle bg-layer-1">
              <div className="border-b border-subtle px-6 py-3">
                <p className="text-12 font-medium text-secondary">{project?.name ?? t("common.project")}</p>
              </div>
              <ActiveCycleRoot
                workspaceSlug={workspaceSlug}
                projectId={cycle.project_id}
                cycleId={cycle.id}
                showHeader={false}
              />
            </div>
          );
        })}
      </ListLayout>
    </ContentWrapper>
  );
});
