# Executive Summary

Make Plane CE mobile responsive across the web app, admin app, and shared UI
surfaces without changing backend contracts. The first implementation path is a
responsive foundation plus shell-level parity: viewport-aware hooks, mobile-safe
navigation, app/admin shell overflow guards, and reproducible responsive smoke
tests.

# Current Deployment Note

- The production GCP deploy path now runs through `Manut CI/CD`. The rollout
  evidence below was captured before the workflow rename, when the same
  workflow was labeled `Plane CI/CD` run `27065884344`.
- Verified feature rollout tag: `preview-0b80aadd9610`.
- Live HTTPS smoke: `GET https://app.manut.xyz/api/instances/` returns `200`.
- Responsiveness work still should avoid Kubernetes, Cloudflare, and GCP runtime
  changes unless a separate deployment task explicitly requires them.

The previous GKE deployment spec was preserved at
`docs/gke-plane-ce-spec-2026-06-05.md`.

# Business Goals

- Allow GoGoCash and Manut users to navigate Plane from phones and tablets.
- Keep the existing desktop product experience intact.
- Add a repeatable responsive QA gate before further visual/product changes.
- Keep the preview branch deployable and rollback-friendly.

# Technical Goals

- Base responsive behavior on viewport measurements, not user-agent checks.
- Prevent page-level horizontal overflow at common mobile, tablet, laptop, and
  desktop sizes.
- Convert fixed shell surfaces into mobile-safe overlays, drawers, or collapsed
  controls where needed.
- Keep dense work-management views reachable on mobile even when content needs
  local horizontal scrolling.
- Add a committed responsive smoke harness for local and CI use.

# Requirements

- Validate at `360x740`, `390x844`, `430x932`, `768x1024`, `1024x768`, and
  `1440x900`.
- Shared hooks must expose stable breakpoint helpers and SSR-safe viewport
  state.
- Main web shell must keep sidebar, app rail, top navigation, and extended
  sidebar usable under `768px`.
- Admin shell must keep sidebar, header breadcrumbs, page wrappers, and forms
  usable under `768px`.
- Global dialogs and modal panels must fit mobile viewports and remain
  scrollable.
- New tests must fail on document-level horizontal overflow and relevant console
  errors.

# Non-Goals

- No backend API changes.
- No database schema changes.
- No Kubernetes, Cloudflare, or GCP runtime changes for responsiveness.
- No visual redesign beyond responsive layout and touch ergonomics.
- No forced replacement of existing dense desktop views when contained
  horizontal scrolling is the only practical mobile contract.

# Architecture

- `packages/hooks` owns viewport primitives shared across apps.
- `apps/web/core` and `apps/admin` consume viewport primitives for shell state
  and mobile behavior.
- CSS remains the first line of defense: responsive utilities, safe min-widths,
  `min-w-0`, contained scroll regions, and mobile padding rules.
- JavaScript behavior is reserved for stateful shell changes such as sidebar
  auto-collapse and drawer close behavior.
- Playwright responsive smoke tests run against supplied local or preview URLs.

# Data Models

- No application data model changes.
- Local storage keys used for shell preferences remain compatible. New mobile
  behavior must not overwrite desktop width/display preferences.

# API Contracts

- Existing routes and API calls remain unchanged.
- The responsive smoke harness accepts:
  - `RESPONSIVE_WEB_URL`, default `http://127.0.0.1:3000`
  - `RESPONSIVE_ADMIN_URL`, default `http://127.0.0.1:3001`
  - `RESPONSIVE_AUTH_URLS`, optional comma-separated authenticated route list
- Tests should tolerate expected unauthenticated `401` API calls but fail on
  framework/runtime errors.

# Security

- Do not print or commit secrets, cookies, tokens, upload URLs, or environment
  values.
- Authenticated responsive QA must use an already-approved local or browser
  session.
- Mobile changes must not bypass permission checks or expose hidden admin
  actions.
- New scripts must not scrape or persist private user data.

# Edge Cases

- The app can be served under custom base paths.
- A running local port may belong to another project; verify page identity before
  using browser evidence.
- Mobile devices can report desktop-like user agents; viewport width is the
  source of truth for layout.
- Dense tables, kanban boards, calendars, gantt views, and spreadsheet views may
  need contained horizontal scroll rather than collapsed cards.
- Virtualized lists and drag/drop regions can mis-measure when parent panes use
  `overflow-hidden`.
