/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Metadata } from "next";
import Link from "next/link";

import { Reveal } from "@/components/reveal";
import { SiteFooter } from "@/components/sections/site-footer";
import { SiteNav } from "@/components/site-nav";
import { siteConfig } from "@/lib/site";

const lastUpdated = "June 21, 2026";

export const metadata: Metadata = {
  title: "Data Deletion Instructions",
  description: `How to request deletion of ${siteConfig.name} account, workspace, and work-management data.`,
  alternates: {
    canonical: `${siteConfig.url}/legal/data-deletion-instructions`,
  },
  robots: { index: true, follow: true },
};

const STEPS = [
  {
    heading: "1. Delete content you control",
    body: "If your workspace exposes deletion controls, delete projects, work items, pages, attachments, comments, AI outputs, or other content you no longer need before requesting account-level deletion.",
  },
  {
    heading: "2. Request account or workspace deletion",
    body: "Email privacy@manut.xyz from the email address on your Manut account. Include your workspace name and whether you want specific workspace content deleted or your full account removed.",
  },
  {
    heading: "3. Verify ownership",
    body: "We may ask you to verify account or workspace ownership before deletion so that one user cannot remove another user or team workspace without authorization.",
  },
  {
    heading: "4. Completion",
    body: "After verification, active records are deleted or anonymized within a reasonable period unless longer retention is required for security, abuse prevention, legal obligations, or backup recovery.",
  },
] as const;

export default function DataDeletionInstructionsPage() {
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
                Data Deletion Instructions
              </h1>
              <p className="text-sm text-muted-foreground mt-4">
                Last updated: {lastUpdated} · Use this page to request deletion of Manut account, workspace, and
                work-management data.
              </p>
            </Reveal>

            <Reveal delay={120}>
              <div className="border-border bg-card/60 text-muted-foreground mt-10 rounded-2xl border p-5 text-[15px] leading-relaxed">
                Manut stores account and workspace data to operate the Service. Deletion requests remove active Manut
                records associated with the verified account or workspace, subject to legal, security, and backup
                retention requirements.
              </div>
            </Reveal>

            <Reveal delay={200}>
              <div className="mt-10 space-y-10">
                {STEPS.map((step) => (
                  <article key={step.heading}>
                    <h2 className="text-foreground text-[clamp(1.25rem,2.2vw,1.75rem)] font-semibold tracking-tight">
                      {step.heading}
                    </h2>
                    <p className="text-muted-foreground mt-4 text-[15px] leading-relaxed">{step.body}</p>
                  </article>
                ))}
              </div>
            </Reveal>

            <Reveal delay={280}>
              <div className="border-border bg-card/60 text-muted-foreground mt-12 rounded-2xl border p-5 text-[15px] leading-relaxed">
                <p>
                  For privacy questions, email{" "}
                  <a
                    href="mailto:privacy@manut.xyz"
                    className="text-foreground underline underline-offset-4 hover:no-underline"
                  >
                    privacy@manut.xyz
                  </a>
                  .
                </p>
                <p className="mt-4">
                  See also our{" "}
                  <Link
                    href="/legal/privacy"
                    className="text-foreground underline underline-offset-4 hover:no-underline"
                  >
                    Privacy Policy
                  </Link>{" "}
                  and{" "}
                  <Link href="/legal/terms" className="text-foreground underline underline-offset-4 hover:no-underline">
                    Terms of Service
                  </Link>
                  .
                </p>
              </div>
            </Reveal>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
