# Executive Summary

Enable self-host entitlement behavior for this Plane CE deployment so the GoGoCash workspace no longer sees paid-plan upsells for features available in this codebase.

# Current Rollout Evidence

- Entitlement and CI/CD changes are included in verified feature rollout commit
  `0b80aadd9610d2446f835d06c872c4283b6ddd83`.
- Verified feature rollout image tag: `preview-0b80aadd9610`.
- The current workflow name is `Manut CI/CD`; this evidence was captured before
  the rename, when `Plane CI/CD` run `27065884344` and CodeQL run
  `27065883913` both completed successfully.
- Live smoke: `GET https://app.manut.xyz/api/instances/` returns `200`.
- GKE workloads API, worker, beat-worker, web, admin, live, and space are ready
  on the same tag.

# Business Goals

- Let self-hosted users work without Plane SaaS upgrade prompts.
- Keep the deployment aligned with the customer-owned GCP runtime.
- Avoid claiming EE-only implementations exist when they are not present in the CE source tree.

# Technical Goals

- Centralize self-host entitlement state in a small CE helper.
- Remove paid-plan modal and pricing CTAs from CE-gated surfaces.
- Enable CE-available feature switches that were disabled only for SaaS plan gating.

# Requirements

- The paid-plan modal must not render when a self-host user clicks gated UI.
- Workspace billing must show self-host status instead of paid-plan comparison cards.
- Sidebar upgrade badges, active-cycle upgrade CTAs, bulk-operation upsell banners, and issue-embed upgrade cards must be hidden.
- Time estimates must be selectable where the CE code already supports the estimate workflow.

# Non-Goals

- Reconstruct missing EE-only product implementations not present in this repository.
- Add Stripe, Plane SaaS license, or external entitlement calls.
- Change GCP infrastructure outside the CI/CD image rollout needed for this patch.

# Architecture

- `apps/web/ce/lib/self-host-entitlements.ts` exposes the deployment entitlement flag and display copy.
- CE UI gates import that helper and either suppress upsell components or render self-host status.
- Estimate availability uses the existing constants/helpers path so the shared create-estimate UI can show supported systems.

# Data Models

- `EstimateType` includes `time` so backend validation recognizes time estimates.
- No database columns or destructive schema changes are introduced.

# API Contracts

- Existing estimate create/update payloads remain unchanged.
- The accepted estimate `type` choices now include `time`.

# Security

- No secrets are added or printed.
- No authentication or authorization bypass is introduced.
- The patch affects local feature presentation and accepted estimate type values only.

# Edge Cases

- Missing EE-only implementations remain unavailable even when upsell banners are hidden.
- If self-host entitlement is disabled later, the current code paths still support showing the original paid CTAs.
- Bulk operation controls may require separate implementation if action-panel code is absent in CE.

# Testing Strategy

- Unit test the self-host entitlement constant.
- Run targeted formatter/linter checks on changed frontend files.
- Let the `preview` branch CI/CD build component images to Artifact Registry.
- Verify the GitHub Actions GKE rollout status and live HTTPS responses.

# Rollback Plan

- Revert the entitlement commit.
- Re-run the GCP deploy workflow from the previous known-good commit or set GKE
  deployments back to the prior `preview-<short_sha>` Artifact Registry tags.

# Milestones

- Milestone 1: Remove visible paid-plan gates from CE UI.
- Milestone 2: Enable supported CE feature switches.
- Milestone 3: Build, deploy, and verify on GKE.

# Epics

- Self-host entitlement UI: suppress SaaS pricing prompts and show self-host status.
- Estimate feature enablement: allow time estimate selection where supported.
- Production rollout: push to `preview`, publish Artifact Registry images, run
  migrations, and update GKE deployments through GitHub Actions.

# User Stories

- As a self-hosted workspace user, I want paid-plan modals hidden so that I can use the instance without SaaS upgrade prompts.
- As an admin, I want billing to show self-host status so that plan state is clear.
- As a project user, I want supported estimate options available so that planning workflows are not artificially gated.

# Tasks

- Add a self-host entitlement helper.
- Suppress the paid-plan modal, upgrade badges, active-cycle CTA, issue-embed card, and bulk-operation banner.
- Replace billing comparison with self-host status.
- Enable time estimates in frontend constants and backend choices.
- Validate, commit, build, deploy, and verify.

# Acceptance Criteria

- Clicking gated UI no longer opens the paid-plan modal.
- Billing no longer shows Plane Pro/Business/Enterprise comparison cards while self-host entitlement is enabled.
- Existing CE-supported feature paths do not show Plane SaaS upgrade CTAs.
- The GCP CI/CD rollout finishes successfully and the live domain responds over
  HTTPS.
