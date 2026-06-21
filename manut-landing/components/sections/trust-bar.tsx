import { trustLogos } from '@/lib/site';

export function TrustBar() {
  return (
    <section
      aria-labelledby="trust-heading"
      className="relative border-y border-border py-12"
    >
      <div className="container-prose">
        <h2 id="trust-heading" className="kicker kicker-line text-center">
          Operational markers for Manut
        </h2>
        <ul className="mt-7 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 sm:gap-x-14">
          {trustLogos.map(name => (
            <li
              key={name}
              className="text-base font-semibold tracking-tight text-muted-foreground/70 transition-colors hover:text-foreground"
            >
              {name}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
