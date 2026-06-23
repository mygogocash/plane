/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Check } from "lucide-react";

import { Reveal } from "@/components/reveal";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { accessOptions } from "@/lib/site";
import { cn } from "@/lib/utils";

export function Access() {
  return (
    <section id="access" aria-labelledby="access-heading" className="section-pad border-border relative border-y">
      <div className="container-prose">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="kicker kicker-line">Access</p>
          <h2
            id="access-heading"
            className="mt-4 text-[clamp(1.875rem,3.4vw,3rem)] leading-[1.08] font-semibold tracking-[-0.025em] text-balance"
          >
            Clear entry points.
            <br />
            <span className="display-italic">No unsupported promises.</span>
          </h2>
          <p className="text-base text-muted-foreground sm:text-lg mt-5 text-pretty">
            Manut is presented as an access-controlled production app. Existing users sign in; new teams request access;
            technical reviewers can inspect the source.
          </p>
        </Reveal>

        <Reveal
          delay={120}
          className="border-border bg-border mx-auto mt-10 grid max-w-5xl grid-cols-1 gap-px overflow-hidden rounded-2xl border sm:mt-14 sm:rounded-3xl md:grid-cols-3"
        >
          {accessOptions.map((option) => (
            <article
              key={option.id}
              aria-label={option.name}
              className={cn(
                "relative flex flex-col p-6 sm:p-8 md:p-9",
                option.featured ? "bg-foreground text-background" : "bg-card"
              )}
            >
              {option.featured ? (
                <div className="absolute top-6 right-6">
                  <Badge className="bg-accent text-accent-foreground hover:bg-accent rounded-full">Primary</Badge>
                </div>
              ) : null}

              <div className={cn("kicker", option.featured ? "text-background/60" : "text-muted-foreground")}>
                {option.eyebrow}
              </div>

              <h3 className="text-2xl mt-5 font-semibold tracking-tight">{option.name}</h3>
              <p
                className={cn(
                  "mt-3 text-[14px] leading-relaxed",
                  option.featured ? "text-background/85" : "text-foreground/80"
                )}
              >
                {option.blurb}
              </p>

              <ul className="mt-7 flex flex-1 flex-col gap-3">
                {option.details.map((detail) => (
                  <li
                    key={detail}
                    className={cn(
                      "flex items-start gap-2.5 text-[14px] leading-relaxed",
                      option.featured ? "text-background/90" : "text-foreground"
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full",
                        option.featured ? "bg-accent text-accent-foreground" : "bg-foreground/10"
                      )}
                    >
                      <Check
                        className={cn(
                          "size-3 stroke-[2.5]",
                          option.featured ? "text-accent-foreground" : "text-foreground"
                        )}
                        aria-hidden
                      />
                    </span>
                    {detail}
                  </li>
                ))}
              </ul>

              <ButtonLink
                href={option.cta.href}
                target={option.cta.href.startsWith("http") ? "_blank" : undefined}
                rel={option.cta.href.startsWith("http") ? "noopener noreferrer" : undefined}
                size="lg"
                className={cn(
                  "mt-8 h-11 w-full rounded-full",
                  option.featured
                    ? "bg-accent text-accent-foreground hover:bg-accent/90"
                    : "bg-foreground text-background hover:bg-foreground/90"
                )}
              >
                {option.cta.label}
              </ButtonLink>
            </article>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
