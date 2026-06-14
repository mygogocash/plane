/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// components
import { PageHead } from "@/components/core/page-title";
import { DetailedEmptyState } from "@/components/empty-state/detailed-empty-state-root";
// local imports
import { isSelfHostedFeatureEnabled } from "@/plane-web/lib/self-host-entitlements";
import { InitiativesWorkspaceView } from "./workspace-view";

type InitiativesPageRootProps = {
  pageTitle?: string;
  selectedInitiativeId?: string;
  workspaceSlug: string;
};

export const InitiativesPageRoot = observer(function InitiativesPageRoot(props: InitiativesPageRootProps) {
  const { pageTitle, selectedInitiativeId, workspaceSlug } = props;
  const featureEnabled = isSelfHostedFeatureEnabled("initiatives");

  return (
    <>
      <PageHead title={pageTitle} />
      <div className="h-full w-full">
        {featureEnabled ? (
          <InitiativesWorkspaceView selectedInitiativeId={selectedInitiativeId} workspaceSlug={workspaceSlug} />
        ) : (
          <DetailedEmptyState
            title="Create your first initiative"
            description="Enable initiatives before loading workspace initiative data."
            primaryButton={{
              text: "Initiatives are disabled",
              disabled: true,
            }}
          />
        )}
      </div>
    </>
  );
});
