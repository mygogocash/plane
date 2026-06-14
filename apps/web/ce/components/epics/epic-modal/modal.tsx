/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useEffect, useRef } from "react";
import { Controller, useForm } from "react-hook-form";
import { useParams } from "next/navigation";
import { EpicService } from "@plane/services";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { EditorRefApi } from "@plane/editor";
import type { TEpicPayload, TIssue } from "@plane/types";
import { EFileAssetType } from "@plane/types";
import { EModalPosition, EModalWidth, Input, ModalCore } from "@plane/ui";
import { getDate, renderFormattedPayloadDate } from "@plane/utils";
import { DateDropdown } from "@/components/dropdowns/date";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { ProjectDropdown } from "@/components/dropdowns/project/dropdown";
import { RichTextEditor } from "@/components/editor/rich-text";
import { useEditorAsset } from "@/hooks/store/use-editor-asset";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUser } from "@/hooks/store/user/user-user";
import { WorkspaceService } from "@/services/workspace.service";
import { EpicProperties } from "../epic-properties/properties";

export interface EpicModalProps {
  data?: Partial<TIssue>;
  isOpen: boolean;
  onClose: () => void;
  beforeFormSubmit?: () => Promise<void>;
  onSubmit?: (res: TIssue) => Promise<void>;
  fetchIssueDetails?: boolean;
  primaryButtonText?: {
    default: string;
    loading: string;
  };
  isProjectSelectionDisabled?: boolean;
}

export type TEpicModalFormValues = {
  description_html: string;
  lead_id: string | null;
  name: string;
  project_id: string;
  start_date: string | null;
  target_date: string | null;
};

type TEpicServiceForSubmit = Pick<EpicService, "create" | "update">;

export const buildEpicModalPayload = (values: TEpicModalFormValues): TEpicPayload => ({
  assignee_ids: values.lead_id ? [values.lead_id] : [],
  description_html: values.description_html || "<p></p>",
  name: values.name.trim(),
  project_id: values.project_id,
  start_date: renderFormattedPayloadDate(values.start_date) ?? null,
  target_date: renderFormattedPayloadDate(values.target_date) ?? null,
});

export const submitEpicModalForm = async ({
  beforeFormSubmit,
  data,
  epicService,
  onClose,
  onSubmit,
  values,
  workspaceSlug,
}: {
  beforeFormSubmit?: () => Promise<void>;
  data?: Partial<TIssue>;
  epicService: TEpicServiceForSubmit;
  onClose: () => void;
  onSubmit?: (res: TIssue) => Promise<void>;
  values: TEpicModalFormValues;
  workspaceSlug: string | undefined;
}) => {
  const selectedProjectId = values.project_id || data?.project_id;
  if (!workspaceSlug || !selectedProjectId) throw new Error("Workspace and project are required to save an epic.");

  const payload = buildEpicModalPayload({ ...values, project_id: selectedProjectId });
  if (!payload.name) throw new Error("Epic title is required.");

  await beforeFormSubmit?.();
  const response = data?.id
    ? await epicService.update(workspaceSlug, selectedProjectId, data.id, payload)
    : await epicService.create(workspaceSlug, selectedProjectId, payload);

  await onSubmit?.(response);
  onClose();

  return response;
};

const epicService = new EpicService();
const workspaceService = new WorkspaceService();

