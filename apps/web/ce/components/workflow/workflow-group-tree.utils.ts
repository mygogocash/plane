/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export const getWorkflowTargetStateLabels = (
  targetStateIds: string[],
  getStateName: (stateId: string) => string | undefined
): string[] => targetStateIds.map((stateId) => getStateName(stateId) ?? stateId);
