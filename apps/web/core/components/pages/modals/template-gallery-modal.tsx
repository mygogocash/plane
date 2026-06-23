// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";

import type { TPage, TPageTemplate } from "@plane/types";

import { pageTemplateStore, type PageTemplateStore } from "@/store/pages/page-template.store";

type Props = {
  isOpen: boolean;
  workspaceSlug: string;
  projectId: string;
  onClose: () => void;
  onTemplateApplied?: (page: TPage) => void;
  store?: PageTemplateStore;
  initialTemplates?: TPageTemplate[];
};

export function TemplateGalleryModal(props: Props) {
  const {
    isOpen,
    workspaceSlug,
    projectId,
    onClose,
    onTemplateApplied,
    store = pageTemplateStore,
    initialTemplates,
  } = props;
  const [templates, setTemplates] = useState<TPageTemplate[]>(initialTemplates ?? []);
  const [isLoading, setIsLoading] = useState(false);
  const [applyingTemplateId, setApplyingTemplateId] = useState<string | null>(null);

  useEffect(() => {
    if (initialTemplates) setTemplates(initialTemplates);
  }, [initialTemplates]);

  useEffect(() => {
    if (!isOpen || initialTemplates) return;

    let isMounted = true;
    setIsLoading(true);
    store
      .fetchTemplates(workspaceSlug, projectId)
      .then((templateRows) => {
        if (isMounted) setTemplates(templateRows);
        return undefined;
      })
      .catch(() => {
        if (isMounted) setTemplates([]);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [initialTemplates, isOpen, projectId, store, workspaceSlug]);

  const handleApplyTemplate = async (template: TPageTemplate) => {
    setApplyingTemplateId(template.id);
    try {
      const page = await store.applyTemplate(workspaceSlug, template.id, {
        project_id: projectId,
        name: template.name,
      });
      onTemplateApplied?.(page);
      onClose();
    } finally {
      setApplyingTemplateId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-label="Page template gallery"
      className="border-custom-border-200 bg-custom-background-100 shadow-lg rounded-xl border p-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg text-custom-text-100 font-semibold">Start from a template</h2>
          <p className="text-sm text-custom-text-300 mt-1">Create a page with a reusable structure and content.</p>
        </div>
        <button
          type="button"
          className="text-sm text-custom-text-300 hover:text-custom-text-100 font-medium"
          onClick={onClose}
        >
          Close
        </button>
      </div>

      {isLoading ? <p className="text-sm text-custom-text-300 mt-5">Loading templates...</p> : null}

      {!isLoading && templates.length === 0 ? (
        <p className="border-custom-border-200 text-sm text-custom-text-300 mt-5 rounded-lg border border-dashed p-4">
          No page templates are available for this project yet.
        </p>
      ) : null}

      {templates.length > 0 ? (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {templates.map((template) => (
            <article
              key={template.id}
              className="border-custom-border-200 bg-custom-background-90 rounded-lg border p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-custom-text-100 font-medium">{template.name}</h3>
                  <p className="text-xs text-custom-text-400 mt-1 tracking-wide uppercase">
                    {template.template_type.replace("_", " ")}
                  </p>
                </div>
                <span className="bg-custom-background-80 text-xs text-custom-text-300 rounded-full px-2 py-1">
                  {template.access === 1 ? "Private" : "Public"}
                </span>
              </div>
              {template.description_stripped ? (
                <p className="text-sm text-custom-text-300 mt-3 line-clamp-2">{template.description_stripped}</p>
              ) : null}
              <button
                type="button"
                className="bg-custom-primary-100 text-sm mt-4 rounded-md px-3 py-2 font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                disabled={applyingTemplateId === template.id}
                onClick={() => handleApplyTemplate(template)}
              >
                {applyingTemplateId === template.id ? "Creating..." : "Use template"}
              </button>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
