# Planning Context

Use this file after `process/context/all-context.md` when creating, resuming, or
auditing plans.

## Scope

This group covers where plans live, which active plan to resume, and how to keep
large phase programs navigable.

It does not contain feature implementation details; those belong in the active
plan or report for the relevant feature.

## Quick Routing

- Use `process/development-protocols/all-development-protocols.md` for shared workflow rules.
- Use `process/development-protocols/phase-programs.md` for multi-phase programs.
- Use `process/features/cloudflare-stack-migration/active/spec.md` as the umbrella spec for the current Cloudflare migration.
- Use `process/features/cloudflare-stack-migration/active/phase-*.md` for per-phase execution details.
- Use `process/features/cloudflare-stack-migration/reports/` for evidence and phase reports.
- Use `process/development-protocols/references/example-simple-prd.md` for small plans.
- Use `process/development-protocols/references/example-complex-prd.md` for complex plans.

## Current Feature Programs

| Feature                    | Active path                                           | Notes                                                       |
| -------------------------- | ----------------------------------------------------- | ----------------------------------------------------------- |
| Cloudflare stack migration | `process/features/cloudflare-stack-migration/active/` | Phase program for moving Manut to Cloudflare-native runtime |

## Planning Rules

- Prefer feature folders for multi-phase programs or areas with five or more artifacts.
- Keep phase evidence in `reports/`; do not turn chat-only claims into readiness gates.
- For production cutover phases, keep rollback and evidence requirements explicit.
- When a phase is blocked by external evidence, keep the plan active and record the blocker rather than marking the program complete.

## Update Triggers

Update this file when feature folders are created, phase-program ownership changes,
plans move between active/completed/backlog, or development protocols are reorganized.
