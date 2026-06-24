/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useRouter } from "next/navigation";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { PageIcon } from "@plane/propel/icons";
// plane import
import type { TActivityEntityData, TPageEntityData } from "@plane/types";
import { Avatar } from "@plane/ui";
import { calculateTimeAgo, getFileURL, getPageName } from "@plane/utils";
import { ListItem } from "@/components/core/list";
// hooks
import { useMember } from "@/hooks/store/use-member";

type BlockProps = {
  activity: TActivityEntityData;
  ref: React.RefObject<HTMLDivElement | null>;
  workspaceSlug: string;
};

export function RecentPage(props: BlockProps) {
  const { activity, ref, workspaceSlug } = props;
  // router
  const router = useRouter();
  // store hooks
  const { getUserDetails } = useMember();
  // derived values
  const pageDetails = activity.entity_data as TPageEntityData;

  if (!pageDetails) return <></>;

  const ownerDetails = getUserDetails(pageDetails?.owned_by);
  const pageLink = pageDetails.project_id
    ? `/${workspaceSlug}/projects/${pageDetails.project_id}/pages/${pageDetails.id}`
    : `/${workspaceSlug}/pages/${pageDetails.id}`;
  const visitedAt = calculateTimeAgo(activity.visited_at);

  return (
    <ListItem
      key={activity.id}
      itemLink={pageLink}
      title={getPageName(pageDetails?.name)}
      prependTitleElement={
        <div className="flex flex-shrink-0 items-center gap-2">
          <div className="grid size-8 flex-shrink-0 place-items-center rounded-sm bg-layer-2">
            {pageDetails?.logo_props?.in_use ? (
              <Logo logo={pageDetails?.logo_props} size={16} type="lucide" />
            ) : (
              <PageIcon className="size-4 text-tertiary" />
            )}
          </div>
          {pageDetails?.project_identifier && (
            <div className="text-13 font-medium whitespace-nowrap text-placeholder">
              {pageDetails?.project_identifier}
            </div>
          )}
        </div>
      }
      appendTitleElement={
        <div className="hidden flex-shrink-0 text-11 font-medium text-placeholder sm:block">{visitedAt}</div>
      }
      quickActionElement={
        <div className="flex w-full items-center justify-between gap-3 text-placeholder sm:w-auto sm:justify-start sm:gap-4">
          <span className="text-11 font-medium sm:hidden">{visitedAt}</span>
          <Avatar src={getFileURL(ownerDetails?.avatar_url ?? "")} name={ownerDetails?.display_name} />
        </div>
      }
      parentRef={ref}
      disableLink={false}
      isMobile
      className="shadow-sm my-auto rounded-lg !border border-subtle bg-layer-1 !px-3 py-3 sm:rounded-none sm:!border-none sm:bg-layer-transparent sm:!px-2 sm:shadow-none"
      itemClassName="my-auto flex-col !items-start gap-2 bg-layer-transparent sm:flex-row sm:items-center sm:gap-3"
      leftElementClassName="min-w-0 flex-1"
      onItemClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        router.push(pageLink);
      }}
    />
  );
}
