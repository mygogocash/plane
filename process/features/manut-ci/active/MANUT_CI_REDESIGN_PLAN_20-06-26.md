# Executive Summary

Rebrand the visible Plane fork surfaces to Manut across app metadata, favicons, loading states,
docs, GitHub Actions labels, image names, and Kubernetes runtime identifiers. Internal engineering
namespaces such as `@plane/*` and `plane.*` stay unchanged in this pass.

# Business Goals

- Present Manut as the product identity at `app.manut.xyz`.
- Remove user-visible Plane CI and loading artifacts from the fork experience.
- Prepare a reversible cutover from the existing `plane-ce` / `plane-app` runtime to
  `manut-ce` / `manut-app`.

# Technical Goals

- Centralize Manut brand constants for app roots and metadata.
- Replace root app icons and manifests with Manut-derived assets from `https://manut.xyz`.
- Replace Plane GIF loading with a Manut mark loader that has reduced-motion behavior.
- Rename CI/CD build artifacts from `plane-*` to `manut-*`.
- Track Kubernetes manifests and Helm values for `manut-ce` / `manut-app`.

# Requirements

- Use the live Manut identity: warm off-white `#fafaf2`, near-black `#0e0e10`, pale cyan accents,
  and the square Manut mark.
- Preserve upstream copyright and license text.
- Keep physical GCP data resources unchanged unless a later data-migration plan approves them.
- Do not rename source package scopes or Python module imports.

# Non-Goals

- No production deployment in this implementation pass.
- No database, bucket, or Artifact Registry migration.
- No source package/module rename from Plane to Manut.
- No destructive cleanup of the current `plane-ce` / `plane-app` release.

# Architecture

- Brand constants live in `packages/constants/src/metadata.ts`.
- Web, Admin, and Space app roots consume those constants for titles, descriptions, URLs, theme
  colors, and social metadata.
- Each app keeps its local loader component but renders the same Manut mark animation.
- GitHub Actions continues to build the same components, but image names become `manut-*`.
- Tracked Kubernetes manifests target the new namespace and release-derived service names.

# Data Models

No application data models change. Kubernetes names and container image names are operational
contracts only.

# API Contracts

No API route or schema changes. Public app URLs remain `https://app.manut.xyz`, including
`/api/instances/`.

# Security

- R1 infra rename: cutover requires secret cloning and RBAC validation before live traffic moves.
- GitHub Actions deployer RBAC is renamed to `github-actions-manut-deployer`.
- Secrets must be cloned into `manut-*` names, not copied into repository files.

# Edge Cases

- Existing cached PWA manifests may retain Plane icons until browser cache refresh.
- Kubernetes namespace cutover can expose missing secret/config names if the Helm values are not
  applied consistently.
- Reduced-motion users should see a static Manut mark without pulse/beam animation.
- Old `plane-*` images and runtime resources remain rollback targets until smoke passes.

# Testing Strategy

- Static: `pnpm check`, targeted TypeScript/lint where practical, and `actionlint` for workflows.
- Visual: Playwright screenshots for shell, auth/loading, admin loading, public space, manifests,
  favicon links, light/dark, and reduced motion.
- CI/deploy: dispatch `Manut CI/CD`, verify GAR receives `manut-*` images, then verify
  `helm status manut-app -n manut-ce` and `kubectl get deploy,svc,ingress,certificate -n manut-ce`.
- Smoke: `curl https://app.manut.xyz/api/instances/`, authenticated workspace/project smoke,
  non-critical work item CRUD, upload/logo check, and loading-state scan.

# Rollback Plan

- Keep `plane-ce` / `plane-app` running until public and authenticated smoke pass.
- If cutover fails, point ingress back to `plane-app-*` services.
- Redeploy previous `plane-*` image tags if needed.
- Capture evidence, then remove failed `manut-ce` resources only after rollback is verified.

# Milestones

## Milestone 1 - Brand And CI PR

