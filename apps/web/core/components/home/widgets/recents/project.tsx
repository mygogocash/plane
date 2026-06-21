/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useRouter } from "next/navigation";
// plane types
import { Logo } from "@plane/propel/emoji-icon-picker";
import type { TActivityEntityData, TProjectEntityData } from "@plane/types";
import { calculateTimeAgo } from "@plane/utils";
// components
import { ListItem } from "@/components/core/list";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
// helpers

type BlockProps = {
  activity: TActivityEntityData;
  ref: React.RefObject<HTMLDivElement | null>;
  workspaceSlug: string;
};
export function RecentProject(props: BlockProps) {
  const { activity, ref, workspaceSlug } = props;
  // router
  const router = useRouter();
  // derived values
  const projectDetails: TProjectEntityData = activity.entity_data as TProjectEntityData;

  if (!projectDetails) return <></>;

  const projectLink = `/${workspaceSlug}/projects/${projectDetails?.id}/issues`;
  const visitedAt = calculateTimeAgo(activity.visited_at);

  return (
    <ListItem
      key={activity.id}
      itemLink={projectLink}
      title={projectDetails?.name}
      prependTitleElement={
        <div className="flex flex-shrink-0 items-center gap-2">
          <div className="grid size-8 flex-shrink-0 place-items-center rounded-sm bg-layer-2">
            <Logo logo={projectDetails?.logo_props} size={16} />
          </div>
          <div className="max-w-[7.5rem] truncate text-13 font-medium whitespace-nowrap text-placeholder sm:max-w-none">
            {projectDetails?.identifier}
          </div>
        </div>
      }
      appendTitleElement={
        <div className="hidden flex-shrink-0 text-11 font-medium text-placeholder sm:block">{visitedAt}</div>
      }
      quickActionElement={
        <div className="flex w-full items-center justify-between gap-3 text-placeholder sm:w-auto sm:justify-start sm:gap-4">
          <span className="text-11 font-medium sm:hidden">{visitedAt}</span>
          {projectDetails?.project_members?.length > 0 && (
            <div className="h-5">
              <MemberDropdown
                projectId={projectDetails?.id}
                value={projectDetails?.project_members}
                onChange={() => {}}
                disabled
                multiple
                buttonVariant={
                  projectDetails?.project_members?.length > 0 ? "transparent-without-text" : "border-without-text"
                }
                buttonClassName={projectDetails?.project_members?.length > 0 ? "hover:bg-transparent px-0" : ""}
                showTooltip={projectDetails?.project_members?.length === 0}
                placeholder="Assignees"
                optionsClassName="z-10"
                tooltipContent=""
              />
            </div>
          )}
        </div>
      }
      parentRef={ref}
      disableLink={false}
      isMobile
      className="shadow-sm my-auto rounded-lg !border border-subtle bg-layer-1 !px-3 py-3 sm:rounded-none sm:!border-none sm:bg-layer-transparent sm:!px-2 sm:shadow-none"
      itemClassName="my-auto flex-col !items-start gap-2 sm:flex-row sm:items-center sm:gap-3"
      leftElementClassName="min-w-0 flex-1"
      onItemClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        router.push(projectLink);
      }}
    />
  );
}
