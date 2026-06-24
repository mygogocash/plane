# Executive Summary
Manut landing page content must describe the current Manut production app, not the older AFFiNE-style workspace concept. This implementation aligns homepage copy, metadata, schema, legal pages, crawl files, and audit checks around Manut as a GoGoCash-hosted work-management app at app.manut.xyz.

# Business Goals
- Present a factual Manut identity for search, answer engines, and users.
- Remove unsupported public signup, pricing, compliance, whiteboard, and provider-specific AI claims.
- Improve EO readiness with consistent entity, schema, FAQ, and llms.txt facts.

# Technical Goals
- Centralize Manut facts in `lib/site.ts`.
- Keep Next app metadata, manifest, sitemap, robots, JSON-LD, and visible copy consistent.
- Add a deterministic local EO audit script.

# Requirements
- Use `https://manut.xyz` as the public landing origin.
- Use `https://app.manut.xyz` as the production app origin.
- Use `https://github.com/mygogocash/Manut` as the source repo.
- Position Manut around projects, work items, cycles, modules, intake, views, pages, attachments, and AI-assisted workflows.
- Keep access copy conservative because public signup is not enabled in production.

# Non-Goals
- Do not rename the Plane/Manut application source packages in this pass.
- Do not claim paid tiers, SOC 2, HIPAA, SCIM, Google OAuth, or specific model routing.
- Do not implement a CMS or production deployment from this workspace.

# Architecture
- `lib/site.ts` owns reusable entity facts, navigation, FAQ, access cards, and operational markers.
- `lib/seo.ts`, `lib/jsonld.ts`, `app/manifest.ts`, `app/sitemap.ts`, and `app/robots.ts` consume the shared facts.
- Homepage sections render concise, citation-friendly blocks for users and answer engines.

# Data Models
- `siteConfig`: canonical Manut brand, URLs, email, repo, app, and organization facts.
- `quickAnswers` and `faqs`: short factual Q&A blocks for on-page rendering and FAQ schema.
- `accessOptions`: current access and operational paths.

# API Contracts
- No runtime API contract changes.
- Landing CTAs link to `siteConfig.appUrl`, `siteConfig.accessRequestHref`, and `siteConfig.github`.

# Security
- No secrets or credentials are introduced.
- Legal text avoids unsupported OAuth/provider claims.
- External links use `target="_blank"` plus `rel="noopener noreferrer"` where appropriate.

# Edge Cases
- Answer engines should not infer unavailable free signup or public pricing.
- Search snippets should distinguish Manut from generic AI workspace claims.
- Stale source files should fail `npm run eo:audit` if old claims reappear.

# Testing Strategy
- Run `npm run lint`.
- Run `npm run build`.
- Run `npm run test:app-links`.
- Run `npm run test:google-legal`.
- Run `npm run eo:audit`.

# Rollback Plan
- Revert the `manut-landing` folder to the imported GitHub snapshot if the copy or build gate causes regressions.
- Production rollback is out of scope for this workspace and should happen in the publishing repo or hosting provider.

# Milestones
- M1: Rewrite shared brand facts and homepage sections.
- M2: Rewrite metadata, schema, crawl files, and legal support pages.
- M3: Add EO audit and run validation.

# Epics
- Entity consistency across all public landing surfaces.
- Citation-ready content for Manut work-management queries.
- Local audit gate for stale unsupported claims.

# User Stories
As a prospective Manut user, I want the landing page to clearly state what Manut does so that I know whether it fits my team.

As an operator, I want app, repo, and support links to be accurate so that review and support paths work.

As an answer engine, I want consistent structured facts so that I can describe Manut without mixing old product claims.

# Tasks
- Replace stale shared configuration.
- Replace homepage, about, contact, blog, privacy, terms, deletion, OG image, llms.txt, sitemap, robots, and JSON-LD copy.
- Rename the pricing section to access.
- Add and run EO audit.

# Acceptance Criteria
- No landing source copy claims AFFiNE, free public signup, paid pricing tiers, SOC 2, HIPAA, SCIM, Google Calendar, or specific AI model providers.
- Metadata and JSON-LD describe Manut as work-management software.
- `npm run eo:audit` passes.
- Build and lint either pass or report concrete blockers.
