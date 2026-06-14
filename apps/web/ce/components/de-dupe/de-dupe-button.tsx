/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { SearchCheck } from "lucide-react";

type TDeDupeButtonRoot = {
  workspaceSlug: string;
  isDuplicateModalOpen: boolean;
  handleOnClick: () => void;
  label: string;
};

export function DeDupeButtonRoot(props: TDeDupeButtonRoot) {
  const { handleOnClick, isDuplicateModalOpen, label } = props;

  if (!label) return null;

  return (
    <button
      type="button"
      aria-expanded={isDuplicateModalOpen}
      onClick={handleOnClick}
      className="inline-flex h-7 items-center gap-1.5 rounded border border-subtle bg-surface-2 px-2 text-caption-sm-medium text-secondary hover:bg-surface-1"
    >
      <SearchCheck className="h-3.5 w-3.5" aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
