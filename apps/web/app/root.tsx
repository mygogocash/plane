/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import Script from "next/script";
import { Links, Meta, Outlet, Scripts } from "react-router";
import type { LinksFunction } from "react-router";
import { ThemeProvider } from "next-themes";
// plane imports
import {
  MANUT_BRAND,
  SITE_DESCRIPTION,
  SITE_KEYWORDS,
  SITE_NAME,
  SITE_TITLE,
  SITE_URL,
  TWITTER_USER_NAME,
} from "@plane/constants";
import { cn } from "@plane/utils";
// types
// assets
import favicon16 from "@/app/assets/favicon/favicon-16x16.png?url";
import favicon32 from "@/app/assets/favicon/favicon-32x32.png?url";
import icon180 from "@/app/assets/icons/icon-180x180.png?url";
import icon512 from "@/app/assets/icons/icon-512x512.png?url";
import ogImage from "@/app/assets/og-image.png?url";
import globalStyles from "@/styles/globals.css?url";
import type { Route } from "./+types/root";
// components
import { LogoSpinner } from "@/components/common/logo-spinner";
// local
import { CustomErrorComponent } from "./error";
import { AppProvider } from "./provider";
// fonts
// eslint-disable-next-line import/no-unassigned-import
import "@fontsource-variable/inter";
import interVariableWoff2 from "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url";
// eslint-disable-next-line import/no-unassigned-import
import "@fontsource/material-symbols-rounded";
// eslint-disable-next-line import/no-unassigned-import
import "@fontsource/ibm-plex-mono";

export const links: LinksFunction = () => [
  { rel: "icon", type: "image/png", sizes: "32x32", href: favicon32 },
  { rel: "icon", type: "image/png", sizes: "16x16", href: favicon16 },
  { rel: "shortcut icon", type: "image/png", href: favicon32 },
  { rel: "apple-touch-icon", href: icon512 },
  { rel: "apple-touch-icon", sizes: "180x180", href: icon180 },
  { rel: "apple-touch-icon", sizes: "512x512", href: icon512 },
  { rel: "manifest", href: "/manifest.json" },
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
  const isSessionRecorderEnabled = parseInt(process.env.VITE_ENABLE_SESSION_RECORDER || "0");

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content={MANUT_BRAND.themeColor} />
        <meta name="theme-color" content={MANUT_BRAND.darkThemeColor} media="(prefers-color-scheme: dark)" />
        {/* Meta info for PWA */}
        <meta name="application-name" content={MANUT_BRAND.productName} />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content={SITE_NAME} />
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <Meta />
        <Links />
      </head>
      <body suppressHydrationWarning>
        <div id="context-menu-portal" />
        <div id="editor-portal" />
        <ThemeProvider themes={["light", "dark", "light-contrast", "dark-contrast", "custom"]} defaultTheme="system">
          {children}
        </ThemeProvider>
        <Scripts />
        {!!isSessionRecorderEnabled && process.env.VITE_SESSION_RECORDER_KEY && (
          <Script id="clarity-tracking">
            {`(function(c,l,a,r,i,t,y){
              c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
              t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
              y=l.getElementsByTagName(r)[0];if(y){y.parentNode.insertBefore(t,y);}
          })(window, document, "clarity", "script", "${process.env.VITE_SESSION_RECORDER_KEY}");`}
          </Script>
        )}
      </body>
    </html>
  );
}

export const meta: Route.MetaFunction = () => [
  { title: SITE_TITLE },
  { name: "description", content: SITE_DESCRIPTION },
  { property: "og:title", content: SITE_TITLE },
  { property: "og:description", content: SITE_DESCRIPTION },
  { property: "og:url", content: SITE_URL },
  { property: "og:image", content: ogImage },
  { property: "og:image:width", content: "1200" },
  { property: "og:image:height", content: "630" },
  { property: "og:image:alt", content: SITE_TITLE },
  { name: "keywords", content: SITE_KEYWORDS },
  { name: "twitter:site", content: TWITTER_USER_NAME },
  { name: "twitter:card", content: "summary_large_image" },
  { name: "twitter:image", content: ogImage },
  { name: "twitter:image:width", content: "1200" },
  { name: "twitter:image:height", content: "630" },
  { name: "twitter:image:alt", content: SITE_TITLE },
];

export default function Root() {
  return (
    <AppProvider>
      <div className={cn("relative flex h-screen w-full flex-col overflow-hidden bg-canvas", "desktop-app-container")}>
        <main className="relative h-full w-full overflow-hidden">
          <Outlet />
        </main>
      </div>
    </AppProvider>
  );
}

export function HydrateFallback() {
  if (typeof window === "undefined") {
    return <div className="relative h-screen w-full bg-canvas" />;
  }

  return (
    <div className="relative flex h-screen w-full items-center justify-center bg-canvas">
      <LogoSpinner />
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <CustomErrorComponent error={error} />;
}
