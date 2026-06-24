/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import useSWR from "swr";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
// components
import { RuleBuilder } from "@/components/ai/automations/RuleBuilder";
import { RuleList } from "@/components/ai/automations/RuleList";
import { RunHistoryTable } from "@/components/ai/automations/RunHistoryTable";
import { canManageAutomations } from "@/components/ai/automations/automations.utils";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserPermissions } from "@/hooks/store/user";
// plane-web
import { isSelfHostedFeatureEnabled } from "@/plane-web/lib/self-host-entitlements";
// services
import { AutomationService } from "@/services/automation.service";
import type { Route } from "./+types/page";

const automationService = new AutomationService();

function WorkspaceAutomationsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug } = params;
  const { currentWorkspace } = useWorkspace();
  const { allowPermissions } = useUserPermissions();

  const featureEnabled = isSelfHostedFeatureEnabled("workflows_approvals");
  const isAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);
  const pageTitle = currentWorkspace?.name ? `${currentWorkspace.name} - Automations` : undefined;

  // Flag off → hide entirely (never paywall).
  if (!featureEnabled) return null;
  if (!canManageAutomations({ featureEnabled, isAdmin })) {
    return <NotAuthorizedView section="settings" className="h-auto" />;
  }

  const { data: rules, mutate: mutateRules } = useSWR(
    workspaceSlug ? `AUTOMATION_RULES_${workspaceSlug}` : null,
    workspaceSlug ? () => automationService.listRules(workspaceSlug) : null
  );
  const { data: runs } = useSWR(
    workspaceSlug ? `AUTOMATION_RUNS_${workspaceSlug}` : null,
    workspaceSlug ? () => automationService.listRuns(workspaceSlug) : null
  );

  return (
    <>
      <PageHead title={pageTitle} />
      <section className="flex w-full flex-col gap-6 overflow-y-auto">
        <RuleBuilder
          onSubmit={async (payload) => {
            await automationService.createRule(workspaceSlug, payload);
            void mutateRules();
          }}
        />
        <RuleList rules={rules ?? []} />
        <RunHistoryTable runs={runs ?? []} />
      </section>
    </>
  );
}

export default observer(WorkspaceAutomationsPage);
