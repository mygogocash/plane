/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { Shapes, Sparkles } from "lucide-react";
import { useParams } from "next/navigation";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { HomeIcon } from "@plane/propel/icons";
import { Breadcrumbs, Header } from "@plane/ui";
// components
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { CopilotPanel } from "@/components/copilot";
// hooks
import { useHome } from "@/hooks/store/use-home";

export const WorkspaceDashboardHeader = observer(function WorkspaceDashboardHeader() {
  // plane hooks
  const { t } = useTranslation();
  const { workspaceSlug } = useParams();
  // hooks
  const { toggleWidgetSettings } = useHome();
  // states
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const workspaceSlugValue = workspaceSlug?.toString() ?? "";

  return (
    <>
      <Header>
        <Header.LeftItem>
          <div className="flex items-center gap-2">
            <Breadcrumbs>
              <Breadcrumbs.Item
                component={
                  <BreadcrumbLink label={t("home.title")} icon={<HomeIcon className="h-4 w-4 text-tertiary" />} />
                }
              />
            </Breadcrumbs>
          </div>
        </Header.LeftItem>
        <Header.RightItem>
          {workspaceSlugValue && (
            <Button
              variant="secondary"
              size="lg"
              onClick={() => setIsCopilotOpen(true)}
              className="my-auto mb-0"
              prependIcon={<Sparkles />}
            >
              <div className="hidden sm:hidden md:block">Copilot</div>
            </Button>
          )}
          <Button
            variant="secondary"
            size="lg"
            onClick={() => toggleWidgetSettings(true)}
            className="my-auto mb-0"
            prependIcon={<Shapes />}
          >
            <div className="hidden sm:hidden md:block">{t("home.manage_widgets")}</div>
          </Button>
        </Header.RightItem>
      </Header>
      {workspaceSlugValue && (
        <CopilotPanel
          isOpen={isCopilotOpen}
          onClose={() => setIsCopilotOpen(false)}
          workspaceSlug={workspaceSlugValue}
        />
      )}
    </>
  );
});
