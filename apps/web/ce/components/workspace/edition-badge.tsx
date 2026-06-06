/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// ui
import { useTranslation } from "@plane/i18n";
import { Tooltip } from "@plane/propel/tooltip";
import { Button } from "@plane/propel/button";
// hooks
import { usePlatformOS } from "@/hooks/use-platform-os";
import packageJson from "package.json";
// plane web imports
import { SELF_HOSTED_PLAN_LABEL } from "@/plane-web/lib/self-host-entitlements";

export const WorkspaceEditionBadge = observer(function WorkspaceEditionBadge() {
  // translation
  const { t } = useTranslation();
  // platform
  const { isMobile } = usePlatformOS();

  return (
    <Tooltip tooltipContent={`Version: v${packageJson.version}`} isMobile={isMobile}>
      <Button variant="tertiary" size="lg" aria-label={t("aria_labels.projects_sidebar.edition_badge")}>
        {SELF_HOSTED_PLAN_LABEL}
      </Button>
    </Tooltip>
  );
});
