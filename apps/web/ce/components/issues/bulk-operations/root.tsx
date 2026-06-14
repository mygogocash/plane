/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// components
import { BulkOperationsUpgradeBanner } from "@/components/issues/bulk-operations/upgrade-banner";
// hooks
import { useMultipleSelectStore } from "@/hooks/store/use-multiple-select-store";
import type { TSelectionHelper } from "@/hooks/use-multiple-select";
import { SELF_HOSTED_PAID_FEATURES_ENABLED } from "@/plane-web/lib/self-host-entitlements";

type Props = {
  className?: string;
  selectionHelpers: TSelectionHelper;
};

export const IssueBulkOperationsRoot = observer(function IssueBulkOperationsRoot(props: Props) {
  const { className, selectionHelpers } = props;
  // store hooks
  const { isSelectionActive } = useMultipleSelectStore();

  if (!isSelectionActive || selectionHelpers.isSelectionDisabled) return null;

  if (SELF_HOSTED_PAID_FEATURES_ENABLED) return null;

  return <BulkOperationsUpgradeBanner className={className} />;
});
