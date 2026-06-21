import { Activity, Code2, ScanLine, ShieldCheck } from 'lucide-react';

import { GithubIcon } from '@/components/icons/github';
import { Reveal } from '@/components/reveal';
import { ButtonLink } from '@/components/ui/button';
import { siteConfig, stats } from '@/lib/site';

const POINTS = [
  {
    icon: Code2,
    title: 'Source you can inspect',
    body: 'The public Manut repository is the review path for landing-page source, releases, and issues.',
  },
  {
    icon: ScanLine,
    title: 'Entity facts stay centralized',
    body: 'Brand, URL, app, repository, access, and support facts are shared across metadata, schema, nav, footer, and LLM summary files.',
  },
  {
    icon: ShieldCheck,
    title: 'Operational claims are conservative',
    body: 'The site avoids unsupported public signup, paid tier, compliance, and provider-specific AI promises.',
  },
] as const;

const EVIDENCE = [
  {
    color: 'oklch(0.7_0.18_140)',
    text: 'app.manut.xyz production entry point',
    label: 'App',
  },
  {
    color: 'oklch(0.7_0.16_280)',
    text: 'instance API reports the current app version',
    label: 'API',
  },
  {
    color: 'oklch(0.7_0.16_240)',
    text: 'Better Stack monitors the public domains',
    label: 'Status',
  },
  {
    color: 'oklch(0.78_0.18_85)',
    text: 'mygogocash/Manut stores the landing source',
    label: 'Repo',
  },
] as const;

export function OpenSource() {
  return (
    <section
      id="source"
      aria-labelledby="source-heading"
      className="section-pad relative"
    >
      <div className="container-prose grid gap-12 md:grid-cols-2 md:gap-20">
        <Reveal>
          <p className="kicker kicker-line">Source and operations</p>
          <h2
            id="source-heading"
            className="mt-4 text-balance text-[clamp(1.875rem,3.4vw,3rem)] font-semibold leading-[1.08] tracking-[-0.025em]"
          >
            Public review path.
            <br />
            <span className="display-italic">Measured claims.</span>
          </h2>
          <p className="mt-5 max-w-prose text-pretty text-base text-muted-foreground sm:text-lg">
            Manut keeps its public identity tied to concrete surfaces: the
            landing page, the production app, the source repository, support
            email, and monitored runtime endpoints.
          </p>

          <ul className="mt-8 space-y-5">
            {POINTS.map(p => (
              <li key={p.title} className="flex items-start gap-4">
                <span
                  aria-hidden
                  className="grid size-9 shrink-0 place-items-center rounded-lg bg-foreground/[0.04] text-foreground"
                >
                  <p.icon className="size-4" aria-hidden />
                </span>
                <div>
                  <h3 className="text-[15px] font-semibold tracking-tight">
                    {p.title}
                  </h3>
                  <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">
                    {p.body}
                  </p>
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
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border">
            {[
              { num: stats.release, label: 'App version', grad: true },
              {
                num: stats.edition,
                label: 'Runtime lane',
                color: 'text-foreground',
              },
              { num: stats.auth, label: 'Access methods', color: 'text-foreground' },
              {
                num: stats.monitoring,
                label: 'Monitoring',
                color: 'text-foreground',
              },
            ].map((s, i) => (
              <div key={i} className="bg-card p-7 sm:p-8">
                <div
                  className={
                    'nums-tabular text-[clamp(1.35rem,3vw,2.2rem)] font-semibold tracking-[-0.04em] ' +
                    (s.grad
                      ? 'bg-[linear-gradient(135deg,oklch(0.18_0.01_260),oklch(0.78_0.16_25))] bg-clip-text text-transparent dark:bg-[linear-gradient(135deg,oklch(0.96_0.005_85),oklch(0.74_0.17_25))]'
                      : (s.color ?? ''))
                  }
                >
                  {s.num}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {s.label}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-2xl border border-border bg-card p-6">
            <div className="kicker mb-4">Evidence trail</div>
            <ul className="space-y-3">
              {EVIDENCE.map(item => (
                <li
                  key={item.text}
                  className="flex min-w-0 items-center gap-3 text-[13px]"
                >
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: item.color }}
                  />
                  <span className="min-w-0 truncate text-foreground">
                    {item.text}
                  </span>
                  <span className="ml-auto shrink-0 font-mono text-[11px] text-muted-foreground">
                    {item.label}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-5 flex items-center gap-2 rounded-2xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            <Activity className="size-4 shrink-0 text-foreground" aria-hidden />
            Status monitoring is handled outside this static landing app.
          </div>
        </Reveal>
      </div>
    </section>
  );
}
