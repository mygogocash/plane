/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TDeDupeIssue } from "@plane/types";

export type TSimilarIssue = Pick<TDeDupeIssue, "id" | "name"> &
  Partial<Omit<TDeDupeIssue, "id" | "name">> & {
    confidence: number;
  };

export type TSimilarIssuesResponse = {
  results: TSimilarIssue[];
};
