import { quickAnswers, siteConfig } from '@/lib/site';

/**
 * Visible, crawlable Q&A block for answer engines (AEO) and rich results.
 * Pairs with FAQPage JSON-LD in lib/jsonld.ts.
 */
export function SeoGlance() {
  return (
    <section
      id="about-manut"
      aria-labelledby="seo-glance-heading"
      className="seo-glance border-b border-border/60 bg-muted/30 py-8 sm:py-12"
    >
      <div className="container-prose">
        <h2
          id="seo-glance-heading"
          className="font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground"
        >
          TL;DR for humans &amp; bots
        </h2>
        <ul className="mt-5 grid list-none gap-4 p-0 sm:mt-6 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
          {quickAnswers.map(({ question, answer }) => (
            <li
              key={question}
              className="rounded-2xl border border-border bg-card/80 p-5"
            >
              <h3 className="text-sm font-semibold tracking-tight text-foreground">
                {question}
              </h3>
              <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">
                {answer}
              </p>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-center text-xs text-muted-foreground">
          Official site:{' '}
          <a href={siteConfig.url} className="underline underline-offset-2">
            {siteConfig.domain}
          </a>
          {' · '}
          <a href={siteConfig.github} className="underline underline-offset-2">
            GitHub
          </a>
          {' · '}
          <a href="/llms.txt" className="underline underline-offset-2">
            llms.txt
          </a>
        </p>
      </div>
    </section>
  );
}
