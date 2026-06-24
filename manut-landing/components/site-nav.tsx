/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { ArrowRight, Menu } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import { ButtonLink } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { primaryNav, siteConfig } from "@/lib/site";
import { cn } from "@/lib/utils";

export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "safe-top fixed inset-x-0 top-0 z-50 transition-[backdrop-filter,background,border-color] duration-200",
        "border-b border-transparent",
        scrolled && "border-border/60 bg-background/80 backdrop-blur-xl backdrop-saturate-150"
      )}
    >
      <div className="container-prose flex h-14 min-h-14 items-center justify-between gap-3 sm:h-16 sm:gap-6">
        <Link
          href="/"
          className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight"
          aria-label={`${siteConfig.name} home`}
        >
          <Image
            src="/manut-logo.jpeg"
            alt="Manut logo"
            width={32}
            height={32}
            priority
            className="size-8 rounded-md object-cover"
          />
          {siteConfig.name}
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-7 md:flex">
          {primaryNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm text-muted-foreground hover:text-foreground font-medium transition-colors"
            >
              {item.label}
            </Link>
          ))}
          <Link
            href={siteConfig.github}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-muted-foreground hover:text-foreground font-medium transition-colors"
          >
            GitHub
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link
            href={siteConfig.appUrl}
            className="text-sm text-muted-foreground hover:text-foreground hidden font-medium transition-colors md:inline-flex"
          >
            Sign in
          </Link>
          <ButtonLink
            href={siteConfig.accessRequestHref}
            size="sm"
            className="bg-foreground text-background hover:bg-foreground/90 hidden min-h-11 rounded-full px-4 py-2 md:inline-flex"
          >
            Request access
            <ArrowRight className="size-3.5" aria-hidden />
          </ButtonLink>

          <Sheet>
            <SheetTrigger
              aria-label="Open menu"
              className="touch-target border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground inline-flex size-11 items-center justify-center rounded-full border transition-colors md:hidden"
            >
              <Menu className="size-4" aria-hidden />
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:max-w-sm">
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>
              <nav aria-label="Mobile" className="mt-6 flex flex-col px-6">
                {primaryNav.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="border-border text-lg border-b py-4 font-medium tracking-tight"
                  >
                    {item.label}
                  </Link>
                ))}
                <Link
                  href={siteConfig.github}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="border-border text-lg border-b py-4 font-medium tracking-tight"
                >
                  GitHub
                </Link>
                <Link href={siteConfig.appUrl} className="text-lg py-4 font-medium tracking-tight">
                  Sign in
                </Link>
                <ButtonLink
                  href={siteConfig.accessRequestHref}
                  className="bg-foreground text-background hover:bg-foreground/90 mt-6 h-11 w-full rounded-full"
                >
                  Request access
                  <ArrowRight className="size-3.5" aria-hidden />
                </ButtonLink>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
