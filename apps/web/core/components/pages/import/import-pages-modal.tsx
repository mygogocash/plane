/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileText, Upload, X } from "lucide-react";
import { observer } from "mobx-react";
import { useParams, useRouter } from "next/navigation";
// constants
import { EPageAccess } from "@plane/constants";
// editor
import { convertHTMLDocumentToAllFormats } from "@plane/editor";
// plane imports
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IWorkspace, TPageCreatePayload } from "@plane/types";
import { EFileAssetType } from "@plane/types";
// ui
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";
import type { TPartialProject } from "@/plane-web/types";
// plane web hooks
import { EPageStoreType, usePageStore } from "@/plane-web/hooks/store";
// services
import { FileService } from "@/services/file.service";
import { ProjectPageService } from "@/services/page";
import { ProjectService } from "@/services/project";
// local imports
import type { TPageImportDraft } from "./page-import.utils";
import { getPageImportMetadata, parsePageImportFiles, rewriteHtmlAssetSources } from "./page-import.utils";

type TImportStatus = {
  message?: string;
  pageId?: string;
  state: "queued" | "importing" | "success" | "error";
  warnings?: string[];
};

type TAssetUploadResult =
  | {
      assetId: string;
      source: string;
      state: "uploaded";
    }
  | {
      state: "warning";
      warning: string;
    };

type TImportPagesModalProps = {
  defaultAccess?: EPageAccess;
  isOpen: boolean;
  onClose: () => void;
};

const getRouteParam = (value: string | string[] | undefined): string => (Array.isArray(value) ? value[0] : value) ?? "";

const IMPORT_ACCEPT = ".html,.htm,.md,.markdown,.zip,text/html,text/markdown,application/zip";

const buildCreatePayload = (draft: TPageImportDraft, html: string, access: EPageAccess): TPageCreatePayload => ({
  access,
  ...getPageImportMetadata(draft),
  name: draft.title,
  ...convertHTMLDocumentToAllFormats({
    document_html: html || "<p></p>",
    variant: "document",
  }),
});

