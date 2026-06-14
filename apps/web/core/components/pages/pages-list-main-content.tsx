/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { useParams, useRouter } from "next/navigation";
import { EUserPermissionsLevel, EPageAccess } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { EmptyStateDetailed } from "@plane/propel/empty-state";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TPageCreatePayload, TPageNavigationTabs } from "@plane/types";
import { EUserProjectRoles } from "@plane/types";
// components
import { ImportPagesModal } from "@/components/pages/import/import-pages-modal";
import { PageLoader } from "@/components/pages/loaders/page-loader";
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
// plane web hooks
import { EPageStoreType, usePageStore } from "@/plane-web/hooks/store";

type Props = {
  children: React.ReactNode;
  pageType: TPageNavigationTabs;
  storeType: EPageStoreType;
};

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

export const PagesListMainContent = observer(function PagesListMainContent(props: Props) {
  const { children, pageType, storeType } = props;
  // plane hooks
  const { t } = useTranslation();
  // store hooks
  const { currentProjectDetails } = useProject();
  const { isAnyPageAvailable, getCurrentProjectFilteredPageIdsByTab, getCurrentProjectPageIdsByTab, loader } =
    usePageStore(storeType);
  const { allowPermissions } = useUserPermissions();
  const { createPage } = usePageStore(EPageStoreType.PROJECT);
  // states
  const [isCreatingPage, setIsCreatingPage] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  // router
  const router = useRouter();
  const { workspaceSlug } = useParams();
  // derived values
  const pageIds = getCurrentProjectPageIdsByTab(pageType);
  const filteredPageIds = getCurrentProjectFilteredPageIdsByTab(pageType);
  const canPerformEmptyStateActions = allowPermissions(
    [EUserProjectRoles.ADMIN, EUserProjectRoles.MEMBER],
    EUserPermissionsLevel.PROJECT
  );

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

  const defaultImportAccess = pageType === "private" ? EPageAccess.PRIVATE : EPageAccess.PUBLIC;
  const emptyStateActions = [
    {
      label: t("project_empty_state.pages.cta_primary"),
      onClick: () => {
        handleCreatePage();
      },
      variant: "primary" as const,
      disabled: !canPerformEmptyStateActions || isCreatingPage,
    },
    {
      label: "Import",
      onClick: () => setIsImportModalOpen(true),
      variant: "secondary" as const,
      disabled: !canPerformEmptyStateActions || isCreatingPage,
    },
  ];

  const renderPagesEmptyState = () => (
    <>
      <ImportPagesModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        defaultAccess={defaultImportAccess}
      />
      <EmptyStateDetailed
        assetKey="page"
        title={t("project_empty_state.pages.title")}
        description={t("project_empty_state.pages.description")}
        actions={emptyStateActions}
      />
    </>
  );

  if (loader === "init-loader") return <PageLoader />;
  // if no pages exist in the active page type
  if (!isAnyPageAvailable || pageIds?.length === 0) {
    if (!isAnyPageAvailable) {
      return renderPagesEmptyState();
    }
    if (pageType === "public") return renderPagesEmptyState();
    if (pageType === "private") return renderPagesEmptyState();
    if (pageType === "archived")
      return (
        <EmptyStateDetailed
          assetKey="page"
          title={t("project_empty_state.archive_pages.title")}
          description={t("project_empty_state.archive_pages.description")}
        />
      );
  }
  // if no pages match the filter criteria
  if (filteredPageIds?.length === 0)
    return (
      <EmptyStateDetailed
        assetKey="search"
        title={t("common_empty_state.search.title")}
        description={t("common_empty_state.search.description")}
      />
    );

  return <div className="h-full w-full overflow-hidden">{children}</div>;
});