- Modals with fixed widths can clip actions on short mobile screens.
- Breadcrumbs and command controls can overflow before content panes do.

# Testing Strategy

- RED: create responsive smoke tests that expose existing horizontal overflow,
  clipped shell controls, or console errors.
- GREEN: implement the smallest shell/foundation fixes needed for the smoke
  matrix to pass on unauthenticated and shell-level routes.
- REFACTOR: consolidate helpers and remove duplicated viewport checks.
- Run:
  - `pnpm --filter=@plane/hooks test`
  - `pnpm test:responsive`
  - `pnpm check:types`
  - `pnpm check:lint`
  - `pnpm check:format`
  - `pnpm build`

# Rollback Plan

- Revert the responsive commit on the `preview` branch.
- If a deployment is already live, redeploy the previous preview image or roll
  back the hosting platform to the previous commit.
- Remove only the new responsive test scripts if Playwright dependency issues
  block emergency rollback; do not change app runtime behavior during rollback
  triage.

# Milestones

## Milestone 1 - Audit And Spec

- Objective: define scope, preserved deployment context, route inventory, and
  acceptance criteria.
- Business impact: prevents mixing deployment planning with mobile UI work.
- Technical scope: docs only.
- Dependencies: existing `spec.md`.
- Risks: stale deployment details.
- Success metrics: responsive `spec.md` exists and previous GKE spec is
  preserved.
- Rollback strategy: restore previous `spec.md`.

## Milestone 2 - Responsive Test Harness

- Objective: add reproducible responsive smoke tests.
- Business impact: catches mobile regressions before deploy.
- Technical scope: Playwright config, scripts, viewport matrix.
- Dependencies: runnable local or preview URLs.
- Risks: unauthenticated pages may not cover all app shells.
- Success metrics: tests fail on real overflow and pass after shell fixes.
- Rollback strategy: remove test harness and dependency.

## Milestone 3 - Shared Viewport Foundation

- Objective: introduce SSR-safe viewport helpers.
- Business impact: consistent mobile behavior across apps.
- Technical scope: `packages/hooks`.
- Dependencies: React hooks package build.
- Risks: hydration mismatch if defaults are unstable.
- Success metrics: hook unit tests pass and apps typecheck.
- Rollback strategy: remove hook and revert consumers.

## Milestone 4 - Web Shell Parity

- Objective: make main Plane shell navigable on mobile.
- Business impact: users can enter core work-management routes on phones.
- Technical scope: top nav, app rail, sidebars, content wrapper, modals.
- Dependencies: viewport foundation.
- Risks: desktop preference regression.
- Success metrics: no document-level overflow at required viewports.
- Rollback strategy: revert shell edits only.

## Milestone 5 - Admin/Auth Parity

- Objective: make admin and unauthenticated surfaces usable on mobile.
- Business impact: operators can configure Plane from tablets/phones.
- Technical scope: admin sidebar/header/page wrapper and auth layout.
- Dependencies: viewport foundation.
- Risks: hidden admin controls on small screens.
- Success metrics: admin responsive smoke passes.
- Rollback strategy: revert admin/auth edits only.

## Milestone 6 - Product Surface Expansion

- Objective: extend full mobile parity through every authenticated product
  surface.
- Business impact: complete mobile usage for project management workflows.
- Technical scope: work items, issue detail, cycles, modules, views, pages,
  analytics, notifications, settings, and dense views.
- Dependencies: authenticated QA session.
- Risks: large blast radius across virtualized and drag/drop views.
- Success metrics: route-by-route QA matrix passes.
- Rollback strategy: split changes by surface and revert failing surface.

# Epics

## Epic 1 - Responsive Foundation

- User value: every surface can make consistent mobile decisions.
- Technical requirements: shared hook, breakpoint helpers, tests.
- Security considerations: no persisted private state.
- Edge cases: SSR, hydration, resize events, tablet widths.
- Data flow: browser viewport to React state.
- API contracts: none.
- Testing strategy: unit tests plus typecheck.

## Epic 2 - App Shell

- User value: workspace navigation stays reachable on phone and tablet.
- Technical requirements: mobile sidebar overlay, app rail collapse, top nav
  wrapping, contained scrolling.
- Security considerations: preserve auth and permission checks.
- Edge cases: nested sidebars, command palette, project switcher, touch targets.
- Data flow: viewport state and existing MobX shell preferences.
- API contracts: none.
- Testing strategy: responsive Playwright smoke.

