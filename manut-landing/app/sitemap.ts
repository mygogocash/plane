/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { MetadataRoute } from "next";

import { siteConfig } from "@/lib/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const pages = [
    { path: "", priority: 1, changeFrequency: "weekly" as const },
    { path: "about-us", priority: 0.6, changeFrequency: "monthly" as const },
    { path: "contact-us", priority: 0.6, changeFrequency: "monthly" as const },
    { path: "blog", priority: 0.4, changeFrequency: "monthly" as const },
    {
      path: "privacy-policy",
      priority: 0.3,
      changeFrequency: "yearly" as const,
    },
    {
      path: "terms-of-service",
      priority: 0.3,
      changeFrequency: "yearly" as const,
    },
    {
      path: "legal/data-deletion-instructions",
      priority: 0.3,
      changeFrequency: "yearly" as const,
    },
  ];

  return pages.map((page) => ({
    url: page.path ? `${siteConfig.url}/${page.path}` : siteConfig.url,
    lastModified: now,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));
}
