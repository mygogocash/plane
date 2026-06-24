/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import Image from "next/image";
import Link from "next/link";

import { footerNav, siteConfig } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="safe-bottom border-border bg-card border-t py-12 sm:py-16">
      <div className="container-prose">
        <div className="grid gap-10 sm:gap-12 md:grid-cols-[260px_1fr] md:gap-20">
          <div>
            <Link
              href="/"
              className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight"
              aria-label={`${siteConfig.name} home`}
            >
              <Image
                src="/manut-logo.jpeg"
                alt=""
                aria-hidden
                width={32}
                height={32}
                className="size-8 rounded-md object-cover"
              />
              {siteConfig.name}
            </Link>
            <p className="text-sm text-muted-foreground mt-4 max-w-xs leading-relaxed">
              Work management for projects, work items, cycles, modules, intake, views, pages, attachments, and
              AI-assisted workflows.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {Object.entries(footerNav).map(([heading, items]) => (
              <div key={heading}>
                <div className="kicker mb-4">{heading}</div>
                <ul className="space-y-2.5">
                  {items.map((item) => (
                    <li key={item.label}>
                      <Link
                        href={item.href}
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                        {...(item.href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="border-border mt-10 flex flex-col items-start gap-4 border-t pt-6 sm:mt-14 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:pt-7">
          <p className="text-xs text-muted-foreground text-pretty">
            © {new Date().getFullYear()} {siteConfig.name} · GoGoCash · Source:{" "}
            <Link
              href={siteConfig.github}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground underline underline-offset-4"
            >
              GitHub
            </Link>
          </p>
          <div className="text-xs text-muted-foreground flex gap-5">
            <Link
              href={siteConfig.github}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              GitHub
            </Link>
            <Link href={siteConfig.appUrl} className="hover:text-foreground transition-colors">
              App
            </Link>
            <Link href={siteConfig.accessRequestHref} className="hover:text-foreground transition-colors">
              Request access
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
