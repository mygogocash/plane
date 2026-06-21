import { ArrowRight, Globe2, Rocket, Sparkles } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Reveal } from '@/components/reveal';
import { SiteFooter } from '@/components/sections/site-footer';
import { SiteNav } from '@/components/site-nav';
import { ButtonLink } from '@/components/ui/button';
import { siteConfig } from '@/lib/site';

export const metadata: Metadata = {
  title: 'About us',
  description:
    'Manut is the GoGoCash-hosted work-management app for projects, work items, cycles, modules, intake, views, pages, attachments, and AI-assisted workflows.',
  alternates: { canonical: `${siteConfig.url}/about-us` },
  openGraph: {
    title: 'About Manut',
    description:
      'Work management for teams that need clear project state and careful AI-assisted workflows.',
    url: `${siteConfig.url}/about-us`,
  },
};

const values = [
  {
    icon: <Sparkles className="size-5" aria-hidden />,
    title: 'Assistance needs review',
    body: 'Manut copy treats AI as configured assistance for summaries, drafts, triage, and next steps. It avoids provider-specific promises that operators cannot verify from the landing page.',
  },
  {
    icon: <Globe2 className="size-5" aria-hidden />,
    title: 'Source should be inspectable',
    body: 'Public source, release, and issue paths point to the mygogocash/Manut repository so technical reviewers can trace changes.',
  },
  {
    icon: <Rocket className="size-5" aria-hidden />,
    title: 'Work state beats tool sprawl',
    body: 'Projects, work items, cycles, modules, intake, views, pages, attachments, and activity belong near each other so teams can move with less context loss.',
  },
];

export default function AboutUs() {
  return (
    <>
      <SiteNav />
      <main id="main" className="flex min-w-0 flex-col overflow-x-clip">
        <section className="section-pad relative">
          <div className="container-prose">
            <Reveal className="mx-auto max-w-3xl text-center">
              <p className="kicker kicker-line">About Manut</p>
              <h1 className="mt-4 text-balance text-[clamp(2rem,4.2vw,3.5rem)] font-semibold leading-[1.05] tracking-[-0.025em]">
                Work management that{' '}
                <span className="display-italic text-gen-z-gradient">
                  stays close to the work.
                </span>
              </h1>
              <p className="mt-6 text-pretty text-base text-muted-foreground sm:text-lg">
                Manut is operated by GoGoCash as a focused production app for
                team work state. The landing page now describes what the app
                can be checked against: the app entry point, source repository,
                support contact, monitored domains, and current access model.
              </p>
            </Reveal>
          </div>
        </section>

        <section
          aria-labelledby="values-heading"
          className="section-pad relative"
        >
          <div className="container-prose">
            <Reveal className="mx-auto max-w-2xl text-center">
              <p className="kicker kicker-line">What we believe</p>
              <h2
                id="values-heading"
                className="mt-4 text-balance text-[clamp(1.75rem,3vw,2.5rem)] font-semibold leading-[1.1] tracking-[-0.025em]"
              >
                Three operating rules for the public site.
              </h2>
            </Reveal>
            <Reveal
              delay={120}
              className="mt-14 grid grid-cols-1 overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-3 [&>article]:bg-card"
            >
              {values.map(v => (
                <article
                  key={v.title}
                  className="group relative isolate flex flex-col gap-4 p-7 transition-colors hover:bg-muted/50 sm:p-8"
                >
                  <div className="grid size-11 place-items-center rounded-xl bg-foreground/[0.04] text-foreground transition-transform group-hover:-translate-y-0.5">
                    {v.icon}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold tracking-tight text-foreground">
                      {v.title}
                    </h3>
                    <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-muted-foreground">
                      {v.body}
                    </p>
                  </div>
                </article>
              ))}
            </Reveal>
          </div>
        </section>

        <section className="section-pad relative">
          <div className="container-prose">
            <Reveal className="mx-auto max-w-3xl rounded-2xl border border-border bg-card p-8 sm:p-12">
              <p className="kicker kicker-line">The operator</p>
              <h2 className="mt-4 text-balance text-[clamp(1.5rem,2.6vw,2rem)] font-semibold leading-[1.15] tracking-[-0.025em]">
                Manut is built and operated by GoGoCash.
              </h2>
              <p className="mt-5 text-pretty text-[15px] leading-relaxed text-muted-foreground sm:text-base">
                GoGoCash maintains the public Manut identity, the app entry
                point, and the support path. The current landing page favors
                factual claims over broad category language so search engines,
                users, and AI answer engines describe Manut accurately.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <ButtonLink href="/contact-us" className="rounded-full">
                  Get in touch
                  <ArrowRight className="ml-2 size-4" aria-hidden />
                </ButtonLink>
                <Link
                  href={siteConfig.github}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                >
                  View on GitHub
                </Link>
              </div>
            </Reveal>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
