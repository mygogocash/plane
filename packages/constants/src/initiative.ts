/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TInitiativeState } from "@plane/types";

export const INITIATIVE_STATE_COLORS: {
  [key in TInitiativeState]: string;
} = {
  DRAFT: "#525252",
  PLANNED: "#3F76FF",
  ACTIVE: "#F59E0B",
  COMPLETED: "#16A34A",
  CLOSED: "#DC2626",
};

export const INITIATIVE_STATES: {
  i18n_label: string;
  value: TInitiativeState;
  color: string;
  textColor: string;
  bgColor: string;
}[] = [
  {
    i18n_label: "project_initiatives.status.draft",
    value: "DRAFT",
    color: INITIATIVE_STATE_COLORS.DRAFT,
    textColor: "text-tertiary",
    bgColor: "bg-surface-2",
  },
  {
    i18n_label: "project_initiatives.status.planned",
    value: "PLANNED",
    color: INITIATIVE_STATE_COLORS.PLANNED,
    textColor: "text-blue-500",
    bgColor: "bg-indigo-50",
  },
  {
    i18n_label: "project_initiatives.status.active",
    value: "ACTIVE",
    color: INITIATIVE_STATE_COLORS.ACTIVE,
    textColor: "text-amber-500",
    bgColor: "bg-amber-50",
  },
  {
    i18n_label: "project_initiatives.status.completed",
    value: "COMPLETED",
    color: INITIATIVE_STATE_COLORS.COMPLETED,
    textColor: "text-success-primary",
    bgColor: "bg-success-subtle",
  },
  {
    i18n_label: "project_initiatives.status.closed",
    value: "CLOSED",
    color: INITIATIVE_STATE_COLORS.CLOSED,
    textColor: "text-danger-primary",
    bgColor: "bg-danger-subtle",
  },
];
