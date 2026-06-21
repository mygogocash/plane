import {
  Activity,
  ArrowRight,
  BadgeCheck,
  MailCheck,
  Sparkles,
  Workflow,
} from 'lucide-react';

import { HeroWordFlip } from '@/components/hero-word-flip';
import { GithubIcon } from '@/components/icons/github';
import { ProductMockup } from '@/components/sections/product-mockup';
import { ButtonLink } from '@/components/ui/button';
import { siteConfig, stats } from '@/lib/site';

export function Hero() {
  return (
    <section
      aria-labelledby="hero-heading"
      className="hero-mesh-genz relative overflow-hidden pt-[calc(5.5rem+env(safe-area-inset-top,0px))] sm:pt-[calc(7.5rem+env(safe-area-inset-top,0px))] md:pt-[calc(8rem+env(safe-area-inset-top,0px))]"
    >
      <div
        aria-hidden
        className="bg-spectrum pointer-events-none absolute inset-x-0 -top-32 h-[min(560px,85vh)]"
      />

      <div className="container-prose relative">
        <div className="mx-auto max-w-4xl text-center">
          <div className="badge-sticker mx-auto mb-6 max-w-full sm:mb-7">
            <Activity
              className="size-3.5 shrink-0 text-[oklch(0.78_0.16_25)]"
              aria-hidden
            />
            <span>Production app</span>
            <span className="font-normal normal-case tracking-normal text-muted-foreground">
              · access-controlled
            </span>
          </div>

          <h1
            id="hero-heading"
            className="text-[clamp(1.75rem,7.5vw,4.25rem)] font-semibold leading-[1.08] tracking-[-0.035em] text-foreground"
          >
            <span className="block">Projects, work items,</span>
            <span className="mt-1 block md:whitespace-nowrap">
              cycles, and <HeroWordFlip /> in one hub.
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-pretty text-[15px] leading-relaxed text-muted-foreground sm:mt-7 sm:text-base md:text-lg">
            Manut brings projects, work items, modules, intake, saved views,
            pages, attachments, and activity into{' '}
            <span className="font-medium text-foreground">
              one focused GoGoCash-hosted app
            </span>
            . AI-assisted workflows are available when configured, without
            overpromising public signup or unsupported provider claims.
          </p>

          <div className="mt-8 flex w-full flex-col gap-3 sm:mt-9 sm:flex-row sm:flex-wrap sm:justify-center">
            <ButtonLink
              href={siteConfig.appUrl}
              size="lg"
              className="h-12 w-full min-h-11 rounded-full bg-foreground px-6 text-base text-background shadow-[0_12px_40px_-12px_oklch(0.18_0.01_260/0.55)] hover:bg-foreground/90 sm:w-auto"
            >
              <span className="sm:hidden">Sign in</span>
              <span className="hidden sm:inline">Sign in to Manut</span>
              <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
            <ButtonLink
              href={siteConfig.github}
              target="_blank"
              rel="noopener noreferrer"
              size="lg"
              variant="outline"
              className="h-12 w-full min-h-11 rounded-full border-border bg-background/80 px-6 text-base backdrop-blur-sm hover:bg-muted sm:w-auto"
            >
              <GithubIcon className="size-4" aria-hidden />
              Review source
            </ButtonLink>
          </div>

          <ul
            aria-label="At a glance"
            className="mt-8 grid grid-cols-2 gap-x-4 gap-y-3 text-xs text-muted-foreground sm:mt-10 sm:flex sm:flex-wrap sm:justify-center sm:gap-x-8"
          >
            <li className="flex items-center justify-center gap-1.5 sm:justify-start">
              <BadgeCheck className="size-3.5 shrink-0" aria-hidden />
              {stats.release} live
            </li>
            <li className="flex items-center justify-center gap-1.5 sm:justify-start">
              <MailCheck className="size-3.5 shrink-0" aria-hidden />
              {stats.auth}
            </li>
            <li className="flex items-center justify-center gap-1.5 sm:justify-start">
              <Sparkles className="size-3.5 shrink-0" aria-hidden />
              AI assist configured
            </li>
            <li className="flex items-center justify-center gap-1.5 sm:justify-start">
              <Workflow className="size-3.5 shrink-0" aria-hidden />
              {stats.monitoring} monitored
            </li>
          </ul>
        </div>

        <ProductMockup />
      </div>
    </section>
  );
}
