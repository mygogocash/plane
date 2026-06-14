/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { EmptyStateDetailed } from "@plane/propel/empty-state";
// plane web imports
import { CreateUpdateEpicModal } from "@/plane-web/components/epics/epic-modal";

export const ProjectEpicsEmptyState = observer(function ProjectEpicsEmptyState() {
  const { projectId: routerProjectId } = useParams();
  const projectId = routerProjectId ? routerProjectId.toString() : "";
  const [createModalOpen, setCreateModalOpen] = useState(false);

  return (
    <div className="relative h-full w-full overflow-y-auto">
      <CreateUpdateEpicModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        data={{ project_id: projectId }}
        isProjectSelectionDisabled
      />
      <EmptyStateDetailed
        assetKey="epic"
        title="No epics yet"
        description="Create epics to group related work items around larger outcomes."
        actions={[
          {
            label: "Create epic",
            onClick: () => setCreateModalOpen(true),
            variant: "primary",
          },
        ]}
      />
    </div>
  );
});
