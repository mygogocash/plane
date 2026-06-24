/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
// components
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { cn } from "@plane/utils";
import { ConnectorsList } from "@/components/integrations/connectors/ConnectorsList";
import { isConnectorsTabVisible } from "@/components/integrations/connectors/connectors.utils";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { SingleIntegrationCard } from "@/components/integration/single-integration-card";
import { IntegrationAndImportExportBanner } from "@/components/ui/integration-and-import-export-banner";
import { IntegrationsSettingsLoader } from "@/components/ui/loader/settings/integration";
// constants
import { APP_INTEGRATIONS } from "@/constants/fetch-keys";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserPermissions } from "@/hooks/store/user";
// plane-web
import { isSelfHostedFeatureEnabled } from "@/plane-web/lib/self-host-entitlements";
// services
import { ConnectorService } from "@/services/connector.service";
import { IntegrationService } from "@/services/integrations";

const integrationService = new IntegrationService();
const connectorService = new ConnectorService();

type TIntegrationsTab = "installed" | "connectors";

function WorkspaceIntegrationsPage() {
  // store hooks
  const { currentWorkspace } = useWorkspace();
  const { allowPermissions } = useUserPermissions();
  // local state
  const [activeTab, setActiveTab] = useState<TIntegrationsTab>("installed");

  // derived values
  const isAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);
  const workspaceSlug = currentWorkspace?.slug;
  const connectorsEnabled = isSelfHostedFeatureEnabled("integrations");
  const showConnectorsTab = isConnectorsTabVisible(connectorsEnabled);
  const pageTitle = currentWorkspace?.name ? `${currentWorkspace.name} - Integrations` : undefined;
  const { data: appIntegrations } = useSWR(isAdmin ? APP_INTEGRATIONS : null, () =>
    isAdmin ? integrationService.getAppIntegrationsList() : null
  );
  const { data: slackBindings } = useSWR(
    isAdmin && showConnectorsTab && workspaceSlug ? `SLACK_CHANNELS_${workspaceSlug}` : null,
    isAdmin && showConnectorsTab && workspaceSlug ? () => connectorService.getSlackChannels(workspaceSlug) : null
  );
  const { data: sentryConfig } = useSWR(
    isAdmin && showConnectorsTab && workspaceSlug ? `SENTRY_CONFIG_${workspaceSlug}` : null,
    isAdmin && showConnectorsTab && workspaceSlug ? () => connectorService.getSentryConfig(workspaceSlug) : null
  );

  if (!isAdmin) return <NotAuthorizedView section="settings" className="h-auto" />;

  return (
    <>
      <PageHead title={pageTitle} />
      <section className="w-full overflow-y-auto">
        <IntegrationAndImportExportBanner bannerName="Integrations" />

        {showConnectorsTab ? (
          <div className="mb-4 flex items-center gap-1 border-b border-subtle" data-testid="integrations-tabs">
            {(["installed", "connectors"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                data-testid={`integrations-tab-${tab}`}
                className={cn("border-b-2 px-3 py-2 text-13 font-medium capitalize", {
                  "border-accent-primary text-primary": activeTab === tab,
                  "border-transparent text-tertiary": activeTab !== tab,
                })}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>
        ) : null}

        {activeTab === "connectors" && showConnectorsTab ? (
          <ConnectorsList
            integrationsEnabled={connectorsEnabled}
            slackBindings={slackBindings ?? []}
            sentryConfig={sentryConfig ?? null}
          />
        ) : (
          <div>
            {appIntegrations ? (
              appIntegrations.map((integration) => (
                <SingleIntegrationCard key={integration.id} integration={integration} />
              ))
            ) : (
              <IntegrationsSettingsLoader />
            )}
          </div>
        )}
      </section>
    </>
  );
}

export default observer(WorkspaceIntegrationsPage);