## Epic 3 - Product Surfaces

- User value: core work-management flows remain usable on mobile.
- Technical requirements: mobile headers, drawer filters, contained dense views,
  modal actions.
- Security considerations: no hidden destructive action exposure.
- Edge cases: drag/drop, virtualization, inline editors, upload modals.
- Data flow: existing stores and services.
- API contracts: unchanged.
- Testing strategy: route matrix and interaction smoke.

## Epic 4 - Admin And Auth

- User value: admins and unauthenticated users can complete setup and access
  flows on mobile.
- Technical requirements: mobile admin sidebar, wrapping breadcrumbs, forms,
  dialogs, auth layout.
- Security considerations: admin-only pages remain guarded.
- Edge cases: long provider forms, secret fields, test-email modal.
- Data flow: existing admin stores.
- API contracts: unchanged.
- Testing strategy: admin responsive Playwright smoke.

# User Stories

- As a workspace member, I want to open project navigation on my phone so I can
  move between projects and work items.
- As a project member, I want work-item list and detail routes to be readable on
  mobile so I can triage issues away from desktop.
- As an admin, I want settings pages and provider forms to fit mobile screens so
  I can inspect configuration quickly.
- As an operator, I want responsive tests in CI so mobile regressions are caught
  before deploy.

# Tasks

## Task 1 - Preserve Deployment Spec

- Objective: keep prior GKE spec available.
- Scope: docs.
- Files: `docs/gke-plane-ce-spec-2026-06-05.md`, `spec.md`.
- Dependencies: existing deployment spec.
- Risk Tier: R2.
- Acceptance Criteria: old spec preserved and root spec describes responsive
  work.
- Tests: docs review.
- Rollback: restore old spec.
- Assigned Model: GPT-5.5 xhigh.
- Assigned Agent: primary.

## Task 2 - Add Responsive Tests

- Objective: create failing responsive smoke gate.
- Scope: root scripts and `tests/responsive`.
- Files: `package.json`, `playwright.responsive.config.ts`,
  `tests/responsive/responsive-smoke.spec.ts`.
- Dependencies: Playwright.
- Risk Tier: R2.
- Acceptance Criteria: test matrix can run against web/admin URLs.
- Tests: `pnpm test:responsive`.
- Rollback: remove test files and dependency.
- Assigned Model: GPT-5.3-Codex-Spark.
- Assigned Agent: implementation.

## Task 3 - Add Viewport Hook

- Objective: centralize viewport breakpoint logic.
- Scope: `packages/hooks`.
- Files: `packages/hooks/src/use-viewport.tsx`,
  `packages/hooks/src/use-viewport.test.ts`.
- Dependencies: React.
- Risk Tier: R2.
- Acceptance Criteria: hook exports typed helpers and unit tests pass.
- Tests: `pnpm --filter=@plane/hooks test`.
- Rollback: remove hook and tests.
- Assigned Model: GPT-5.3-Codex-Spark.
- Assigned Agent: implementation.

## Task 4 - Harden Web Shell

- Objective: mobile-safe web shell.
- Scope: `apps/web`.
- Files: content wrapper, app rail, resizable sidebar, top nav, modal CSS.
- Dependencies: Task 3.
- Risk Tier: R2.
- Acceptance Criteria: no document-level overflow at required viewports.
- Tests: `pnpm test:responsive`.
- Rollback: revert shell files.
- Assigned Model: GPT-5.3-Codex-Spark.
- Assigned Agent: implementation.

## Task 5 - Harden Admin Shell

- Objective: mobile-safe admin shell.
- Scope: `apps/admin`.
- Files: dashboard layout, sidebar, header, page wrapper.
- Dependencies: Task 3.
- Risk Tier: R2.
- Acceptance Criteria: admin responsive smoke passes at required viewports.
- Tests: `pnpm test:responsive`.
- Rollback: revert admin files.
- Assigned Model: GPT-5.3-Codex-Spark.
- Assigned Agent: implementation.

# Acceptance Criteria

- Previous deployment spec is preserved.
- Root `spec.md` describes responsive work.
- Responsive Playwright harness is committed.
- Viewport helpers are typed, exported, and unit-tested.
- Web/admin shell changes reduce mobile overflow without desktop regressions.
- Required checks are run or any blockers are reported explicitly.
