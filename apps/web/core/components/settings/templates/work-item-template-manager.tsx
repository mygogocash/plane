/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { Check, Pencil, Power, Trash2, X } from "lucide-react";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TWorkItemTemplate } from "@plane/types";
import { cn } from "@plane/utils";
// hooks
import { useWorkItemTemplate } from "@/hooks/store/use-work-item-template";
// helpers
import { isSelfHostedFeatureEnabled } from "@/plane-web/lib/self-host-entitlements";

type Props = {
  isEditable: boolean;
  projectId: string;
  workspaceSlug: string;
};

type TTemplateDraft = {
  name: string;
  description_html: string;
};

const EMPTY_DRAFT: TTemplateDraft = {
  name: "",
  description_html: "",
};

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "error" in error && typeof error.error === "string") return error.error;
  if (error && typeof error === "object" && "detail" in error && typeof error.detail === "string") return error.detail;
  return fallback;
};

const TemplateStatus = ({ template }: { template: TWorkItemTemplate }) => (
  <span
    className={cn(
      "inline-flex h-6 items-center rounded px-2 text-11 font-medium",
      template.is_active ? "bg-green-500/10 text-green-700" : "bg-slate-500/10 text-tertiary"
    )}
  >
    {template.is_active ? "Active" : "Inactive"}
  </span>
);

