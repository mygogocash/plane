/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */
/* eslint-disable react/no-array-index-key */

import type { Metadata } from "next";
import Link from "next/link";

import { Reveal } from "@/components/reveal";
import { SiteFooter } from "@/components/sections/site-footer";
import { SiteNav } from "@/components/site-nav";
import { siteConfig } from "@/lib/site";

const lastUpdated = "June 21, 2026";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: `Terms of Service for ${siteConfig.name}, the work-management app at ${siteConfig.domain}.`,
  alternates: { canonical: `${siteConfig.url}/terms-of-service` },
  robots: { index: true, follow: true },
};

interface Section {
  id: string;
  heading: string;
  body: ReadonlyArray<string>;
}

const SECTIONS: ReadonlyArray<Section> = [
  {
    id: "agreement",
    heading: "1. Agreement to these terms",
    body: [
      `These Terms of Service ("Terms") govern your access to and use of ${siteConfig.name} at ${siteConfig.domain} and the production app at app.manut.xyz (the "Service").`,
      "By signing in or using the Service, you agree to these Terms. If you do not agree, do not use the Service.",
    ],
  },
  {
    id: "eligibility",
    heading: "2. Eligibility and accounts",
    body: [
      "You must be at least 13 years old or the minimum age of digital consent in your jurisdiction to use the Service.",
      `You are responsible for activity under your account and for keeping credentials secure. Notify us at ${siteConfig.email} if you suspect unauthorized access.`,
    ],
  },
  {
    id: "access",
    heading: "3. Access model",
    body: [
      "The current landing page presents Manut as an access-controlled production app. Existing users sign in at app.manut.xyz and new teams can request access by email.",
      "This page does not promise public self-service signup, public paid tiers, or public payment checkout.",
    ],
  },
  {
    id: "acceptable-use",
    heading: "4. Acceptable use",
    body: [
      "You may not use the Service to violate law, infringe rights, harass others, send spam or malware, disrupt the Service, attempt unauthorized access, or abuse the Service infrastructure.",
      "AI-assisted features, when enabled, must be used lawfully and reviewed before relying on output.",
    ],
  },
  {
    id: "content",
    heading: "5. Your content",
    body: [
      "You retain ownership of the content you create or upload to the Service. You grant us permission to host, process, display, and transmit that content as needed to operate, secure, support, and improve the Service.",
      "You are responsible for ensuring you have the rights to upload content, including any personal data of others contained in it.",
    ],
  },
  {
    id: "ai",
    heading: "6. AI-assisted features",
    body: [
      "AI-assisted features may produce inaccurate, incomplete, or unsuitable output. You are responsible for reviewing output before using it for decisions or project state.",
      "Do not submit content to AI-assisted features unless you are authorized to share that content with the processors used for your workspace.",
    ],
  },
  {
    id: "source",
    heading: "7. Source repository",
    body: [
      "The public repository is available for source review and issue tracking. The hosted Service remains governed by these Terms, while source files may also include their own notices in the repository.",
    ],
  },
  {
    id: "privacy",
    heading: "8. Privacy",
    body: [
      "Our Privacy Policy explains how we collect, use, and protect personal data. By using the Service, you agree to the Privacy Policy.",
    ],
  },
  {
    id: "termination",
    heading: "9. Termination",
    body: [
      "You can stop using the Service and request account or workspace deletion. We may suspend or terminate access that violates these Terms, creates security risk, or must be restricted by law.",
    ],
  },
  {
    id: "warranty",
    heading: "10. Disclaimer of warranties",
    body: [
      'The Service is provided "as is" and "as available" without warranties of any kind. We do not warrant that the Service will be uninterrupted, error-free, secure, or that AI output will be accurate.',
    ],
  },
  {
    id: "liability",
    heading: "11. Limitation of liability",
    body: [
      "To the maximum extent permitted by law, Manut and GoGoCash will not be liable for indirect, incidental, special, consequential, punitive damages, or loss of profits or data arising from use of the Service.",
    ],
  },
  {
    id: "changes",
    heading: "12. Changes to these Terms",
    body: [
      "We may update these Terms from time to time. Material changes will be communicated by email, in-product notice, or an update to this page.",
    ],
  },
  {
    id: "contact",
    heading: "13. Contact",
    body: [`Questions about these Terms? Email ${siteConfig.email}.`],
  },
];

export default function TermsPage() {
  return (
    <>
      <SiteNav />
      <main
        id="main"
        className="flex min-w-0 flex-col overflow-x-clip pt-[calc(5.5rem+env(safe-area-inset-top,0px))] sm:pt-[calc(7.5rem+env(safe-area-inset-top,0px))]"
      >
        <section className="section-pad relative">
          <div className="container-prose max-w-3xl">
            <Reveal>
              <p className="kicker kicker-line">Legal</p>
              <h1 className="mt-4 text-[clamp(2rem,4.5vw,3.5rem)] leading-[1.05] font-semibold tracking-[-0.03em] text-balance">
                Terms of Service
              </h1>
              <p className="text-sm text-muted-foreground mt-4">
                Last updated: {lastUpdated} · This is a draft pending legal review. Material changes will be
                communicated before they take effect.
              </p>
            </Reveal>

            <Reveal delay={120}>
              <nav aria-label="On this page" className="border-border bg-card/60 mt-10 rounded-2xl border p-5">
                <div className="kicker mb-3">On this page</div>
                <ol className="grid gap-1.5 sm:grid-cols-2">
                  {SECTIONS.map((s) => (
                    <li key={s.id}>
                      <Link
                        href={`#${s.id}`}
                        className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
                      >
                        {s.heading}
                      </Link>
                    </li>
                  ))}
                </ol>
              </nav>
            </Reveal>

            <Reveal delay={200}>
              <div className="mt-10 space-y-12">
                {SECTIONS.map((section) => (
                  <article
                    key={section.id}
                    id={section.id}
                    aria-labelledby={`${section.id}-heading`}
                    className="scroll-mt-24"
                  >
                    <h2
                      id={`${section.id}-heading`}
                      className="text-foreground text-[clamp(1.25rem,2.2vw,1.75rem)] font-semibold tracking-tight"
                    >
                      {section.heading}
                    </h2>
                    <div className="text-muted-foreground mt-4 space-y-4 text-[15px] leading-relaxed">
                      {section.body.map((paragraph, i) => (
                        <p key={i} className="text-pretty">
                          {paragraph}
                        </p>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </Reveal>

            <Reveal delay={280}>
              <p className="text-sm text-muted-foreground mt-16">
                See also our{" "}
                <Link
                  href="/privacy-policy"
                  className="text-foreground underline underline-offset-4 hover:no-underline"
                >
                  Privacy Policy
                </Link>
                .
              </p>
            </Reveal>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
