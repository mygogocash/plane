import { Reveal } from '@/components/reveal';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { faqs, siteConfig } from '@/lib/site';

export function Faq() {
  return (
    <section
      id="faq"
      aria-labelledby="faq-heading"
      className="section-pad relative border-y border-border"
    >
      <div className="container-prose grid gap-12 md:grid-cols-[1fr_2fr] md:gap-20">
        <Reveal>
          <p className="kicker kicker-line">FAQ</p>
          <h2
            id="faq-heading"
            className="mt-4 text-balance text-[clamp(1.875rem,3.4vw,3rem)] font-semibold leading-[1.08] tracking-[-0.025em]"
          >
            FAQ — no fluff, just facts.
          </h2>
          <p className="mt-5 text-pretty text-base text-muted-foreground sm:text-lg">
            Straight answers for search, AI assistants, and your team lead who
            asks hard questions.
          </p>
          <p className="mt-6 font-mono text-xs text-muted-foreground">
            Need more?{' '}
            <a
              href={`mailto:${siteConfig.email}`}
              className="underline underline-offset-4 hover:text-foreground"
            >
              {siteConfig.email}
            </a>
          </p>
        </Reveal>

        <Reveal delay={120}>
          <Accordion className="w-full" defaultValue={['item-0']}>
            {faqs.map((f, i) => (
              <AccordionItem
                key={f.question}
                value={`item-${i}`}
                className="border-b border-border data-[state=open]:bg-muted/20"
              >
                <AccordionTrigger className="py-5 text-left text-[16px] font-medium tracking-tight">
                  {f.question}
                </AccordionTrigger>
                <AccordionContent className="text-[15px] leading-relaxed text-muted-foreground">
                  {f.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </div>
    </section>
  );
}
