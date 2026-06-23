/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Mail, MessageSquareText, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { GithubIcon } from "@/components/icons/github";
import { Reveal } from "@/components/reveal";
import { SiteFooter } from "@/components/sections/site-footer";
import { SiteNav } from "@/components/site-nav";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact us",
  description: "Get in touch with the Manut team — sales, support, security disclosures, and partnership inquiries.",
  alternates: { canonical: `${siteConfig.url}/contact-us` },
  openGraph: {
    title: "Contact Manut",
    description: "Reach the team via email or GitHub.",
    url: `${siteConfig.url}/contact-us`,
  },
};

const channels = [
  {
    icon: <Mail className="size-5" aria-hidden />,
    title: "General inquiries",
    body: "Sales, partnerships, anything else.",
    cta: { href: `mailto:${siteConfig.email}`, label: siteConfig.email },
  },
  {
    icon: <MessageSquareText className="size-5" aria-hidden />,
    title: "Support",
    body: "Bug reports, feature requests, deployment help.",
    cta: {
      href: `${siteConfig.github}/issues/new`,
      label: "Open an issue",
      external: true,
    },
  },
  {
    icon: <GithubIcon className="size-5" aria-hidden />,
    title: "Source + releases",
    body: "Follow development, read the changelog, contribute.",
    cta: {
      href: siteConfig.github,
      label: "mygogocash/Manut",
      external: true,
    },
  },
  {
    icon: <ShieldCheck className="size-5" aria-hidden />,
    title: "Security disclosures",
    body: "Responsible disclosure of vulnerabilities. PGP available on request.",
    cta: {
      href: `mailto:security@manut.xyz`,
      label: "security@manut.xyz",
    },
  },
];

export default function ContactUs() {
  return (
    <>
      <SiteNav />
      <main id="main" className="flex min-w-0 flex-col overflow-x-clip">
        <section className="section-pad relative">
          <div className="container-prose">
            <Reveal className="mx-auto max-w-3xl text-center">
              <p className="kicker kicker-line">Contact us</p>
              <h1 className="mt-4 text-[clamp(2rem,4.2vw,3.5rem)] leading-[1.05] font-semibold tracking-[-0.025em] text-balance">
                Real humans. <span className="display-italic text-gen-z-gradient">Fast replies.</span>
              </h1>
              <p className="text-base text-muted-foreground sm:text-lg mt-6 text-pretty">
                Pick the channel that matches your question. We aim to reply within one business day — and faster on
                GitHub.
              </p>
            </Reveal>

            <Reveal
              delay={120}
              className="border-border bg-border [&>article]:bg-card mx-auto mt-14 grid max-w-4xl grid-cols-1 overflow-hidden rounded-2xl border md:grid-cols-2"
            >
              {channels.map((c) => (
                <article
                  key={c.title}
                  className="group hover:bg-muted/50 relative isolate flex flex-col gap-4 p-7 transition-colors sm:p-8"
                >
                  <div className="bg-foreground/[0.04] text-foreground grid size-11 place-items-center rounded-xl transition-transform group-hover:-translate-y-0.5">
                    {c.icon}
                  </div>
                  <div>
                    <h2 className="text-lg text-foreground font-semibold tracking-tight">{c.title}</h2>
                    <p className="text-muted-foreground mt-2 text-[15px] leading-relaxed">{c.body}</p>
                  </div>
                  <Link
                    href={c.cta.href}
                    {...(c.cta.external ? { target: "_blank", rel: "noreferrer" } : {})}
                    className="bg-foreground/[0.04] font-mono text-foreground hover:bg-foreground/[0.08] mt-auto inline-flex items-center self-start rounded-full px-4 py-2 text-[13px] transition-colors"
                  >
                    {c.cta.label}
                  </Link>
                </article>
              ))}
            </Reveal>

            <Reveal
              delay={240}
              className="border-border bg-muted/30 mx-auto mt-12 max-w-2xl rounded-2xl border border-dashed p-6 text-center"
            >
              <p className="text-sm text-muted-foreground">
                Looking for a sales call or enterprise demo? Email{" "}
                <Link
                  href={`mailto:${siteConfig.email}`}
                  className="text-foreground decoration-foreground/30 hover:decoration-foreground underline underline-offset-4 transition-colors"
                >
                  {siteConfig.email}
                </Link>{" "}
                with your team size and use case and we&apos;ll set up a call.
              </p>
            </Reveal>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
