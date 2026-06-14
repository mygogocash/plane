/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { Button } from "@plane/propel/button";
import { EpicIcon } from "@plane/propel/icons";
import { EIssuesStoreType } from "@plane/types";
import { Breadcrumbs, Header } from "@plane/ui";
// components
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { HeaderFilters } from "@/components/issues/filters";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";
// plane web imports
import { CommonProjectBreadcrumbs } from "@/plane-web/components/breadcrumbs/common";
import { CreateUpdateEpicModal } from "@/plane-web/components/epics/epic-modal";
import { isSelfHostedFeatureEnabled } from "@/plane-web/lib/self-host-entitlements";

export const ProjectEpicsHeader = observer(function ProjectEpicsHeader() {
  const router = useAppRouter();
  const { workspaceSlug, projectId } = useParams();
  const workspaceSlugString = workspaceSlug?.toString();
  const projectIdString = projectId?.toString();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const { allowPermissions } = useUserPermissions();
  const { currentProjectDetails, loader } = useProject();
  const featureEnabled = isSelfHostedFeatureEnabled("epics");

  const canUserCreateEpic = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.PROJECT
  );

  return (
    <Header>
      <Header.LeftItem>
        <Breadcrumbs onBack={router.back} isLoading={loader === "init-loader"}>
          <CommonProjectBreadcrumbs workspaceSlug={workspaceSlugString} projectId={projectIdString} />
          <Breadcrumbs.Item
            component={
              <BreadcrumbLink
                label="Epics"
                href={`/${workspaceSlugString}/projects/${currentProjectDetails?.id}/epics/`}
                icon={<EpicIcon className="h-4 w-4 text-tertiary" />}
                isLast
              />
            }
            isLast
          />
        </Breadcrumbs>
      </Header.LeftItem>
      {featureEnabled && currentProjectDetails && projectIdString && workspaceSlugString ? (
        <Header.RightItem>
          <HeaderFilters
            currentProjectDetails={currentProjectDetails}
            projectId={projectIdString}
            workspaceSlug={workspaceSlugString}
            canUserCreateIssue={canUserCreateEpic}
            storeType={EIssuesStoreType.EPIC}
          />
          {canUserCreateEpic && (
            <Button variant="primary" size="lg" onClick={() => setCreateModalOpen(true)}>
              <div className="block sm:hidden">Add</div>
              <div className="hidden sm:block">Add epic</div>
            </Button>
          )}
          <CreateUpdateEpicModal
            isOpen={createModalOpen}
            onClose={() => setCreateModalOpen(false)}
            data={{ project_id: projectIdString }}
            isProjectSelectionDisabled
          />
        </Header.RightItem>
      ) : (
        <></>
      )}
    </Header>
  );
});
