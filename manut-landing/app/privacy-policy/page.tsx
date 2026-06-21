import type { Metadata } from 'next';
import Link from 'next/link';

import { Reveal } from '@/components/reveal';
import { SiteFooter } from '@/components/sections/site-footer';
import { SiteNav } from '@/components/site-nav';
import { siteConfig } from '@/lib/site';

const lastUpdated = 'June 21, 2026';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: `Privacy Policy for ${siteConfig.name}, the work-management app at ${siteConfig.domain}.`,
  alternates: { canonical: `${siteConfig.url}/privacy-policy` },
  robots: { index: true, follow: true },
};

interface Section {
  id: string;
  heading: string;
  body: ReadonlyArray<string>;
}

const SECTIONS: ReadonlyArray<Section> = [
  {
    id: 'overview',
    heading: '1. Overview',
    body: [
      `This Privacy Policy explains how GoGoCash ("Manut", "we", "us") handles personal data when you use ${siteConfig.name} at ${siteConfig.domain} and the production app at app.manut.xyz (the "Service").`,
      `Questions about this draft policy can be sent to ${siteConfig.email}.`,
    ],
  },
  {
    id: 'data-we-collect',
    heading: '2. Data we collect',
    body: [
      'Account data, such as name, email address, password hash, sign-in events, and workspace membership.',
      'Workspace content, such as projects, work items, cycles, modules, intake records, pages, attachments, comments, and activity history.',
      'AI feature data, such as prompts, selected workspace context, outputs, and feedback when you choose to use configured AI-assisted workflow features.',
      'Usage, device, and log data, such as IP address, browser details, timestamps, page views, errors, and security events.',
      'Support correspondence, such as emails, issue reports, security disclosures, and access requests.',
    ],
  },
  {
    id: 'how-we-use-data',
    heading: '3. How we use data',
    body: [
      'We use personal data to operate the Service, authenticate users, maintain workspaces, provide support, secure the app, investigate abuse, debug issues, and improve reliability.',
      'We use workspace content only as needed to provide the features you request, including search, rendering, collaboration, attachments, notifications, and configured AI assistance.',
    ],
  },
  {
    id: 'ai',
    heading: '4. AI processing',
    body: [
      'When configured AI features are used, prompts and relevant workspace context may be sent to model providers or infrastructure vendors for inference. AI output may be stored with your workspace content so you can review or delete it later.',
      'Do not submit sensitive content to AI features unless you are authorized to share it with the processors used for your workspace.',
    ],
  },
  {
    id: 'sharing',
    heading: '5. How we share data',
    body: [
      'We share data with service providers acting on our behalf, such as hosting, storage, monitoring, email delivery, analytics, and AI inference providers.',
      'We share workspace content with the collaborators you invite or authorize in the workspace.',
      'We may disclose data when required by law, to protect the Service, or to prevent fraud, abuse, or security incidents. We do not sell personal data.',
    ],
  },
  {
    id: 'retention',
    heading: '6. Retention',
    body: [
      'We keep account and workspace data while your account or workspace is active. Deletion requests are handled as described in our data deletion instructions, subject to legal, security, and backup retention requirements.',
      'Operational logs and backups may be retained for a limited period for reliability, incident response, and abuse prevention.',
    ],
  },
  {
    id: 'security',
    heading: '7. Security',
    body: [
      'We use reasonable technical and organizational safeguards for the Service, including encrypted transport and restricted production access.',
      'No system is perfectly secure. If we discover a breach that affects your data, we will notify affected users as required by applicable law.',
    ],
  },
  {
    id: 'your-rights',
    heading: '8. Your rights',
    body: [
      'Depending on where you live, you may have rights to access, correct, delete, restrict, or port your personal data, and to object to certain processing.',
      'To exercise privacy rights, email privacy@manut.xyz from the address associated with your account.',
    ],
  },
  {
    id: 'children',
    heading: '9. Children',
    body: [
      'The Service is not intended for children under 13 or under the age of digital consent in their jurisdiction. If you believe a child provided personal data, email privacy@manut.xyz.',
    ],
  },
  {
    id: 'changes',
    heading: '10. Changes to this Policy',
    body: [
      'We may update this Policy from time to time. Material changes will be announced by email, in-product notice, or an update to this page.',
    ],
  },
  {
    id: 'contact',
    heading: '11. Contact',
    body: [
      `Privacy questions: privacy@manut.xyz. General contact: ${siteConfig.email}.`,
    ],
  },
];

export default function PrivacyPage() {
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
              <h1 className="mt-4 text-balance text-[clamp(2rem,4.5vw,3.5rem)] font-semibold leading-[1.05] tracking-[-0.03em]">
                Privacy Policy
              </h1>
              <p className="mt-4 text-sm text-muted-foreground">
                Last updated: {lastUpdated} · This is a draft pending legal
                review. Material changes will be communicated before they take
                effect.
              </p>
            </Reveal>

            <Reveal delay={120}>
              <nav
                aria-label="On this page"
                className="mt-10 rounded-2xl border border-border bg-card/60 p-5"
              >
                <div className="kicker mb-3">On this page</div>
                <ol className="grid gap-1.5 sm:grid-cols-2">
                  {SECTIONS.map(s => (
                    <li key={s.id}>
                      <Link
                        href={`#${s.id}`}
                        className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
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
                {SECTIONS.map(section => (
                  <article
                    key={section.id}
                    id={section.id}
                    aria-labelledby={`${section.id}-heading`}
                    className="scroll-mt-24"
                  >
                    <h2
                      id={`${section.id}-heading`}
                      className="text-[clamp(1.25rem,2.2vw,1.75rem)] font-semibold tracking-tight text-foreground"
                    >
                      {section.heading}
                    </h2>
                    <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-muted-foreground">
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
              <p className="mt-16 text-sm text-muted-foreground">
                See also our{' '}
                <Link
                  href="/terms-of-service"
                  className="text-foreground underline underline-offset-4 hover:no-underline"
                >
                  Terms of Service
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
