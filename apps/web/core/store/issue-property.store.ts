/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { set } from "lodash-es";
import { action, makeObservable, observable, runInAction } from "mobx";
// plane imports
import type { TIssueProperty } from "@plane/types";
// services
import { IssuePropertyService } from "@/services/issue-property.service";
// store
import type { CoreRootStore } from "./root.store";

const EMPTY_ISSUE_PROPERTIES: TIssueProperty[] = [];

export interface IIssuePropertyStore {
  propertiesByTypeId: Record<string, TIssueProperty[]>;
  loadingByTypeId: Record<string, boolean>;
  fetchedTypeIds: Record<string, boolean>;
  getPropertiesForType: (issueTypeId: string) => TIssueProperty[];
  getPropertiesLoadingForType: (issueTypeId: string) => boolean;
  hasFetchedPropertiesForType: (issueTypeId: string) => boolean;
  fetchPropertiesForType: (workspaceSlug: string, issueTypeId: string) => Promise<TIssueProperty[]>;
}

export class IssuePropertyStore implements IIssuePropertyStore {
  propertiesByTypeId: Record<string, TIssueProperty[]> = {};
  loadingByTypeId: Record<string, boolean> = {};
  fetchedTypeIds: Record<string, boolean> = {};
  rootStore: CoreRootStore;
  issuePropertyService: IssuePropertyService;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      propertiesByTypeId: observable,
      loadingByTypeId: observable,
      fetchedTypeIds: observable,
      fetchPropertiesForType: action,
    });
    this.rootStore = _rootStore;
    this.issuePropertyService = new IssuePropertyService();
  }

  getPropertiesForType = (issueTypeId: string): TIssueProperty[] =>
    this.propertiesByTypeId[issueTypeId] ?? EMPTY_ISSUE_PROPERTIES;

  getPropertiesLoadingForType = (issueTypeId: string): boolean => this.loadingByTypeId[issueTypeId] ?? false;

  hasFetchedPropertiesForType = (issueTypeId: string): boolean => this.fetchedTypeIds[issueTypeId] ?? false;

  fetchPropertiesForType = async (workspaceSlug: string, issueTypeId: string): Promise<TIssueProperty[]> => {
    runInAction(() => {
      set(this.loadingByTypeId, [issueTypeId], true);
    });

    try {
      const response = await this.issuePropertyService.list(workspaceSlug, issueTypeId);
      runInAction(() => {
        set(this.propertiesByTypeId, [issueTypeId], response);
        set(this.fetchedTypeIds, [issueTypeId], true);
        set(this.loadingByTypeId, [issueTypeId], false);
      });
      return response;
    } catch (error) {
      runInAction(() => {
        set(this.loadingByTypeId, [issueTypeId], false);
      });
      throw error;
    }
  };
}
