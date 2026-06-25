/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// components
import { CopilotPanel } from "@/components/copilot";
// hooks
import { useCopilot } from "@/hooks/store/use-copilot";

export const WorkspaceCopilotPanel = observer(function WorkspaceCopilotPanel() {
  const { workspaceSlug } = useParams();
  const copilot = useCopilot();

  const slug = workspaceSlug?.toString();
  if (!slug) return null;

  return <CopilotPanel isOpen={copilot.isPanelOpen} onClose={copilot.closePanel} workspaceSlug={slug} />;
});
