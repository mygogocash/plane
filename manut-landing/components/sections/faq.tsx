/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Reveal } from "@/components/reveal";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { faqs, siteConfig } from "@/lib/site";

export function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-heading" className="section-pad border-border relative border-y">
      <div className="container-prose grid gap-12 md:grid-cols-[1fr_2fr] md:gap-20">
        <Reveal>
          <p className="kicker kicker-line">FAQ</p>
          <h2
            id="faq-heading"
            className="mt-4 text-[clamp(1.875rem,3.4vw,3rem)] leading-[1.08] font-semibold tracking-[-0.025em] text-balance"
          >
            FAQ — no fluff, just facts.
          </h2>
          <p className="text-base text-muted-foreground sm:text-lg mt-5 text-pretty">
            Straight answers for search, AI assistants, and your team lead who asks hard questions.
          </p>
          <p className="font-mono text-xs text-muted-foreground mt-6">
            Need more?{" "}
            <a href={`mailto:${siteConfig.email}`} className="hover:text-foreground underline underline-offset-4">
              {siteConfig.email}
            </a>
          </p>
        </Reveal>

        <Reveal delay={120}>
          <Accordion className="w-full" defaultValue={["item-0"]}>
            {faqs.map((f, i) => (
              <AccordionItem
                key={f.question}
                value={`item-${i}`}
                className="border-border data-[state=open]:bg-muted/20 border-b"
              >
                <AccordionTrigger className="py-5 text-left text-[16px] font-medium tracking-tight">
                  {f.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground text-[15px] leading-relaxed">
                  {f.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </div>
    </section>
  );
}
