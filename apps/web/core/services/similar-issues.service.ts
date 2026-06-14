/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";
// types
import type { TSimilarIssue, TSimilarIssuesResponse } from "@/types/similar-issue";
// services
import { APIService } from "@/services/api.service";

export class SimilarIssuesService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(workspaceSlug: string, projectId: string, title: string, limit = 5): Promise<TSimilarIssue[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/similar/`, {
      params: { title, limit },
    })
      .then((res) => {
        const data = res?.data as TSimilarIssuesResponse | undefined;
        return data?.results ?? [];
      })
      .catch((err) => {
        throw err?.response?.data;
      });
  }
}
