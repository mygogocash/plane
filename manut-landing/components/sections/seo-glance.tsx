/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { quickAnswers, siteConfig } from "@/lib/site";

/**
 * Visible, crawlable Q&A block for answer engines (AEO) and rich results.
 * Pairs with FAQPage JSON-LD in lib/jsonld.ts.
 */
export function SeoGlance() {
  return (
    <section
      id="about-manut"
      aria-labelledby="seo-glance-heading"
      className="seo-glance border-border/60 bg-muted/30 border-b py-8 sm:py-12"
    >
      <div className="container-prose">
        <h2
          id="seo-glance-heading"
          className="font-mono text-muted-foreground text-[11px] font-medium tracking-[0.2em] uppercase"
        >
          TL;DR for humans &amp; bots
        </h2>
        <ul className="mt-5 grid list-none gap-4 p-0 sm:mt-6 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
          {quickAnswers.map(({ question, answer }) => (
            <li key={question} className="border-border bg-card/80 rounded-2xl border p-5">
              <h3 className="text-sm text-foreground font-semibold tracking-tight">{question}</h3>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed text-pretty">{answer}</p>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground mt-8 text-center">
          Official site:{" "}
          <a href={siteConfig.url} className="underline underline-offset-2">
            {siteConfig.domain}
          </a>
          {" · "}
          <a href={siteConfig.github} className="underline underline-offset-2">
            GitHub
          </a>
          {" · "}
          <a href="/llms.txt" className="underline underline-offset-2">
            llms.txt
          </a>
        </p>
      </div>
    </section>
  );
}
