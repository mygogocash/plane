/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useTheme } from "next-themes";
// assets
import darkSettingsAsset from "@/app/assets/empty-state/epics/settings-dark.webp?url";
import lightSettingsAsset from "@/app/assets/empty-state/epics/settings-light.webp?url";
// components
import { PageHead } from "@/components/core/page-title";
import { DetailedEmptyState } from "@/components/empty-state/detailed-empty-state-root";
import { EpicLayoutRoot } from "@/components/issues/issue-layouts/roots/epic-layout-root";
// hooks
import { useAppRouter } from "@/hooks/use-app-router";
// local imports
import { isSelfHostedFeatureEnabled } from "@/plane-web/lib/self-host-entitlements";

type ProjectEpicsPageRootProps = {
  pageTitle?: string;
  projectId: string;
  workspaceSlug: string;
};

export const ProjectEpicsPageRoot = observer(function ProjectEpicsPageRoot(props: ProjectEpicsPageRootProps) {
  const { pageTitle, projectId, workspaceSlug } = props;
  const router = useAppRouter();
  const { resolvedTheme } = useTheme();
  const featureEnabled = isSelfHostedFeatureEnabled("epics");
  const settingsAsset = resolvedTheme === "light" ? lightSettingsAsset : darkSettingsAsset;

  return (
    <>
      <PageHead title={pageTitle} />
      <div className="h-full w-full">
        {featureEnabled ? (
          <EpicLayoutRoot />
        ) : (
          <DetailedEmptyState
            title="Epics are disabled"
            description="Enable epics for this project before loading or creating project epics."
            assetPath={settingsAsset}
            primaryButton={{
              text: "Enable epics in project settings",
              onClick: () => router.push(`/${workspaceSlug}/settings/projects/${projectId}/features`),
            }}
          />
        )}
      </div>
    </>
  );
});