export const WorkItemTemplateSettingsManager = observer(function WorkItemTemplateSettingsManager(props: Props) {
  const { isEditable, projectId, workspaceSlug } = props;
  const featureEnabled = isSelfHostedFeatureEnabled("templates");
  const {
    createTemplate,
    deleteTemplate,
    fetchTemplates,
    getTemplatesForProject,
    getTemplatesLoadingForProject,
    hasFetchedTemplatesForProject,
    updateTemplate,
  } = useWorkItemTemplate();

  const [draft, setDraft] = useState<TTemplateDraft>(EMPTY_DRAFT);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<TTemplateDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);

  const templates = getTemplatesForProject(projectId);
  const isLoading = getTemplatesLoadingForProject(projectId);
  const hasFetched = hasFetchedTemplatesForProject(projectId, true);

  useEffect(() => {
    if (!featureEnabled || !workspaceSlug || !projectId || isLoading || hasFetched) return;
    void fetchTemplates(workspaceSlug, projectId, { includeInactive: true });
  }, [featureEnabled, fetchTemplates, hasFetched, isLoading, projectId, workspaceSlug]);

  if (!featureEnabled) return null;

  const handleCreate = async () => {
    const name = draft.name.trim();
    if (!name) return;

    setSaving(true);
    try {
      await createTemplate(workspaceSlug, projectId, {
        name,
        description_html: draft.description_html,
        template_data: {},
      });
      setDraft(EMPTY_DRAFT);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success",
        message: "Template created successfully.",
      });
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error",
        message: getErrorMessage(error, "Template could not be created."),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async (templateId: string) => {
    const name = editingDraft.name.trim();
    if (!name) return;

    setSaving(true);
    try {
      await updateTemplate(workspaceSlug, projectId, templateId, {
        name,
        description_html: editingDraft.description_html,
      });
      setEditingTemplateId(null);
      setEditingDraft(EMPTY_DRAFT);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success",
        message: "Template updated successfully.",
      });
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error",
        message: getErrorMessage(error, "Template could not be updated."),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (template: TWorkItemTemplate) => {
    setSaving(true);
    try {
      await updateTemplate(workspaceSlug, projectId, template.id, { is_active: !template.is_active });
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error",
        message: getErrorMessage(error, "Template status could not be updated."),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (templateId: string) => {
    setSaving(true);
    try {
      await deleteTemplate(workspaceSlug, projectId, templateId);
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error",
        message: getErrorMessage(error, "Template could not be deleted."),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {isEditable && (
        <div className="grid gap-3 rounded border border-subtle p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto]">
          <input
            aria-label="Template name"
            className="focus:border-custom-primary-100 h-9 rounded border border-subtle bg-surface-1 px-3 text-13 outline-none"
            placeholder="Template name"
            value={draft.name}
            onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
          />
          <input
            aria-label="Template description"
            className="focus:border-custom-primary-100 h-9 rounded border border-subtle bg-surface-1 px-3 text-13 outline-none"
            placeholder="Description"
            value={draft.description_html}
            onChange={(event) => setDraft((current) => ({ ...current, description_html: event.target.value }))}
          />
          <button
            type="button"
            className="bg-custom-primary-100 h-9 rounded px-3 text-13 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={saving || !draft.name.trim()}
            onClick={handleCreate}
          >
            Create template
          </button>
        </div>
      )}

      {templates.length === 0 ? (
        <div className="text-sm rounded border border-dashed border-subtle p-6 text-tertiary">
          Self-hosted — no templates yet, create one.
        </div>
      ) : (
        <div className="overflow-hidden rounded border border-subtle">
          {templates.map((template) => {
            const isEditing = editingTemplateId === template.id;

            return (
              <div
                key={template.id}
                className="grid gap-3 border-b border-subtle p-4 last:border-b-0 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.6fr)_auto_auto]"
              >
                {isEditing ? (
                  <>
                    <input
                      aria-label="Edit template name"
                      className="focus:border-custom-primary-100 h-8 rounded border border-subtle bg-surface-1 px-2 text-13 outline-none"
                      value={editingDraft.name}
                      onChange={(event) => setEditingDraft((current) => ({ ...current, name: event.target.value }))}
                    />
                    <input
                      aria-label="Edit template description"
                      className="focus:border-custom-primary-100 h-8 rounded border border-subtle bg-surface-1 px-2 text-13 outline-none"
                      value={editingDraft.description_html}
                      onChange={(event) =>
                        setEditingDraft((current) => ({ ...current, description_html: event.target.value }))
                      }
                    />
                  </>
                ) : (
                  <>
                    <div className="min-w-0">
                      <div className="truncate text-14 font-medium text-primary">{template.name}</div>
                      <div className="mt-1 text-12 text-tertiary">
                        {template.issue_type ? "Typed template" : "Any work item type"}
                      </div>
                    </div>
                    <div className="min-w-0 truncate text-13 text-secondary">
                      {template.description_html || "No description"}
                    </div>
                  </>
                )}

                <div className="flex items-center">
                  <TemplateStatus template={template} />
                </div>

                {isEditable && (
                  <div className="flex items-center justify-end gap-1">
                    {isEditing ? (
                      <>
                        <button
                          type="button"
                          className="grid size-7 place-items-center rounded text-tertiary hover:bg-surface-2 hover:text-primary"
                          disabled={saving || !editingDraft.name.trim()}
                          title="Save template"
                          onClick={() => handleSaveEdit(template.id)}
                        >
                          <Check className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          className="grid size-7 place-items-center rounded text-tertiary hover:bg-surface-2 hover:text-primary"
                          title="Cancel edit"
                          onClick={() => {
                            setEditingTemplateId(null);
                            setEditingDraft(EMPTY_DRAFT);
                          }}
                        >
                          <X className="size-3.5" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="grid size-7 place-items-center rounded text-tertiary hover:bg-surface-2 hover:text-primary"
                          title="Edit template"
                          onClick={() => {
                            setEditingTemplateId(template.id);
                            setEditingDraft({
                              name: template.name,
                              description_html: template.description_html,
                            });
                          }}
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          className="grid size-7 place-items-center rounded text-tertiary hover:bg-surface-2 hover:text-primary"
                          disabled={saving}
                          title={template.is_active ? "Deactivate template" : "Reactivate template"}
                          onClick={() => handleToggleActive(template)}
                        >
                          <Power className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          className="hover:bg-red-500/10 hover:text-red-600 grid size-7 place-items-center rounded text-tertiary"
                          disabled={saving}
                          title="Delete template"
                          onClick={() => handleDelete(template.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});
