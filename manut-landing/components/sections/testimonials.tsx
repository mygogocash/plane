/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Activity, Code2, Server, ShieldCheck } from "lucide-react";

import { Reveal } from "@/components/reveal";

const EVIDENCE = [
  {
    icon: Server,
    title: "Production endpoint",
    body: "The app entry point is app.manut.xyz, separate from the static landing page.",
  },
  {
    icon: Activity,
    title: "Instance API",
    body: "The production instance API exposes current runtime facts that operators can smoke test.",
  },
  {
    icon: ShieldCheck,
    title: "Access-controlled copy",
    body: "The landing page avoids public signup and billing claims that the app does not currently expose.",
  },
  {
    icon: Code2,
    title: "Source review",
    body: "The public repository is linked consistently for source, release, and issue review.",
  },
] as const;

export function Testimonials() {
  return (
    <section aria-labelledby="evidence-heading" className="section-pad relative">
      <div className="container-prose">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="kicker kicker-line">Evidence</p>
          <h2
            id="evidence-heading"
            className="mt-4 text-[clamp(1.875rem,3.4vw,3rem)] leading-[1.08] font-semibold tracking-[-0.025em] text-balance"
          >
            Facts that can be checked
            <span className="display-italic"> after deploy.</span>
          </h2>
        </Reveal>

        <Reveal delay={120} className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-4">
          {EVIDENCE.map((item) => (
            <article
              key={item.title}
              className="border-border bg-card flex flex-col gap-5 rounded-2xl border p-7 sm:p-8"
            >
              <span
                aria-hidden
                className="bg-foreground/[0.04] text-foreground grid size-10 place-items-center rounded-xl"
              >
                <item.icon className="size-4" aria-hidden />
              </span>
              <div>
                <h3 className="text-[15px] font-semibold tracking-tight">{item.title}</h3>
                <p className="text-muted-foreground mt-2 text-[14px] leading-relaxed">{item.body}</p>
              </div>
            </article>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
