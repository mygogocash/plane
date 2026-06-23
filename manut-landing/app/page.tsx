/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Access } from "@/components/sections/access";
import { AiDemo } from "@/components/sections/ai-demo";
import { Cta } from "@/components/sections/cta";
import { Faq } from "@/components/sections/faq";
import { Features } from "@/components/sections/features";
import { Hero } from "@/components/sections/hero";
import { OpenSource } from "@/components/sections/open-source";
import { SeoGlance } from "@/components/sections/seo-glance";
import { SiteFooter } from "@/components/sections/site-footer";
import { Testimonials } from "@/components/sections/testimonials";
import { TrustBar } from "@/components/sections/trust-bar";
import { SiteNav } from "@/components/site-nav";
import { buildHomeMetadata } from "@/lib/seo";

export const metadata = buildHomeMetadata();

export default function Home() {
  return (
    <>
      <SiteNav />
      <main id="main" className="flex min-w-0 flex-col overflow-x-clip">
        <Hero />
        <SeoGlance />
        <TrustBar />
        <Features />
        <AiDemo />
        <OpenSource />
        <Access />
        <Testimonials />
        <Faq />
        <Cta />
      </main>
      <SiteFooter />
    </>
  );
}