export function CreateUpdateEpicModal(props: EpicModalProps) {
  const {
    data,
    isOpen,
    onClose,
    beforeFormSubmit,
    onSubmit,
    primaryButtonText,
    isProjectSelectionDisabled = false,
  } = props;
  const { projectId: routeProjectId, workspaceSlug: routeWorkspaceSlug } = useParams();
  const workspaceSlug = routeWorkspaceSlug?.toString();
  const defaultProjectId = data?.project_id ?? routeProjectId?.toString() ?? "";
  const editorRef = useRef<EditorRefApi | null>(null);
  const submitBtnRef = useRef<HTMLButtonElement | null>(null);
  const { uploadEditorAsset, duplicateEditorAsset } = useEditorAsset();
  const { getWorkspaceBySlug } = useWorkspace();
  const { projectsWithCreatePermissions } = useUser();
  const workspaceId = workspaceSlug ? (getWorkspaceBySlug(workspaceSlug)?.id ?? "") : "";

  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    reset,
    watch,
  } = useForm<TEpicModalFormValues>({
    defaultValues: {
      description_html: data?.description_html ?? "<p></p>",
      lead_id: data?.assignee_ids?.[0] ?? null,
      name: data?.name ?? "",
      project_id: defaultProjectId,
      start_date: data?.start_date ?? null,
      target_date: data?.target_date ?? null,
    },
  });
  const selectedProjectId = watch("project_id");
  const startDate = watch("start_date");
  const targetDate = watch("target_date");

  useEffect(() => {
    reset({
      description_html: data?.description_html ?? "<p></p>",
      lead_id: data?.assignee_ids?.[0] ?? null,
      name: data?.name ?? "",
      project_id: data?.project_id ?? routeProjectId?.toString() ?? "",
      start_date: data?.start_date ?? null,
      target_date: data?.target_date ?? null,
    });
  }, [data, reset, routeProjectId]);

  if (!isOpen) return null;

  const handleFormSubmit = async (values: TEpicModalFormValues) => {
    try {
      await submitEpicModalForm({
        beforeFormSubmit,
        data,
        epicService,
        onClose,
        onSubmit,
        values,
        workspaceSlug,
      });
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: error instanceof Error ? error.message : "Could not save epic. Please try again.",
      });
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.TOP} width={EModalWidth.XXL}>
      <form onSubmit={handleSubmit(handleFormSubmit)}>
        <div className="space-y-5 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <Controller
              control={control}
              name="project_id"
              rules={{ required: true }}
              render={({ field: { value, onChange } }) => (
                <div className="h-7">
                  <ProjectDropdown
                    value={value || null}
                    onChange={onChange}
                    multiple={false}
                    buttonVariant="border-with-text"
                    disabled={!!data?.id || isProjectSelectionDisabled}
                    placeholder="Project"
                    renderCondition={(projectId) => !!projectsWithCreatePermissions?.[projectId]}
                  />
                </div>
              )}
            />
            <h3 className="text-18 font-medium text-secondary">{data?.id ? "Update epic" : "Create epic"}</h3>
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <Controller
                control={control}
                name="name"
                rules={{
                  required: "Epic title is required.",
                  validate: (value) => (value.trim() ? undefined : "Epic title is required."),
                }}
                render={({ field: { value, onChange } }) => (
                  <Input
                    className="w-full text-14"
                    hasError={Boolean(errors.name)}
                    inputSize="md"
                    name="name"
                    onChange={onChange}
                    placeholder="Epic title"
                    type="text"
                    value={value}
                  />
                )}
              />
              <span className="text-11 text-danger-primary">{errors.name?.message}</span>
            </div>

            <div className="space-y-1">
              <span className="text-caption-sm-medium text-secondary">Description</span>
              <Controller
                control={control}
                name="description_html"
                render={({ field: { value, onChange } }) => (
                  <div className="rounded-md border-[0.5px] border-subtle bg-layer-2">
                    <RichTextEditor
                      editable
                      id="epic-modal-description"
                      initialValue={value || "<p></p>"}
                      value={value || "<p></p>"}
                      workspaceSlug={workspaceSlug ?? ""}
                      workspaceId={workspaceId}
                      projectId={selectedProjectId || undefined}
                      onChange={(_description, descriptionHtml) => onChange(descriptionHtml)}
                      onEnterKeyPress={() => submitBtnRef.current?.click()}
                      ref={editorRef}
                      containerClassName="min-h-[120px] pt-3"
                      placeholder={() => "Write a description"}
                      searchMentionCallback={async (payload) =>
                        await workspaceService.searchEntity(workspaceSlug ?? "", {
                          ...payload,
                          project_id: selectedProjectId,
                        })
                      }
                      uploadFile={async (blockId, file) => {
                        const { asset_id } = await uploadEditorAsset({
                          blockId,
                          data: {
                            entity_identifier: data?.id ?? "",
                            entity_type: EFileAssetType.ISSUE_DESCRIPTION,
                          },
                          file,
                          projectId: selectedProjectId,
                          workspaceSlug: workspaceSlug ?? "",
                        });
                        return asset_id;
                      }}
                      duplicateFile={async (assetId) => {
                        const { asset_id } = await duplicateEditorAsset({
                          assetId,
                          entityId: data?.id ?? "",
                          entityType: EFileAssetType.ISSUE_DESCRIPTION,
                          projectId: selectedProjectId,
                          workspaceSlug: workspaceSlug ?? "",
                        });
                        return asset_id;
                      }}
                    />
                  </div>
                )}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Controller
                control={control}
                name="lead_id"
                render={({ field: { value, onChange } }) => (
                  <div className="h-7">
                    <MemberDropdown
                      projectId={selectedProjectId || undefined}
                      value={value}
                      onChange={onChange}
                      buttonVariant="border-with-text"
                      placeholder="Lead"
                      multiple={false}
                      showUserDetails
                    />
                  </div>
                )}
              />
              <Controller
                control={control}
                name="start_date"
                render={({ field: { value, onChange } }) => (
                  <div className="h-7">
                    <DateDropdown
                      value={value}
                      onChange={(date) => onChange(date ? renderFormattedPayloadDate(date) : null)}
                      buttonVariant="border-with-text"
                      maxDate={getDate(targetDate) ?? undefined}
                      placeholder="Start date"
                    />
                  </div>
                )}
              />
              <Controller
                control={control}
                name="target_date"
                render={({ field: { value, onChange } }) => (
                  <div className="h-7">
                    <DateDropdown
                      value={value}
                      onChange={(date) => onChange(date ? renderFormattedPayloadDate(date) : null)}
                      buttonVariant="border-with-text"
                      minDate={getDate(startDate) ?? undefined}
                      placeholder="Target date"
                    />
                  </div>
                )}
              />
            </div>
            {data?.id && data.type_id && selectedProjectId && workspaceSlug && (
              <EpicProperties
                workspaceSlug={workspaceSlug}
                projectId={selectedProjectId}
                epicId={data.id}
                issueTypeId={data.type_id}
              />
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t-[0.5px] border-subtle px-5 py-4">
          <Button variant="secondary" size="lg" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button ref={submitBtnRef} variant="primary" size="lg" type="submit" loading={isSubmitting}>
            {isSubmitting
              ? (primaryButtonText?.loading ?? (data?.id ? "Updating" : "Creating"))
              : (primaryButtonText?.default ?? (data?.id ? "Update" : "Create"))}
          </Button>
        </div>
      </form>
    </ModalCore>
  );
}
