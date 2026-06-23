/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export const SELF_HOSTED_PAID_FEATURES_ENABLED = true;
export const SELF_HOSTED_PLAN_LABEL = "Self-hosted";
export const SELF_HOSTED_PLAN_DESCRIPTION =
  "Self-hosted entitlement is enabled for this instance. Available CE features are not gated by paid-plan upsells.";

export const SELF_HOSTED_FEATURE_FLAGS = {
  active_cycles: true,
  ai_copilot: true,
  analytics: true,
  audit_logs: true,
  bulk_operations: true,
  collaboration_cursor: true,
  dashboards: true,
  epics: true,
  estimates_time: true,
  intake: true,
  initiatives: true,
  integrations: true,
  public_views_pages: true,
  recurring_work_items: true,
  teamspaces: true,
  templates: true,
  work_item_types: true,
  workflows_approvals: true,
  worklogs_time_tracking: true,
} as const;

export type TSelfHostedFeatureFlag = keyof typeof SELF_HOSTED_FEATURE_FLAGS;

export const isSelfHostedFeatureEnabled = (feature: TSelfHostedFeatureFlag): boolean =>
  SELF_HOSTED_FEATURE_FLAGS[feature];
