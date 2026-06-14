/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
// constants
import { EPageAccess } from "@plane/constants";
// plane types
import { Button } from "@plane/propel/button";
import { PageIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TPageCreatePayload } from "@plane/types";
// plane ui
import { Breadcrumbs, Header } from "@plane/ui";
// helpers
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { ImportPagesModal } from "@/components/pages/import/import-pages-modal";
// hooks
import { useProject } from "@/hooks/store/use-project";
// plane web imports
import { CommonProjectBreadcrumbs } from "@/plane-web/components/breadcrumbs/common";
import { EPageStoreType, usePageStore } from "@/plane-web/hooks/store";

const getCreatePageErrorMessage = (error: unknown): string => {
  if (typeof error !== "object" || error === null || !("data" in error)) {
    return "Page could not be created. Please try again.";
  }
  const { data } = error;
  if (typeof data !== "object" || data === null || !("error" in data)) {
    return "Page could not be created. Please try again.";
  }
  return String(data.error);
};

export const PagesListHeader = observer(function PagesListHeader() {
  // states
  const [isCreatingPage, setIsCreatingPage] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  // router
  const router = useRouter();
  const { workspaceSlug, projectId } = useParams();
  const searchParams = useSearchParams();
  const pageType = searchParams.get("type");
  // store hooks
  const { currentProjectDetails, loader } = useProject();
  const { canCurrentUserCreatePage, createPage } = usePageStore(EPageStoreType.PROJECT);
  // handle page create
  const handleCreatePage = async () => {
    setIsCreatingPage(true);

    const payload: TPageCreatePayload = {
      access: pageType === "private" ? EPageAccess.PRIVATE : EPageAccess.PUBLIC,
    };

    try {
      const res = await createPage(payload);
      const pageId = `/${workspaceSlug}/projects/${currentProjectDetails?.id}/pages/${res?.id}`;
      router.push(pageId);
    } catch (err) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: getCreatePageErrorMessage(err),
      });
    } finally {
      setIsCreatingPage(false);
    }
  };

  return (
    <Header>
      <Header.LeftItem>
        <Breadcrumbs isLoading={loader === "init-loader"}>
          <CommonProjectBreadcrumbs workspaceSlug={workspaceSlug?.toString()} projectId={projectId?.toString()} />
          <Breadcrumbs.Item
            component={
              <BreadcrumbLink
                label="Pages"
                href={`/${workspaceSlug}/projects/${currentProjectDetails?.id}/pages/`}
                icon={<PageIcon className="h-4 w-4 text-tertiary" />}
                isLast
              />
            }
            isLast
          />
        </Breadcrumbs>
      </Header.LeftItem>
      {canCurrentUserCreatePage && (
        <Header.RightItem>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="lg" onClick={() => setIsImportModalOpen(true)}>
              Import
            </Button>
            <Button variant="primary" size="lg" onClick={handleCreatePage} loading={isCreatingPage}>
              {isCreatingPage ? "Adding" : "Add page"}
            </Button>
          </div>
        </Header.RightItem>
      )}
      <ImportPagesModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        defaultAccess={pageType === "private" ? EPageAccess.PRIVATE : EPageAccess.PUBLIC}
      />
    </Header>
  );
});
