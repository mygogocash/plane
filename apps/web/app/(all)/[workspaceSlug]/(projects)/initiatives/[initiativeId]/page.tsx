/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";
// plane web components
import { InitiativesPageRoot } from "@/plane-web/components/initiatives";
import type { Route } from "./+types/page";

function InitiativeDetailPage({ params }: Route.ComponentProps) {
  const { initiativeId, workspaceSlug } = params;
  const { currentWorkspace } = useWorkspace();
  const pageTitle = currentWorkspace?.name ? `${currentWorkspace.name} - Initiatives` : undefined;

  return (
    <InitiativesPageRoot pageTitle={pageTitle} selectedInitiativeId={initiativeId} workspaceSlug={workspaceSlug} />
  );
}

export default observer(InitiativeDetailPage);
