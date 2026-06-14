/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsHeading } from "@/components/settings/heading";
import { WorkItemTemplateSettingsManager } from "@/components/settings/templates/work-item-template-manager";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import type { Route } from "./+types/page";
import { TemplatesProjectSettingsHeader } from "./header";

function TemplatesSettingsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId } = params;
  const { currentProjectDetails } = useProject();
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();

  const pageTitle = currentProjectDetails?.name ? `${currentProjectDetails?.name} - Templates` : undefined;
  const canViewTemplates = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.PROJECT
  );
  const canEditTemplates = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.PROJECT
  );

  if (workspaceUserInfo && !canViewTemplates) {
    return <NotAuthorizedView section="settings" isProjectView className="h-auto" />;
  }

  return (
    <SettingsContentWrapper header={<TemplatesProjectSettingsHeader />} hugging>
      <PageHead title={pageTitle} />
      <div className="w-full">
        <SettingsHeading
          title="Work item templates"
          description="Create reusable work item templates for this self-hosted project."
        />
        <div className="mt-6">
          <WorkItemTemplateSettingsManager
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            isEditable={canEditTemplates}
          />
        </div>
      </div>
    </SettingsContentWrapper>
  );
}

export default observer(TemplatesSettingsPage);
