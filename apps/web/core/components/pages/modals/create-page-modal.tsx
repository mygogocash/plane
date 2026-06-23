/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
// constants
import type { EPageAccess } from "@plane/constants";
import type { TPage } from "@plane/types";
// ui
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
// hooks
import { useAppRouter } from "@/hooks/use-app-router";
// plane web hooks
import type { EPageStoreType } from "@/plane-web/hooks/store";
import { usePageStore } from "@/plane-web/hooks/store";
import { isSelfHostedFeatureEnabled } from "@/plane-web/lib/self-host-entitlements";
// local imports
import { PageForm } from "./page-form";
import { TemplateGalleryModal } from "./template-gallery-modal";

type Props = {
  workspaceSlug: string;
  projectId: string;
  isModalOpen: boolean;
  pageAccess?: EPageAccess;
  handleModalClose: () => void;
  redirectionEnabled?: boolean;
  storeType: EPageStoreType;
};

export function CreatePageModal(props: Props) {
  const {
    workspaceSlug,
    projectId,
    isModalOpen,
    pageAccess,
    handleModalClose,
    redirectionEnabled = false,
    storeType,
  } = props;
  // states
  const [pageFormData, setPageFormData] = useState<Partial<TPage>>({
    id: undefined,
    name: "",
    logo_props: undefined,
  });
  const [isTemplateGalleryOpen, setTemplateGalleryOpen] = useState(false);
  const templatesEnabled = isSelfHostedFeatureEnabled("templates");
  // router
  const router = useAppRouter();
  // store hooks
  const { createPage } = usePageStore(storeType);
  const handlePageFormData = <T extends keyof TPage>(key: T, value: TPage[T]) =>
    setPageFormData((prev) => ({ ...prev, [key]: value }));

  // update page access in form data when page access from the store changes
  useEffect(() => {
    setPageFormData((prev) => ({ ...prev, access: pageAccess }));
  }, [pageAccess]);

  const handleStateClear = () => {
    setPageFormData({ id: undefined, name: "", access: pageAccess });
    handleModalClose();
  };

  const handleFormSubmit = async () => {
    if (!workspaceSlug || !projectId) return;

    try {
      const pageData = await createPage(pageFormData);
      if (pageData) {
        handleStateClear();
        if (redirectionEnabled) router.push(`/${workspaceSlug}/projects/${projectId}/pages/${pageData.id}`);
      }
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <ModalCore
      isOpen={isModalOpen}
      handleClose={handleModalClose}
      position={EModalPosition.TOP}
      width={EModalWidth.XXL}
    >
      {templatesEnabled ? (
        <div className="border-custom-border-200 border-b px-5 py-4">
          <button
            type="button"
            className="border-custom-border-200 text-sm text-custom-text-200 hover:bg-custom-background-90 rounded-md border px-3 py-2 font-medium"
            onClick={() => setTemplateGalleryOpen(true)}
          >
            Browse templates
          </button>
        </div>
      ) : null}
      <PageForm
        formData={pageFormData}
        handleFormData={handlePageFormData}
        handleModalClose={handleStateClear}
        handleFormSubmit={handleFormSubmit}
      />
      <TemplateGalleryModal
        isOpen={isTemplateGalleryOpen}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        onClose={() => setTemplateGalleryOpen(false)}
        onTemplateApplied={(pageData) => {
          handleStateClear();
          if (redirectionEnabled) router.push(`/${workspaceSlug}/projects/${projectId}/pages/${pageData.id}`);
        }}
      />
    </ModalCore>
  );
}
