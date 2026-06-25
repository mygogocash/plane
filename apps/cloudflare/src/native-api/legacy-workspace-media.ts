/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { fetchLegacyOrigin } from "../edge-routing";
import type { CloudflareBindings } from "../types";

export type LegacyWorkspaceMedia = {
  logo?: string | null;
  logo_url?: string | null;
};

export function pickLegacyWorkspaceMedia(raw: Record<string, unknown>): LegacyWorkspaceMedia {
  const logoUrl = typeof raw.logo_url === "string" ? raw.logo_url : raw.logo_url === null ? null : undefined;
  const logo = typeof raw.logo === "string" ? raw.logo : raw.logo === null ? null : undefined;

  return { logo_url: logoUrl, logo };
}

export function applyLegacyWorkspaceMedia<T extends Record<string, unknown>>(
  payload: T,
  legacy: LegacyWorkspaceMedia | undefined
): T {
  if (!legacy) {
    return payload;
  }

  const resolvedUrl =
    [legacy.logo_url, legacy.logo].find((value) => typeof value === "string" && value !== "") ??
    legacy.logo_url ??
    legacy.logo ??
    null;

  return {
    ...payload,
    logo_url: resolvedUrl,
    logo: resolvedUrl,
  };
}

export async function fetchLegacyUserWorkspacesBySlug(
  request: Request,
  env: CloudflareBindings
): Promise<Map<string, Record<string, unknown>>> {
  const legacyOrigin = env.LEGACY_GKE_ORIGIN?.trim();
  if (!legacyOrigin) {
    return new Map();
  }

  const appOrigin = env.APP_ORIGIN ?? "https://app.manut.xyz";

  try {
    const response = await fetchLegacyOrigin(
      new Request(new URL("/api/users/me/workspaces/", appOrigin).toString(), {
        method: "GET",
        headers: request.headers,
      }),
      env,
      "api"
    );

    if (!response.ok) {
      return new Map();
    }

    const data = (await response.json()) as unknown;
    if (!Array.isArray(data)) {
      return new Map();
    }

    const index = new Map<string, Record<string, unknown>>();
    for (const row of data) {
      if (!row || typeof row !== "object") {
        continue;
      }

      const record = row as Record<string, unknown>;
      if (typeof record.slug === "string") {
        index.set(record.slug, record);
      }
    }

    return index;
  } catch (error) {
    console.error("LEGACY_WORKSPACE_MEDIA_FETCH_FAILED", error);
    return new Map();
  }
}

export async function fetchLegacyWorkspaceBySlug(
  request: Request,
  env: CloudflareBindings,
  slug: string
): Promise<Record<string, unknown> | null> {
  const legacyOrigin = env.LEGACY_GKE_ORIGIN?.trim();
  if (!legacyOrigin) {
    return null;
  }

  const appOrigin = env.APP_ORIGIN ?? "https://app.manut.xyz";

  try {
    const response = await fetchLegacyOrigin(
      new Request(new URL(`/api/workspaces/${encodeURIComponent(slug)}/`, appOrigin).toString(), {
        method: "GET",
        headers: request.headers,
      }),
      env,
      "api"
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as unknown;
    return data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  } catch (error) {
    console.error("LEGACY_WORKSPACE_DETAIL_MEDIA_FETCH_FAILED", error);
    return null;
  }
}
