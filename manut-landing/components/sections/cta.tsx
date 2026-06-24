/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { ArrowRight, Check } from "lucide-react";

import { Reveal } from "@/components/reveal";
import { ButtonLink } from "@/components/ui/button";
import { siteConfig } from "@/lib/site";

const POINTS = ["Existing users sign in", "New teams request access", "Source available", "Status monitored"] as const;

export function Cta() {
  return (
    <section aria-labelledby="cta-heading" className="relative overflow-hidden py-28 sm:py-36">
      <div aria-hidden className="bg-spectrum pointer-events-none absolute inset-0" />

      <div className="container-prose relative">
        <Reveal className="mx-auto max-w-3xl text-center">
          <p className="kicker kicker-line">Next step</p>
          <h2
            id="cta-heading"
            className="mt-4 text-[clamp(2rem,4.5vw,4rem)] leading-[1.05] font-semibold tracking-[-0.03em] text-balance"
          >
            Enter the app or <span className="display-italic text-gen-z-gradient">request access.</span>
          </h2>
          <p className="text-base text-muted-foreground sm:text-lg mx-auto mt-5 max-w-md text-pretty">
            Manut is live for authorized workspaces. Use the production app if you already have access, or contact
            GoGoCash to set up a workspace.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <ButtonLink
              href={siteConfig.appUrl}
              size="lg"
              className="bg-foreground text-base text-background hover:bg-foreground/90 h-12 rounded-full px-6"
            >
              Sign in to Manut
              <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
            <ButtonLink
              href={siteConfig.accessRequestHref}
              size="lg"
              variant="outline"
              className="text-base h-12 rounded-full px-6"
            >
              Request access
            </ButtonLink>
          </div>

          <ul className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
            {POINTS.map((p) => (
              <li
                key={p}
                className="font-mono tracking-wider text-muted-foreground inline-flex items-center gap-1.5 text-[11px] uppercase"
              >
                <Check className="text-accent-foreground size-3.5" aria-hidden />
                {p}
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
