/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useCallback, useMemo, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { DEFAULT_WORK_ITEM_FORM_VALUES } from "@plane/constants";
import type { ISearchIssueResponse, TIssue, TWorkItemTemplateData } from "@plane/types";
// types
import type { TIssueModalRecurrenceDraft } from "@/types/recurring-work-item";
// components
import { IssueModalContext } from "@/components/issues/issue-modal/context";
import type { THandleTemplateChangeProps } from "@/components/issues/issue-modal/context";
// hooks
import { useWorkItemTemplate } from "@/hooks/store/use-work-item-template";
import { useUser } from "@/hooks/store/user/user-user";

export type TIssueModalProviderProps = {
  templateId?: string;
  dataForPreload?: Partial<TIssue>;
  allowedProjectIds?: string[];
  children: React.ReactNode;
};

const getDefaultRecurrenceDraft = (): TIssueModalRecurrenceDraft => ({
  enabled: false,
  frequency: "daily",
  rrule: "",
  timezone: "UTC",
  start_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
  end_date: "",
  max_iterations: 5,
});

export const IssueModalProvider = observer(function IssueModalProvider(props: TIssueModalProviderProps) {
  const { children, allowedProjectIds, dataForPreload, templateId } = props;
  // states
  const [workItemTemplateId, setWorkItemTemplateId] = useState<string | null>(templateId ?? null);
  const [recurrenceDraft, setRecurrenceDraft] = useState<TIssueModalRecurrenceDraft>(() => getDefaultRecurrenceDraft());
  const [isApplyingTemplate, setIsApplyingTemplate] = useState(false);
  const [selectedParentIssue, setSelectedParentIssue] = useState<ISearchIssueResponse | null>(null);
  // store hooks
  const { getTemplateById } = useWorkItemTemplate();
  const { projectsWithCreatePermissions } = useUser();
  // derived values
  const projectIdsWithCreatePermissions = useMemo(
    () => Object.keys(projectsWithCreatePermissions ?? {}),
    [projectsWithCreatePermissions]
  );

  const handleTemplateChange = useCallback(
    async ({ editorRef, reset }: THandleTemplateChangeProps) => {
      if (!workItemTemplateId) return;

      const template = getTemplateById(workItemTemplateId);
      if (!template) return;

      setIsApplyingTemplate(true);
      try {
        const templateData = (template.template_data ?? {}) as TWorkItemTemplateData;
        const descriptionHtml =
          (typeof templateData.description_html === "string" && templateData.description_html) ||
          template.description_html ||
          "<p></p>";

        reset({
          ...DEFAULT_WORK_ITEM_FORM_VALUES,
          ...dataForPreload,
          ...templateData,
          project_id: template.project_id,
          type_id:
            (typeof templateData.type_id === "string" && templateData.type_id) ||
            (typeof templateData.type === "string" && templateData.type) ||
            template.issue_type ||
            dataForPreload?.type_id ||
            null,
          description_html: descriptionHtml,
          property_values: templateData.property_values ?? {},
        } as TIssue);
        editorRef.current?.setEditorValue(descriptionHtml, true);
      } finally {
        setIsApplyingTemplate(false);
      }
    },
    [dataForPreload, getTemplateById, workItemTemplateId]
  );

  const contextValue = useMemo(
    () => ({
      allowedProjectIds: allowedProjectIds ?? projectIdsWithCreatePermissions,
      workItemTemplateId,
      setWorkItemTemplateId,
      recurrenceDraft,
      setRecurrenceDraft,
      resetRecurrenceDraft: () => setRecurrenceDraft(getDefaultRecurrenceDraft()),
      recurrenceRuns: [],
      isApplyingTemplate,
      setIsApplyingTemplate,
      selectedParentIssue,
      setSelectedParentIssue,
      issuePropertyValues: {},
      setIssuePropertyValues: () => {},
      issuePropertyValueErrors: {},
      setIssuePropertyValueErrors: () => {},
      getIssueTypeIdOnProjectChange: () => null,
      getActiveAdditionalPropertiesLength: () => 0,
      handlePropertyValuesValidation: () => true,
      handleCreateUpdatePropertyValues: () => Promise.resolve(),
      handleProjectEntitiesFetch: () => Promise.resolve(),
      handleTemplateChange,
      handleConvert: () => Promise.resolve(),
      handleCreateSubWorkItem: () => Promise.resolve(),
    }),
    [
      allowedProjectIds,
      handleTemplateChange,
      isApplyingTemplate,
      projectIdsWithCreatePermissions,
      recurrenceDraft,
      selectedParentIssue,
      workItemTemplateId,
    ]
  );

  return <IssueModalContext.Provider value={contextValue}>{children}</IssueModalContext.Provider>;
});
