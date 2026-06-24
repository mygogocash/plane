/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useContext } from "react";
import { StoreContext } from "@/lib/store-context";
import type { IAICopilotStore } from "@/store/ai/copilot.store";

export const useCopilot = (): IAICopilotStore => {
  const context = useContext(StoreContext);
  if (context === undefined) throw new Error("useCopilot must be used within StoreProvider");
  return context.aiCopilot;
};
