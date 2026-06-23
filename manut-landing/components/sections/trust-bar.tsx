/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { trustLogos } from "@/lib/site";

export function TrustBar() {
  return (
    <section aria-labelledby="trust-heading" className="border-border relative border-y py-12">
      <div className="container-prose">
        <h2 id="trust-heading" className="kicker kicker-line text-center">
          Operational markers for Manut
        </h2>
        <ul className="mt-7 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 sm:gap-x-14">
          {trustLogos.map((name) => (
            <li
              key={name}
              className="text-base text-muted-foreground/70 hover:text-foreground font-semibold tracking-tight transition-colors"
            >
              {name}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
