/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */
/* eslint-disable react/no-array-index-key */

import { Activity, Code2, ScanLine, ShieldCheck } from "lucide-react";

import { GithubIcon } from "@/components/icons/github";
import { Reveal } from "@/components/reveal";
import { ButtonLink } from "@/components/ui/button";
import { siteConfig, stats } from "@/lib/site";

const POINTS = [
  {
    icon: Code2,
    title: "Source you can inspect",
    body: "The public Manut repository is the review path for landing-page source, releases, and issues.",
  },
  {
    icon: ScanLine,
    title: "Entity facts stay centralized",
    body: "Brand, URL, app, repository, access, and support facts are shared across metadata, schema, nav, footer, and LLM summary files.",
  },
  {
    icon: ShieldCheck,
    title: "Operational claims are conservative",
    body: "The site avoids unsupported public signup, paid tier, compliance, and provider-specific AI promises.",
  },
] as const;

const EVIDENCE = [
  {
    color: "oklch(0.7_0.18_140)",
    text: "app.manut.xyz production entry point",
    label: "App",
  },
  {
    color: "oklch(0.7_0.16_280)",
    text: "instance API reports the current app version",
    label: "API",
  },
  {
    color: "oklch(0.7_0.16_240)",
    text: "Better Stack monitors the public domains",
    label: "Status",
  },
  {
    color: "oklch(0.78_0.18_85)",
    text: "mygogocash/Manut stores the landing source",
    label: "Repo",
  },
] as const;

export function OpenSource() {
  return (
    <section id="source" aria-labelledby="source-heading" className="section-pad relative">
      <div className="container-prose grid gap-12 md:grid-cols-2 md:gap-20">
        <Reveal>
          <p className="kicker kicker-line">Source and operations</p>
          <h2
            id="source-heading"
            className="mt-4 text-[clamp(1.875rem,3.4vw,3rem)] leading-[1.08] font-semibold tracking-[-0.025em] text-balance"
          >
            Public review path.
            <br />
            <span className="display-italic">Measured claims.</span>
          </h2>
          <p className="text-base text-muted-foreground sm:text-lg mt-5 max-w-prose text-pretty">
            Manut keeps its public identity tied to concrete surfaces: the landing page, the production app, the source
            repository, support email, and monitored runtime endpoints.
          </p>

          <ul className="mt-8 space-y-5">
            {POINTS.map((p) => (
              <li key={p.title} className="flex items-start gap-4">
                <span
                  aria-hidden
                  className="bg-foreground/[0.04] text-foreground grid size-9 shrink-0 place-items-center rounded-lg"
                >
                  <p.icon className="size-4" aria-hidden />
                </span>
                <div>
                  <h3 className="text-[15px] font-semibold tracking-tight">{p.title}</h3>
                  <p className="text-muted-foreground mt-1 text-[14px] leading-relaxed">{p.body}</p>
                </div>
              </li>
            ))}
          </ul>

          <ButtonLink
            href={siteConfig.github}
            target="_blank"
            rel="noopener noreferrer"
            variant="outline"
            className="mt-8 h-10 rounded-full px-5"
          >
            <GithubIcon className="size-4" aria-hidden />
            Browse the source
          </ButtonLink>
        </Reveal>

        <Reveal delay={140}>
          <div className="border-border bg-border grid grid-cols-2 gap-px overflow-hidden rounded-2xl border">
            {[
              { num: stats.release, label: "App version", grad: true },
              {
                num: stats.edition,
                label: "Runtime lane",
                color: "text-foreground",
              },
              { num: stats.auth, label: "Access methods", color: "text-foreground" },
              {
                num: stats.monitoring,
                label: "Monitoring",
                color: "text-foreground",
              },
            ].map((s, i) => (
              <div key={i} className="bg-card p-7 sm:p-8">
                <div
                  className={
                    "nums-tabular text-[clamp(1.35rem,3vw,2.2rem)] font-semibold tracking-[-0.04em] " +
                    (s.grad
                      ? "bg-[linear-gradient(135deg,oklch(0.18_0.01_260),oklch(0.78_0.16_25))] bg-clip-text text-transparent dark:bg-[linear-gradient(135deg,oklch(0.96_0.005_85),oklch(0.74_0.17_25))]"
                      : (s.color ?? ""))
                  }
                >
                  {s.num}
                </div>
                <div className="text-sm text-muted-foreground mt-1">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="border-border bg-card mt-5 rounded-2xl border p-6">
            <div className="kicker mb-4">Evidence trail</div>
            <ul className="space-y-3">
              {EVIDENCE.map((item) => (
                <li key={item.text} className="flex min-w-0 items-center gap-3 text-[13px]">
                  <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: item.color }} />
                  <span className="text-foreground min-w-0 truncate">{item.text}</span>
                  <span className="font-mono text-muted-foreground ml-auto shrink-0 text-[11px]">{item.label}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="border-border bg-muted/30 text-sm text-muted-foreground mt-5 flex items-center gap-2 rounded-2xl border p-4">
            <Activity className="text-foreground size-4 shrink-0" aria-hidden />
            Status monitoring is handled outside this static landing app.
          </div>
        </Reveal>
      </div>
    </section>
  );
}