export const ImportPagesModal = observer(function ImportPagesModal(props: TImportPagesModalProps) {
  const { defaultAccess = EPageAccess.PUBLIC, isOpen, onClose } = props;
  // router
  const router = useRouter();
  const params = useParams();
  const routeWorkspaceSlug = getRouteParam(params.workspaceSlug);
  const routeProjectId = getRouteParam(params.projectId);
  // refs
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // services
  const fileService = useMemo(() => new FileService(), []);
  const projectPageService = useMemo(() => new ProjectPageService(), []);
  const projectService = useMemo(() => new ProjectService(), []);
  // store hooks
  const { currentWorkspace, workspaces } = useWorkspace();
  const { fetchPagesList } = usePageStore(EPageStoreType.PROJECT);
  // states
  const [selectedWorkspaceSlug, setSelectedWorkspaceSlug] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedAccess, setSelectedAccess] = useState(defaultAccess);
  const [projects, setProjects] = useState<TPartialProject[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [drafts, setDrafts] = useState<TPageImportDraft[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<Record<string, TImportStatus>>({});

  const workspaceOptions = useMemo<IWorkspace[]>(
    () => Object.values(workspaces ?? {}).sort((a, b) => a.name.localeCompare(b.name)),
    [workspaces]
  );

  const canImport = !!selectedWorkspaceSlug && !!selectedProjectId && drafts.length > 0 && !isImporting && !isParsing;

  const resetImportState = () => {
    setDrafts([]);
    setParseErrors([]);
    setParseWarnings([]);
    setStatuses({});
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClose = () => {
    if (isImporting) return;
    resetImportState();
    onClose();
  };

  const parseFiles = async (files: File[]) => {
    if (files.length === 0) return;

    setIsParsing(true);
    setStatuses({});
    try {
      const result = await parsePageImportFiles(files);
      setDrafts(result.pages);
      setParseErrors(result.errors);
      setParseWarnings(result.warnings);
    } finally {
      setIsParsing(false);
    }
  };

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    void parseFiles(Array.from(event.target.files ?? []));
  };

  const handleDrop = (event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    void parseFiles(Array.from(event.dataTransfer.files ?? []));
  };

  const updateStatus = (draftId: string, status: TImportStatus) =>
    setStatuses((prev) => ({
      ...prev,
      [draftId]: status,
    }));

  const importDraft = async (draft: TPageImportDraft) => {
    updateStatus(draft.id, { state: "importing", message: "Creating page" });

    const createdPage = await projectPageService.create(
      selectedWorkspaceSlug,
      selectedProjectId,
      buildCreatePayload(draft, draft.html, selectedAccess)
    );
    const uploadedAssetMap: Record<string, string> = {};
    const importWarnings = [...draft.warnings];

    const assetUploadResults = await Promise.all<TAssetUploadResult>(
      draft.assets.map(async (asset) => {
        try {
          const uploadedAsset = await fileService.uploadProjectAsset(
            selectedWorkspaceSlug,
            selectedProjectId,
            {
              entity_identifier: createdPage.id ?? "",
              entity_type: EFileAssetType.PAGE_DESCRIPTION,
            },
            asset.file
          );

          return { state: "uploaded", source: asset.source, assetId: uploadedAsset.asset_id };
        } catch {
          return { state: "warning", warning: `Could not upload ${asset.file.name}.` };
        }
      })
    );

    for (const assetUploadResult of assetUploadResults) {
      if (assetUploadResult.state === "warning") {
        importWarnings.push(assetUploadResult.warning);
      } else {
        uploadedAssetMap[assetUploadResult.source] = assetUploadResult.assetId;
      }
    }

    if (Object.keys(uploadedAssetMap).length > 0 && createdPage.id) {
      updateStatus(draft.id, { state: "importing", message: "Saving uploaded assets" });
      const rewrittenHtml = rewriteHtmlAssetSources(draft.html, uploadedAssetMap);
      await projectPageService.updateDescription(
        selectedWorkspaceSlug,
        selectedProjectId,
        createdPage.id,
        convertHTMLDocumentToAllFormats({
          document_html: rewrittenHtml,
          variant: "document",
        })
      );
    }

    updateStatus(draft.id, {
      pageId: createdPage.id,
      state: "success",
      warnings: importWarnings,
      message: importWarnings.length > 0 ? "Imported with warnings" : "Imported",
    });

    return createdPage;
  };

  const importDrafts = () =>
    drafts.reduce<Promise<{ createdPages: string[]; failedCount: number }>>(
      async (previousResult, draft) => {
        const result = await previousResult;
        try {
          const createdPage = await importDraft(draft);
          if (createdPage.id) result.createdPages.push(createdPage.id);
        } catch (error) {
          result.failedCount += 1;
          updateStatus(draft.id, {
            state: "error",
            message:
              typeof error === "object" && error !== null && "error" in error
                ? String(error.error)
                : "Could not import this page.",
          });
        }
        return result;
      },
      Promise.resolve({ createdPages: [], failedCount: 0 })
    );

  const handleImport = async () => {
    if (!canImport) return;

    setIsImporting(true);

    try {
      const { createdPages, failedCount } = await importDrafts();

      if (selectedWorkspaceSlug === routeWorkspaceSlug && selectedProjectId === routeProjectId) {
        await fetchPagesList(selectedWorkspaceSlug, selectedProjectId);
      }

      if (createdPages.length === 1 && failedCount === 0) {
        handleClose();
        router.push(`/${selectedWorkspaceSlug}/projects/${selectedProjectId}/pages/${createdPages[0]}`);
      } else {
        setToast({
          type: failedCount > 0 ? TOAST_TYPE.ERROR : TOAST_TYPE.SUCCESS,
          title: failedCount > 0 ? "Import completed with errors" : "Import complete",
          message:
            failedCount > 0
              ? `${createdPages.length} page${createdPages.length === 1 ? "" : "s"} imported, ${failedCount} failed.`
              : `${createdPages.length} page${createdPages.length === 1 ? "" : "s"} imported.`,
        });
      }
    } finally {
      setIsImporting(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setSelectedWorkspaceSlug(routeWorkspaceSlug || currentWorkspace?.slug || workspaceOptions[0]?.slug || "");
    setSelectedProjectId(routeProjectId || "");
    setSelectedAccess(defaultAccess);
  }, [currentWorkspace?.slug, defaultAccess, isOpen, routeProjectId, routeWorkspaceSlug, workspaceOptions]);

  useEffect(() => {
    if (!isOpen || !selectedWorkspaceSlug) return;

    let isMounted = true;
    setIsLoadingProjects(true);

    const loadProjects = async () => {
      try {
        const projectsList = await projectService.getProjectsLite(selectedWorkspaceSlug);
        if (!isMounted) return;
        const activeProjects = projectsList.filter((project) => !project.archived_at && project.page_view !== false);
        setProjects(activeProjects);
        setSelectedProjectId((currentProjectId) => {
          if (currentProjectId && activeProjects.some((project) => project.id === currentProjectId)) {
            return currentProjectId;
          }
          return activeProjects[0]?.id ?? "";
        });
      } catch {
        if (!isMounted) return;
        setProjects([]);
        setSelectedProjectId("");
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "Error!",
          message: "Could not load projects for this workspace.",
        });
      } finally {
        if (isMounted) setIsLoadingProjects(false);
      }
    };

    void loadProjects();

    return () => {
      isMounted = false;
    };
  }, [isOpen, projectService, selectedWorkspaceSlug]);

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.CENTER} width={EModalWidth.XXXXL}>
      <div className="bg-surface-0 flex max-h-[85vh] flex-col overflow-hidden rounded-lg text-primary">
        <div className="flex items-center justify-between border-b border-subtle-1 px-5 py-4">
          <div>
            <h3 className="text-lg font-semibold">Import pages</h3>
            <p className="text-sm text-secondary">Import Notion HTML, Markdown, or ZIP exports into project Pages.</p>
          </div>
          <button
            type="button"
            className="rounded-md p-1 text-secondary hover:bg-surface-2 hover:text-primary"
            onClick={handleClose}
            disabled={isImporting}
            aria-label="Close import modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="space-y-1">
              <span className="text-xs font-medium text-secondary">Workspace</span>
              <select
                value={selectedWorkspaceSlug}
                onChange={(event) => setSelectedWorkspaceSlug(event.target.value)}
                disabled={isImporting}
                className="text-sm focus:border-accent-primary h-9 w-full rounded-md border border-subtle-1 bg-surface-1 px-2 outline-none"
              >
                {workspaceOptions.map((workspace) => (
                  <option key={workspace.id} value={workspace.slug}>
                    {workspace.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-xs font-medium text-secondary">Project</span>
              <select
                value={selectedProjectId}
                onChange={(event) => setSelectedProjectId(event.target.value)}
                disabled={isImporting || isLoadingProjects}
                className="text-sm focus:border-accent-primary h-9 w-full rounded-md border border-subtle-1 bg-surface-1 px-2 outline-none"
              >
                {projects.length === 0 && <option value="">No projects available</option>}
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-xs font-medium text-secondary">Visibility</span>
              <select
                value={selectedAccess}
                onChange={(event) => setSelectedAccess(Number(event.target.value) as EPageAccess)}
                disabled={isImporting}
                className="text-sm focus:border-accent-primary h-9 w-full rounded-md border border-subtle-1 bg-surface-1 px-2 outline-none"
              >
                <option value={EPageAccess.PUBLIC}>Public</option>
                <option value={EPageAccess.PRIVATE}>Private</option>
              </select>
            </label>
          </div>

          <button
            type="button"
            className="border-subtle-2 flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed bg-surface-1 px-4 py-6 text-center hover:bg-surface-2"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
          >
            <Upload className="mb-3 h-6 w-6 text-secondary" />
            <div className="text-sm font-medium">Choose files or drop a Notion export here</div>
            <div className="text-xs mt-1 text-secondary">Supported: .html, .htm, .md, .markdown, .zip</div>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={IMPORT_ACCEPT}
            multiple
            className="hidden"
            onChange={handleFileInputChange}
          />

          {(parseErrors.length > 0 || parseWarnings.length > 0) && (
            <div className="space-y-2 rounded-md border border-subtle-1 bg-surface-1 p-3">
              {[...parseErrors, ...parseWarnings].map((message) => (
                <div key={message} className="text-xs flex items-start gap-2 text-secondary">
                  <AlertTriangle className="text-warning mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{message}</span>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">Preview</h4>
              <span className="text-xs text-secondary">
                {isParsing ? "Parsing files" : `${drafts.length} page${drafts.length === 1 ? "" : "s"} ready to import`}
              </span>
            </div>

            <div className="overflow-hidden rounded-md border border-subtle-1">
              {drafts.length === 0 ? (
                <div className="text-sm px-4 py-5 text-center text-secondary">No pages parsed yet.</div>
              ) : (
                drafts.map((draft) => {
                  const status = statuses[draft.id] ?? { state: "queued" };
                  return (
                    <div
                      key={draft.id}
                      className="flex items-start justify-between gap-3 border-b border-subtle-1 px-4 py-3 last:border-b-0"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-secondary" />
                        <div className="min-w-0">
                          <div className="text-sm truncate font-medium">{draft.title}</div>
                          <div className="text-xs truncate text-secondary">
                            {draft.sourcePath}
                            {draft.assets.length > 0
                              ? ` · ${draft.assets.length} asset${draft.assets.length === 1 ? "" : "s"}`
                              : ""}
                          </div>
                          {status.warnings && status.warnings.length > 0 && (
                            <div className="mt-1 space-y-1">
                              {status.warnings.map((warning) => (
                                <div key={warning} className="text-xs text-warning">
                                  {warning}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-xs flex shrink-0 items-center gap-2 text-secondary">
                        {status.state === "success" && <CheckCircle2 className="text-success h-4 w-4" />}
                        {status.state === "error" && <AlertTriangle className="text-danger h-4 w-4" />}
                        <span>{status.message ?? status.state}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-subtle-1 px-5 py-4">
          <Button variant="secondary" size="lg" onClick={handleClose} disabled={isImporting}>
            Cancel
          </Button>
          <Button variant="primary" size="lg" onClick={handleImport} disabled={!canImport} loading={isImporting}>
            {isImporting ? "Importing" : "Import"}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
});
