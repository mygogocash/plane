/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { Links, Meta, Outlet, Scripts } from "react-router";
import type { LinksFunction } from "react-router";
import {
  ADMIN_SITE_DESCRIPTION,
  ADMIN_SITE_TITLE,
  MANUT_BRAND,
  SITE_KEYWORDS,
  SITE_URL,
  TWITTER_USER_NAME,
} from "@plane/constants";
import appleTouchIcon from "@/app/assets/favicon/apple-touch-icon.png?url";
import favicon16 from "@/app/assets/favicon/favicon-16x16.png?url";
import favicon32 from "@/app/assets/favicon/favicon-32x32.png?url";
import { LogoSpinner } from "@/components/common/logo-spinner";
import globalStyles from "@/styles/globals.css?url";
import { AppProviders } from "@/providers";
import type { Route } from "./+types/root";
// fonts
// eslint-disable-next-line import/no-unassigned-import
import "@fontsource-variable/inter";
import interVariableWoff2 from "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url";
// eslint-disable-next-line import/no-unassigned-import
import "@fontsource/material-symbols-rounded";
// eslint-disable-next-line import/no-unassigned-import
import "@fontsource/ibm-plex-mono";

export const links: LinksFunction = () => [
  { rel: "apple-touch-icon", sizes: "180x180", href: appleTouchIcon },
  { rel: "icon", type: "image/png", sizes: "32x32", href: favicon32 },
  { rel: "icon", type: "image/png", sizes: "16x16", href: favicon16 },
  { rel: "shortcut icon", type: "image/png", href: favicon32 },
  { rel: "manifest", href: `/site.webmanifest.json` },
  { rel: "stylesheet", href: globalStyles },
  {
    rel: "preload",
    href: interVariableWoff2,
    as: "font",
    type: "font/woff2",
    crossOrigin: "anonymous",
  },
];

export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content={MANUT_BRAND.themeColor} />
        <meta name="theme-color" content={MANUT_BRAND.darkThemeColor} media="(prefers-color-scheme: dark)" />
        <meta name="application-name" content={ADMIN_SITE_TITLE} />
        <meta name="apple-mobile-web-app-title" content={ADMIN_SITE_TITLE} />
        <Meta />
        <Links />
      </head>
      <body className="antialiased" suppressHydrationWarning>
        <AppProviders>{children}</AppProviders>
        <Scripts />
      </body>
    </html>
  );
}

export const meta: Route.MetaFunction = () => [
  { title: ADMIN_SITE_TITLE },
  { name: "description", content: ADMIN_SITE_DESCRIPTION },
  { property: "og:title", content: ADMIN_SITE_TITLE },
  { property: "og:description", content: ADMIN_SITE_DESCRIPTION },
  { property: "og:url", content: SITE_URL },
  { name: "keywords", content: SITE_KEYWORDS },
  { name: "twitter:site", content: TWITTER_USER_NAME },
];

export default function Root() {
  return (
    <div className="min-h-screen bg-canvas">
      <Outlet />
    </div>
  );
}

export function HydrateFallback() {
  return (
    <div className="relative flex h-screen w-full items-center justify-center">
      <LogoSpinner />
    </div>
  );
}

export function ErrorBoundary({ error: _error }: Route.ErrorBoundaryProps) {
  return (
    <div>
      <p>Something went wrong.</p>
    </div>
  );
}
