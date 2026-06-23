/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// editor
import type { TExtensions } from "@plane/editor";
import type { EPageStoreType } from "@/plane-web/hooks/store";
import { isSelfHostedFeatureEnabled } from "../lib/self-host-entitlements";

export type TEditorFlaggingHookReturnType = {
  document: {
    disabled: TExtensions[];
    flagged: TExtensions[];
  };
  liteText: {
    disabled: TExtensions[];
    flagged: TExtensions[];
  };
  richText: {
    disabled: TExtensions[];
    flagged: TExtensions[];
  };
};

export type TEditorFlaggingHookProps = {
  workspaceSlug: string;
  projectId?: string;
  storeType?: EPageStoreType;
};

const getDisabledExtensions = (): TExtensions[] =>
  isSelfHostedFeatureEnabled("collaboration_cursor") ? ["ai"] : ["ai", "collaboration-cursor"];

/**
 * @description extensions disabled in various editors
 */
export const useEditorFlagging = (_props: TEditorFlaggingHookProps): TEditorFlaggingHookReturnType => {
  const disabled = getDisabledExtensions();

  return {
    document: {
      disabled,
      flagged: [],
    },
    liteText: {
      disabled,
      flagged: [],
    },
    richText: {
      disabled,
      flagged: [],
    },
  };
};