- Objective: update app metadata, assets, loaders, docs, workflow labels, and image names.
- Business impact: removes visible Plane identity from the fork and CI surfaces.
- Technical scope: TypeScript roots, assets, manifests, GitHub Actions, tracked docs.
- Dependencies: live Manut assets from `https://manut.xyz`.
- Risks: stale manifest caches, missed hardcoded Plane strings.
- Success metrics: static checks pass, workflow YAML validates, visible loading assets are Manut.
- Rollback: revert the PR without touching production runtime resources.

## Milestone 2 - Runtime Cutover

- Objective: deploy `manut-app` into `manut-ce` and cut `app.manut.xyz` traffic over.
- Business impact: production runtime names match Manut.
- Technical scope: Helm values, namespace, RBAC, secrets, GAR images, ingress services.
- Dependencies: secret cloning, IAM binding, built `manut-*` images.
- Risks: missing secrets/configs, mismatched service names, incomplete smoke coverage.
- Success metrics: `helm status manut-app -n manut-ce`, Kubernetes resources healthy, public and
  authenticated smoke pass.
- Rollback: switch ingress back to `plane-app-*` and keep old release untouched.

## Milestone 3 - Cleanup

- Objective: archive old Plane ops docs and plan old image/resource removal after stable deploy.
- Business impact: current docs and handoff surfaces stay aligned with production.
- Technical scope: docs archive/update, GAR retention plan, old namespace cleanup schedule.
- Dependencies: stable `manut-app` release evidence.
- Risks: removing rollback resources too early.
- Success metrics: docs name Manut as current state and old Plane resources are clearly historical.
- Rollback: keep cleanup docs in backlog and retain old resources.

# Epics

## Epic 1 - Brand System

- User value: users see one coherent Manut product identity.
- Technical requirements: constants, metadata, icons, PWA manifests, loader components.
- Security considerations: no secret or auth flow changes.
- Edge cases: reduced motion, browser cache, dark/light rendering.
- Data flow: constants -> app roots -> metadata/links; local assets -> app bundles.
- API contracts: none.
- Testing strategy: static checks plus visual snapshots.

## Epic 2 - CI And Runtime Naming

- User value: operators dispatch and inspect Manut CI/CD rather than Plane CI/CD.
- Technical requirements: workflow labels, image names, migrator job, deployment/container names.
- Security considerations: renamed service account and least-privilege RBAC.
- Edge cases: old namespace rollback, missing new secrets.
- Data flow: GitHub Actions -> GAR `manut-*` images -> `manut-app-*` workloads.
- API contracts: `https://app.manut.xyz/api/instances/` remains the public smoke endpoint.
- Testing strategy: `actionlint`, workflow dispatch, GAR and kubectl verification.

## Epic 3 - Operational Documentation

- User value: handoff docs describe the current Manut path with clear rollback.
- Technical requirements: README, CI/CD spec, ops handover, K8s manifests.
- Security considerations: document secret cloning without storing secret values.
- Edge cases: historical docs still mention Plane as old evidence.
- Data flow: docs -> operator runbooks -> manual cutover.
- API contracts: none.
- Testing strategy: command snippets reviewed and manifest names checked.

# User Stories

## Story 1

As a Manut user, I want app titles, icons, and loading screens to say Manut so that the product feels
consistent and trustworthy.

Acceptance criteria:

- Web, Admin, and Space roots use Manut titles/descriptions.
- Loader states render the Manut mark.
- Reduced-motion users do not get pulse/beam animation.
- Favicon and manifest links point at Manut assets.

## Story 2

As an operator, I want CI/CD and deployment resources named Manut so that runtime evidence matches
the business identity.

Acceptance criteria:

- Workflow name is `Manut CI/CD`.
- GAR image names are `manut-*`.
- Migration jobs, deployments, services, containers, namespace, and RBAC use `manut-*` names.
- Rollback to `plane-app` is documented.

# Tasks

## Task 1 - Brand Constants And Metadata

