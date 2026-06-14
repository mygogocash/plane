/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { cn } from "@plane/utils";
// hooks
import { useIssueModal } from "@/hooks/context/use-issue-modal";
import { useWorkItemTemplate } from "@/hooks/store/use-work-item-template";
// helpers
import { isSelfHostedFeatureEnabled } from "@/plane-web/lib/self-host-entitlements";

export type TWorkItemTemplateDropdownSize = "xs" | "sm";

export type TWorkItemTemplateSelect = {
  projectId: string | null;
  typeId: string | null;
  disabled?: boolean;
  size?: TWorkItemTemplateDropdownSize;
  placeholder?: string;
  renderChevron?: boolean;
  dropDownContainerClassName?: string;
  handleModalClose: () => void;
  handleFormChange?: () => void;
};

export const WorkItemTemplateSelect = observer(function WorkItemTemplateSelect(props: TWorkItemTemplateSelect) {
  const {
    projectId,
    typeId,
    disabled = false,
    size = "sm",
    placeholder = "Template",
    dropDownContainerClassName,
    handleModalClose,
    handleFormChange,
  } = props;

  const { workspaceSlug } = useParams();
  const { workItemTemplateId, setWorkItemTemplateId } = useIssueModal();
  const { fetchTemplates, getActiveTemplatesForProject, getTemplatesLoadingForProject, hasFetchedTemplatesForProject } =
    useWorkItemTemplate();

  const featureEnabled = isSelfHostedFeatureEnabled("templates");
  const slug = workspaceSlug?.toString();
  const templates = projectId ? getActiveTemplatesForProject(projectId, typeId) : [];
  const isLoading = projectId ? getTemplatesLoadingForProject(projectId) : false;
  const hasFetched = projectId ? hasFetchedTemplatesForProject(projectId) : false;

  useEffect(() => {
    if (!featureEnabled || !slug || !projectId || isLoading || hasFetched) return;
    void fetchTemplates(slug, projectId);
  }, [featureEnabled, fetchTemplates, hasFetched, isLoading, projectId, slug]);

  if (!featureEnabled || !projectId) return null;

  if (!isLoading && templates.length === 0) {
    return (
      <div
        className={cn(
          "flex h-7 items-center gap-1 rounded border border-dashed border-subtle px-2 text-12 text-tertiary",
          dropDownContainerClassName
        )}
        data-testid="work-item-template-empty-state"
      >
        <span>Self-hosted — no templates yet, create one</span>
        {slug && (
          <a
            className="text-custom-primary-100 font-medium hover:underline"
            href={`/${slug}/settings/projects/${projectId}/templates/`}
            onClick={handleModalClose}
          >
            Open settings
          </a>
        )}
      </div>
    );
  }

  return (
    <label className={cn("relative inline-flex items-center", dropDownContainerClassName)}>
      <span className="sr-only">Work item template</span>
      <select
        aria-label="Work item template"
        className={cn(
          "focus:border-custom-primary-100 rounded border border-subtle bg-surface-1 text-secondary outline-none",
          size === "xs" ? "h-6 max-w-32 px-1.5 text-11" : "h-7 max-w-40 px-2 text-12"
        )}
        disabled={disabled || isLoading}
        value={workItemTemplateId ?? ""}
        onChange={(event) => {
          setWorkItemTemplateId(event.target.value || null);
          handleFormChange?.();
        }}
      >
        <option value="">{isLoading ? "Loading templates..." : placeholder}</option>
        {templates.map((template) => (
          <option key={template.id} value={template.id}>
            {template.name}
          </option>
        ))}
      </select>
    </label>
  );
});
