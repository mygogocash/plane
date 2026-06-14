# Self-Host Feature Parity — Development Plan

This directory breaks down the five plane.so feature families the fork must reach parity
on. Each feature has a **PRD** (the scope + gap source of truth, one level up in `docs/`)
and a four-part build breakdown here under `docs/plan/<feature>/`.

> **Live build status:** [`PROGRESS.md`](PROGRESS.md) is the single source of truth for what
> has shipped. As of the latest update: **Workflows & Approvals backend is feature-complete
> (WF-T1–T9), frontend store/service/types (WF-T10), CE enforcement components (WF-T11),
> settings workflow builder (WF-T12), and detail approval/suggestion surfaces (WF-T13) are done**.
> All dependency upgrades (Django 5.2, React 19,
> Zod 4, Headless UI 2) are landed. The other four feature families are not yet started.

> Source of truth for _what's already in the fork vs. missing_:
> [`../self-host-feature-parity-matrix-2026-06-06.md`](../self-host-feature-parity-matrix-2026-06-06.md)
> and the per-feature PRDs (`../prd-<feature>-2026-06-07.md`).

## How each feature is documented

| Doc          | Purpose                                                                                                                                                                                                                                                                                                                                 |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `epics.md`   | Epics covering **only** the partial/missing gaps. Each has user value, scope, technical requirements (citing fork files), security, dependencies, epic-level acceptance criteria, risk tier, entitlement flag.                                                                                                                          |
| `stories.md` | User stories grouped by epic. Each is `As a <role>, I want … so that …` with 2–5 Given/When/Then acceptance criteria (incl. an authorization-failure and an edge case), size, priority, dependencies.                                                                                                                                   |
| `design.md`  | **plane.so alignment** in annotated-screenshot style: each reference screen → delta table (UI element / plane.so behavior / fork status / required change) → implementation mapping (routes, components, MobX stores, services, entitlement wiring, empty/loading/error/a11y states).                                                   |
| `tasks.md`   | **Self-contained Claude Code subagent task cards.** Each card is independently runnable by a cold subagent: context, exact files, the failing test to write first (TDD), implementation outline, Given/When/Then acceptance criteria, exact verify commands, and a Done-when. Ends with a dependency graph + parallel worktree batches. |

## Features

| Feature               | PRD                                             | Epics                                 | Stories                                   | Design                                  | Tasks                                 | Overall gap                                                                       |
| --------------------- | ----------------------------------------------- | ------------------------------------- | ----------------------------------------- | --------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------- |
| Workflows & Approvals | [PRD](../prd-workflows-approvals-2026-06-07.md) | [epics](workflows-approvals/epics.md) | [stories](workflows-approvals/stories.md) | [design](workflows-approvals/design.md) | [tasks](workflows-approvals/tasks.md) | 🟢 Done (WF-T1–T13: backend + frontend store/enforcement/builder/detail surfaces) |
| Epics & Initiatives   | [PRD](../prd-epics-initiatives-2026-06-07.md)   | [epics](epics-initiatives/epics.md)   | [stories](epics-initiatives/stories.md)   | [design](epics-initiatives/design.md)   | [tasks](epics-initiatives/tasks.md)   | 🟡 Partial (epics via IssueType; initiatives missing)                             |
| Work Items & Types    | [PRD](../prd-work-items-2026-06-07.md)          | [epics](work-items/epics.md)          | [stories](work-items/stories.md)          | [design](work-items/design.md)          | [tasks](work-items/tasks.md)          | 🟢 Mostly present (types/props/templates/recurring)                               |
| Wiki & Pages          | [PRD](../prd-wiki-2026-06-07.md)                | [epics](wiki/epics.md)                | [stories](wiki/stories.md)                | [design](wiki/design.md)                | [tasks](wiki/tasks.md)                | 🟡 Partial (templates, comments, export, content search, AI)                      |
| Plane AI              | [PRD](../prd-ai-2026-06-07.md)                  | [epics](ai/epics.md)                  | [stories](ai/stories.md)                  | [design](ai/design.md)                  | [tasks](ai/tasks.md)                  | 🟡 Partial (Build mode, connectors, semantic actions)                             |

ID prefixes: `WF` (workflows/approvals), `INIT`/`EPIC` (epics & initiatives), `WIT` (work items/types),
`WIKI`, `AI`.

## Recommended build order (dependency-aware)

1. **Work Item Types / custom properties** — foundation that epics and several AI features lean on.
2. **Workflows & Approvals** — highest-value missing feature; single issue-update enforcement seam.
3. **Initiatives** — independent new model; unblocks org-scale hierarchy.
4. **Wiki gaps** — templates → comments → export → content search.
5. **Plane AI expansion** — Build mode + connectors; benefits from the above being real so AI has things to act on.

## Assigning tasks to Claude Code subagents

Each card in a `tasks.md` is written to be handed to one subagent (via the Agent or
Workflow tool) with no prior context. Conventions for all tasks:

- **TDD-first** — write the named failing test, watch it fail, then implement.
- **Worktree isolation** — cards marked `Worktree isolation: yes` edit hot shared files
  (e.g. `issue/base.py`, `root.store.ts`, `@plane/types`); run those under separate git
  worktrees or serialize them. Cards marked `no` are safe to parallelize freely.
- **Order** — backend models/migrations → APIs → frontend, per the dependency graph at the
  end of each `tasks.md`.
- **Gating** — every user-facing surface stays behind an `isSelfHostedFeatureEnabled(...)`
  flag in `apps/web/ce/lib/self-host-entitlements.ts`; backends fail closed (400) when the
  provider/config is missing.
- **Migrations** — additive only, with forward + rollback notes; never edit applied migrations.

## Before development — open decisions

A small set of product/architecture decisions sit above the task level and should be
ratified by the product owner before building (they change data models and UX). See the
"Open decisions" section in the chat handoff, or the inline `Q#` markers in `ai/tasks.md`
and `ai/epics.md`. Defaults are proposed for each; building proceeds on the defaults unless
overridden.
