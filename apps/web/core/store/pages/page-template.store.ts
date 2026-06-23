/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { makeAutoObservable, runInAction } from "mobx";

import type { TPage, TPageTemplate, TPageTemplateApplyPayload, TPageTemplatePayload } from "@plane/types";

import { pageTemplateService, type PageTemplateService } from "@/services/page/page-template.service";

type PageTemplateServiceContract = Pick<PageTemplateService, "apply" | "create" | "list" | "remove" | "update">;

export class PageTemplateStore {
  templatesByScope = new Map<string, TPageTemplate[]>();
  loadingScopes = new Set<string>();
  error: unknown = null;

  constructor(private service: PageTemplateServiceContract = pageTemplateService) {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  scopeKey(workspaceSlug: string, projectId?: string) {
    return `${workspaceSlug}:${projectId ?? "workspace"}`;
  }

  getTemplates(workspaceSlug: string, projectId?: string) {
    return this.templatesByScope.get(this.scopeKey(workspaceSlug, projectId)) ?? [];
  }

  isLoading(workspaceSlug: string, projectId?: string) {
    return this.loadingScopes.has(this.scopeKey(workspaceSlug, projectId));
  }

  getTemplatesForProject(workspaceSlug: string, projectId: string) {
    return this.getTemplates(workspaceSlug, projectId).filter(
      (template) => template.project === null || template.project === projectId
    );
  }

  async fetchTemplates(workspaceSlug: string, projectId?: string) {
    const scope = this.scopeKey(workspaceSlug, projectId);
    this.loadingScopes.add(scope);
    this.error = null;

    try {
      const templates = await this.service.list(workspaceSlug, projectId);
      runInAction(() => {
        this.templatesByScope.set(scope, templates);
      });
      return templates;
    } catch (error) {
      runInAction(() => {
        this.error = error;
      });
      throw error;
    } finally {
      runInAction(() => {
        this.loadingScopes.delete(scope);
      });
    }
  }

  async createTemplate(workspaceSlug: string, payload: TPageTemplatePayload) {
    const template = await this.service.create(workspaceSlug, payload);
    this.upsertTemplate(workspaceSlug, template);
    return template;
  }

  async updateTemplate(workspaceSlug: string, templateId: string, payload: Partial<TPageTemplatePayload>) {
    const template = await this.service.update(workspaceSlug, templateId, payload);
    this.upsertTemplate(workspaceSlug, template);
    return template;
  }

  async removeTemplate(workspaceSlug: string, templateId: string) {
    await this.service.remove(workspaceSlug, templateId);
    for (const [scope, templates] of this.templatesByScope.entries()) {
      if (scope.startsWith(`${workspaceSlug}:`)) {
        this.templatesByScope.set(
          scope,
          templates.filter((template) => template.id !== templateId)
        );
      }
    }
  }

  async applyTemplate(workspaceSlug: string, templateId: string, payload: TPageTemplateApplyPayload): Promise<TPage> {
    return this.service.apply(workspaceSlug, templateId, payload);
  }

  upsertTemplate(workspaceSlug: string, template: TPageTemplate) {
    for (const [scope, templates] of this.templatesByScope.entries()) {
      if (!scope.startsWith(`${workspaceSlug}:`)) continue;
      if (
        scope !== this.scopeKey(workspaceSlug) &&
        template.project !== null &&
        !scope.endsWith(`:${template.project}`)
      )
        continue;

      const existingIndex = templates.findIndex((row) => row.id === template.id);
      if (existingIndex >= 0) {
        templates[existingIndex] = template;
      } else {
        templates.unshift(template);
      }
      this.templatesByScope.set(scope, [...templates]);
    }
  }
}

export const pageTemplateStore = new PageTemplateStore();
