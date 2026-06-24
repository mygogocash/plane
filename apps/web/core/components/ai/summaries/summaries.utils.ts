// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import type {
  TEntitySummaryResponse,
  TSharedSummaryResponse,
  TSummaryEntityType,
  TSummaryRollup,
} from "@/services/ai.service";

export type { TEntitySummaryResponse, TSharedSummaryResponse, TSummaryEntityType, TSummaryRollup };

export type TSummaryService = {
  summarizeEntity: (
    workspaceSlug: string,
    entityType: TSummaryEntityType,
    entityId: string
  ) => Promise<TEntitySummaryResponse>;
  createShareLink: (
    workspaceSlug: string,
    entityType: TSummaryEntityType,
    entityId: string
  ) => Promise<TSharedSummaryResponse>;
};

export const buildAbsoluteShareUrl = (shareUrl: string, origin = "https://app.manut.xyz") => {
  if (shareUrl.startsWith("http://") || shareUrl.startsWith("https://")) {
    return shareUrl;
  }
  return `${origin.replace(/\/$/, "")}${shareUrl.startsWith("/") ? shareUrl : `/${shareUrl}`}`;
};

export type TRollupStatCard = {
  label: string;
  value: string;
};

export const buildRollupStatCards = (rollup: TSummaryRollup): TRollupStatCard[] => [
  {
    label: "Complete",
    value: `${Math.round(rollup.percent_complete ?? 0)}%`,
  },
  {
    label: "Blockers",
    value: String(rollup.blockers?.length ?? 0),
  },
  {
    label: "At risk",
    value: String(rollup.at_risk?.length ?? 0),
  },
];

export const loadEntitySummary = async ({
  workspaceSlug,
  entityType,
  entityId,
  service,
}: {
  workspaceSlug: string;
  entityType: TSummaryEntityType;
  entityId: string;
  service: TSummaryService;
}) => service.summarizeEntity(workspaceSlug, entityType, entityId);

export const copyEntityShareLink = async ({
  workspaceSlug,
  entityType,
  entityId,
  service,
  origin,
}: {
  workspaceSlug: string;
  entityType: TSummaryEntityType;
  entityId: string;
  service: TSummaryService;
  origin?: string;
}) => {
  const response = await service.createShareLink(workspaceSlug, entityType, entityId);
  return buildAbsoluteShareUrl(response.share_url, origin);
};

export const isDigestFeatureEnabled = ({
  featureEnabled,
  isProviderConfigured,
}: {
  featureEnabled: boolean;
  isProviderConfigured?: boolean;
}) => featureEnabled && Boolean(isProviderConfigured);

export const getDigestDisabledHint = (isProviderConfigured?: boolean) =>
  isProviderConfigured ? undefined : "Configure AI provider";