- Objective: centralize Manut metadata.
- Scope: `packages/constants/src/metadata.ts`, app root metadata.
- Files: web/admin/space roots, manifests.
- Dependencies: live Manut site metadata.
- Risk Tier: R2.
- Acceptance Criteria: no visible Plane metadata in app roots.
- Tests: TypeScript/static checks.
- Rollback: revert metadata patch.
- Assigned Model: GPT-5.5 xhigh.
- Assigned Agent: Orchestrator.

## Task 2 - Assets And Loader

- Objective: replace Plane loading and PWA assets.
- Scope: app asset folders and loader components.
- Files: app favicon/icon folders and `logo-spinner.tsx` components.
- Dependencies: live Manut mark asset.
- Risk Tier: R2.
- Acceptance Criteria: hydration/loading states show Manut mark with reduced-motion fallback.
- Tests: visual checks and static checks.
- Rollback: revert asset and component patch.
- Assigned Model: GPT-5.5 xhigh.
- Assigned Agent: Orchestrator.

## Task 3 - CI And Kubernetes Naming

- Objective: rename CI/deploy surfaces to Manut.
- Scope: workflows, K8s manifests, Helm values.
- Files: `.github/workflows/*.yml`, `k8s/*`.
- Dependencies: secret cloning before runtime cutover.
- Risk Tier: R1.
- Acceptance Criteria: tracked runtime names use `manut-ce` / `manut-app`; rollback remains documented.
- Tests: `actionlint`, dry review of manifest names.
- Rollback: keep old release and switch ingress back.
- Assigned Model: GPT-5.5 xhigh.
- Assigned Agent: Orchestrator.

## Task 4 - Docs

- Objective: update current handoff docs and keep historical evidence intact.
- Scope: README, CI/CD spec, ops handoff.
- Files: `README.md`, `docs/cicd-spec-2026-06-06.md`, ops docs.
- Dependencies: final changed names.
- Risk Tier: R2.
- Acceptance Criteria: current docs describe Manut CI and runtime identifiers; historical Plane references are marked historical.
- Tests: `rg` for current-surface Plane references.
- Rollback: revert docs patch.
- Assigned Model: GPT-5.5 xhigh.
- Assigned Agent: Orchestrator.

# Acceptance Criteria

- Manut brand constants exist and are consumed by web/admin/space app roots.
- Favicon, apple touch icon, OG image, and PWA manifest surfaces use Manut identity.
- Web/admin/space loaders no longer import Plane spinner GIFs.
- `Plane CI/CD` is renamed to `Manut CI/CD`.
- Build image names are `manut-frontend`, `manut-backend`, `manut-admin`, `manut-space`,
  `manut-live`, and `manut-proxy`.
- Runtime manifests use namespace `manut-ce`, release/service prefix `manut-app`, and RBAC
  `github-actions-manut-deployer`.
- Docs explain rollback through the old `plane-app` release.
- Static and workflow validation results are recorded before handoff.

# Touchpoints

- `packages/constants/src/metadata.ts`
- `apps/web/app/root.tsx`
- `apps/web/app/layout.tsx`
- `apps/admin/app/root.tsx`
- `apps/space/app/root.tsx`
- `apps/*/components/**/logo-spinner.tsx`
- `.github/workflows/ci-cd.yml`
- `.github/workflows/build-branch.yml`
- `k8s/`
- `README.md`
- `docs/`

# Public Contracts

- `https://app.manut.xyz`
- `https://app.manut.xyz/api/instances/`
- GitHub Actions workflow `Manut CI/CD`
- GAR image names `manut-*`
- Kubernetes namespace/release `manut-ce` / `manut-app`

# Blast Radius

- Runtime UI and metadata for web/admin/space.
- CI build and deployment image references.
- Kubernetes cutover manifests and operator docs.
- No auth, database schema, or source package/module rename.

# Verification Evidence

- To be filled during implementation with static check, workflow validation, and smoke results.

# Resume and Execution Handoff

- Selected plan path:
  `process/features/manut-ci/active/MANUT_CI_REDESIGN_PLAN_20-06-26.md`.
- Execute Milestone 1 first.
- Do not deploy or mutate production without explicit operator approval.
- Keep Milestone 2 as a documented cutover until secrets/RBAC/images are verified.
