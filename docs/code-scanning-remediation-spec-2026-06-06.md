# Executive Summary

Fix all currently open GitHub code-scanning alerts for `mygogocash/plane` on the
`preview` branch. The remediation scope is limited to the 36 open alerts
reported on June 6, 2026: HTML/URL sanitization, XSS through DOM handling,
insecure randomness in sortable drag metadata, API-token log tokenization, and
missing GitHub Actions workflow permissions.

# Current Validation Evidence

- GitHub currently reports `0` open code-scanning alerts.
- Code Quality runs `27503183507` and `27503183488` completed successfully on
  deployed commit `254013b7228bd39b7ac1645052fbbb48fb62f0c5`.
- `Plane CI/CD` run `27503184003` completed successfully and verified
  `preview-254013b7228b` through production smoke.
- Original remediation baseline: CodeQL run `27065883913`, `Plane CI/CD` run
  `27065884344`, and commit `0b80aadd9610d2446f835d06c872c4283b6ddd83`.
- The active CI/CD workflow has no Railway deploy hook, Railway AIO build, GHCR
  production registry, or broad package publish permission.

# Business Goals

- Reduce exploitable security findings before the next Plane preview rollout.
- Keep GoGoCash self-host functionality unchanged while removing unsafe import
  and logging patterns.
- Keep CI workflows least-privilege without blocking existing build and release
  jobs.
- Produce a single rollback-friendly commit that can be reverted if a regression
  appears.

# Technical Goals

- Replace ad hoc HTML and URL sanitization with allowlist-based sanitization.
- Preserve safe imported page formatting and asset rewriting.
- Prevent dangerous URL schemes in imported HTML and Markdown links.
- Keep Copilot draft text extraction from interpreting raw HTML.
- Replace direct API-key hashing with framework-supported keyed tokenization.
- Replace random sortable fallback IDs with React-generated stable IDs.
- Add explicit GitHub Actions permissions to every alerted workflow/job.

# Requirements

- All high-severity CodeQL alerts must be addressed in source.
- All medium GitHub Actions permission alerts must be addressed in workflow YAML.
- Tests must cover representative malicious input for import HTML, import
  Markdown, Copilot HTML-to-text conversion, and token identifier behavior.
- Existing import behavior for safe headings, paragraphs, images, and remote
  HTTP(S) links must remain intact.
- No secrets, keys, or raw API tokens may be logged in plaintext.
- Workflow write permissions must be job-scoped only where release publishing
  requires them.

# Non-Goals

- No redesign of page import UX.
- No broad Markdown parser replacement.
- No database schema changes.
- No deployment change to GKE, Cloud SQL, Redis, RabbitMQ, or GCS.
- No bypassing CodeQL alerts with suppressions unless a finding is demonstrably
  false positive and cannot be rewritten safely.

# Architecture

- `apps/web/core/components/pages/import/page-import.utils.ts` owns page import
  parsing, HTML sanitization, Markdown conversion, title extraction, and asset
  source rewriting. It will centralize HTML sanitization and URL-scheme checks.
- `apps/web/core/components/copilot/panel.tsx` owns Copilot draft editing. Its
  text conversion must parse/sanitize HTML before extracting user-visible text.
- `packages/ui/src/sortable/sortable.tsx` owns sortable drag metadata. It will
  derive fallback grouping IDs from React component identity instead of
  randomness.
- `apps/api/plane/middleware/logger.py` owns external API request logging. It
  will use Django's keyed signing/HMAC utilities instead of direct
  `hashlib.sha256` use.
- `.github/workflows/*.yml` owns CI privilege boundaries. Defaults will be
  read-only and release publish permissions will be explicit.

# Data Models

- No database models change.
- API log payload shape stays the same:
  - `token_identifier`: stable non-reversible token identifier string
  - `headers`: stringified redacted header map
- Imported page draft shape stays the same:
  - `html`: sanitized HTML
  - `assets`: resolved local assets

# API Contracts

- No public API routes change.
- No frontend route contracts change.
- No environment variables change.
- GitHub Actions permissions contract:
  - default workflow token permission is `contents: read`
  - pull request workflows add `pull-requests: read` where needed
  - cache write jobs add `actions: write` only for cache save
  - release publishing adds `contents: write` only on the release job

# Security

- HTML import will use an explicit tag and attribute allowlist.
- URL attributes will accept only safe relative URLs, fragment URLs, `http:`,
  `https:`, `mailto:`, `tel:`, and selected image `data:` URLs.
- Event-handler attributes and scripting-capable elements will be stripped.
- Markdown links will validate URL schemes before rendering anchors.
- Copilot HTML-to-text conversion will not rely on tag regexes as the security
  boundary.
- API token identifiers remain stable but non-reversible and secret-keyed.
- CI workflow tokens follow least privilege by default.

# Edge Cases

- Uppercase or whitespace-padded JavaScript URLs.
- Encoded control characters in URL schemes.
- Protocol-relative URLs.
- Data URLs in non-image attributes.
- SVG image references in imported HTML.
- Malformed HTML with unclosed tags.
- Markdown links with dangerous schemes.
- Browser and Vitest environments where `DOMParser` may or may not exist.
- Re-rendered Sortable instances without caller-provided `id`.
- Missing API key headers should still skip token logging.

# Testing Strategy

- RED: add tests that fail against current unsafe implementation.
- GREEN: implement the smallest source changes to pass tests.
- REFACTOR: consolidate shared sanitizer helpers after behavior is green.
- Frontend tests:
  - `pnpm --filter web test -- apps/web/core/components/pages/import/page-import.utils.test.ts`
  - a new focused Copilot utility test if helper extraction is required
- Backend tests:
  - `docker compose -f docker-compose-test.yml run --rm api-tests pytest -v --tb=short plane/tests/unit/middleware/test_logger.py`
- Static checks:
  - `pnpm exec oxfmt --check` on changed TS/YAML/docs files
  - `pnpm exec oxlint --deny-warnings` on changed TS/TSX files
  - `ruff check` on changed Python files if available in the API test image
  - `git diff --check`
- Final validation:
  - push branch
  - wait for CodeQL/code-scanning run
  - re-query open alerts

# Rollback Plan

- Revert the single remediation commit.
- If workflow permission changes break CI, revert only workflow files while
  keeping source security fixes.
- If HTML import has a regression, revert the sanitizer helpers and tests, then
  restore previous import behavior from the parent commit.
- No migration rollback is required because this task has no schema changes.

# Milestones

# Milestone 1 — Alert Baseline

## Goal

Capture the current alert set from GitHub code scanning.

## Business Impact

Ensures the fix targets the actual blocking security backlog.

## Technical Scope

Use `gh api` to enumerate open alerts and group by rule/path.

## Dependencies

Authenticated GitHub CLI access.

## Risks

Alerts may change while fixes are in flight.

## Success Metrics

All open alert families are mapped to source or workflow files.

## Rollback

No code changes in this milestone.

# Milestone 2 — High-Severity Source Fixes

## Goal

Remove the 15 high-severity code alerts.

## Business Impact

Reduces the highest exploit risk in import, Copilot, UI, and API logging paths.

## Technical Scope

Add tests, replace unsafe sanitization/hash/randomness implementations, and keep
existing feature behavior.

## Dependencies

Existing Vitest and API test harnesses.

## Risks

Over-stripping imported HTML, changing token identifier values, or altering drag
metadata identity.

## Success Metrics

Targeted tests pass and CodeQL no longer reports high-severity alerts in edited
files.

## Rollback

Revert source files and tests in the remediation commit.

# Milestone 3 — Workflow Least Privilege

## Goal

Remove the 21 missing-permissions alerts.

## Business Impact

Reduces blast radius of compromised GitHub Actions tokens.

## Technical Scope

Add explicit workflow/job permissions to six workflow files.

## Dependencies

Knowledge of which jobs need release/cache/write permissions.

## Risks

CI jobs may fail if a necessary permission is omitted.

## Success Metrics

YAML remains valid and CodeQL no longer reports missing workflow permissions.

## Rollback

Revert workflow-file changes only.

# Milestone 4 — Verification and Publish

## Goal

Prove the fixes locally and through GitHub code scanning.

## Business Impact

Gives deployable confidence before the next preview rollout.

## Technical Scope

Run targeted tests/static checks, commit, push, watch CI/CodeQL, and re-query
alerts.

## Dependencies

Local Docker services and GitHub Actions availability.

## Risks

CI runtime failures outside the touched files.

## Success Metrics

Local checks pass and GitHub code scanning alert count decreases to zero for the
targeted open set.

## Rollback

Revert the remediation commit if production or CI regressions appear.

# Epics

# Epic 1 — Safe Page Import

## User Value

Users can import HTML, Markdown, and Notion exports without importing executable
content.

## Technical Requirements

Use allowlist sanitization, validate URL schemes, preserve safe content, and
keep local asset rewrites.

## Security Considerations

Strip scriptable elements, event attributes, dangerous URL schemes, and unsafe
data URLs.

## Edge Cases

Mixed-case schemes, whitespace before schemes, protocol-relative links, and
malformed HTML.

## Data Flow

File text -> parser -> body/title extraction -> sanitizer -> draft HTML ->
asset rewrite.

## API Contracts

No API contract changes.

## Testing Strategy

Vitest tests for HTML, Markdown, URL schemes, and asset source rewriting.

# Epic 2 — Safe Copilot Draft Editing

## User Value

Users can review AI-generated subtasks without raw HTML leaking into editable
text.

## Technical Requirements

Extract text from sanitized HTML and preserve line breaks.

## Security Considerations

Do not use a tag-removal regex as the sanitization boundary.

## Edge Cases

Nested tags, script tags, paragraph breaks, and `<br>` line breaks.

## Data Flow

Copilot subtask HTML -> sanitizer/text extractor -> textarea draft -> escaped
HTML on save.

## API Contracts

No API contract changes.

## Testing Strategy

Focused unit test for malicious HTML-to-text input.

# Epic 3 — Safe Logging and UI Metadata

## User Value

Operators can correlate API-token logs safely and users can drag UI items
without security warnings.

## Technical Requirements

Use Django keyed tokenization and React stable IDs.

## Security Considerations

Raw API keys never persist in logs; random fallback IDs are not security
tokens.

## Edge Cases

Missing API key, repeated token logging, and caller-provided sortable IDs.

## Data Flow

API key header -> token identifier -> async log task. Sortable props -> stable
component ID -> draggable metadata.

## API Contracts

Log payload field names stay unchanged.

## Testing Strategy

Backend unit tests for token identifier behavior and frontend static validation.

# Epic 4 — Least-Privilege Workflows

## User Value

CI remains functional while repository-token permissions are constrained.

## Technical Requirements

Add explicit `permissions` blocks to alerted workflows/jobs.

## Security Considerations

Default to read-only; grant write only to release/cache jobs that require it.

## Edge Cases

Manual release jobs, cache save jobs, and pull request checks.

## Data Flow

Workflow trigger -> job token -> checkout/cache/release action.

## API Contracts

No app API contracts change.

## Testing Strategy

YAML review plus GitHub Actions run validation after push.

# User Stories

As a workspace admin, I want imported pages to drop unsafe scripts so that
workspace content cannot execute malicious browser code.

Acceptance criteria: unsafe tags, event attributes, and dangerous URLs are
removed; safe headings, paragraphs, images, and HTTP(S) links remain.

As a user reviewing Copilot subtasks, I want draft descriptions to show plain
text so that generated HTML cannot alter the editing UI.

Acceptance criteria: script content and tags are not exposed as editable HTML;
paragraph and line breaks remain readable.

As an operator, I want API-token activity logs to use stable non-secret
identifiers so that investigations do not expose credentials.

Acceptance criteria: token identifiers are deterministic and do not contain raw
token values.

As a maintainer, I want CI tokens to be least-privilege so that compromised
workflow steps have limited repository access.

Acceptance criteria: every alerted workflow has explicit permissions and write
permissions are job scoped.

# Tasks

# Task

## Objective

Add failing page import sanitizer tests.

## Scope

HTML/Markdown import malicious inputs and URL scheme checks.

## Files

`apps/web/core/components/pages/import/page-import.utils.test.ts`

## Dependencies

Vitest and existing import test helpers.

## Risk Tier

R2

## Acceptance Criteria

Tests fail on current implementation and pass after sanitizer fix.

## Tests

Run targeted web Vitest file.

## Rollback

Remove added tests.

## Assigned Model

GPT-5.3-Codex-Spark

## Assigned Agent

local codex execution

# Task

## Objective

Implement safe page import sanitizer and URL validation.

## Scope

Page import utility only.

## Files

`apps/web/core/components/pages/import/page-import.utils.ts`

## Dependencies

`sanitize-html` through existing workspace package usage or local dependency.

## Risk Tier

R2

## Acceptance Criteria

Unsafe content is stripped and existing import tests pass.

## Tests

Targeted web Vitest file, formatter, lint, type check.

## Rollback

Revert utility changes.

## Assigned Model

GPT-5.3-Codex-Spark

## Assigned Agent

local codex execution

# Task

## Objective

Add and pass Copilot HTML-to-text tests.

## Scope

Extract helper if needed for testability.

## Files

`apps/web/core/components/copilot/*`

## Dependencies

Existing Vitest setup.

## Risk Tier

R2

## Acceptance Criteria

Malicious HTML produces plain text only.

## Tests

Focused Copilot utility test.

## Rollback

Revert helper/test changes.

## Assigned Model

GPT-5.3-Codex-Spark

## Assigned Agent

local codex execution

# Task

## Objective

Replace API-token log hashing with Django keyed tokenization.

## Scope

Logger middleware and unit tests.

## Files

`apps/api/plane/middleware/logger.py`,
`apps/api/plane/tests/unit/middleware/test_logger.py`

## Dependencies

Django crypto utilities.

## Risk Tier

R1

## Acceptance Criteria

Token identifiers remain deterministic and raw tokens are never logged.

## Tests

Backend middleware unit test.

## Rollback

Revert middleware/test changes.

## Assigned Model

GPT-5.3-Codex-Spark

## Assigned Agent

local codex execution

# Task

## Objective

Replace Sortable fallback randomness.

## Scope

Sortable component only.

## Files

`packages/ui/src/sortable/sortable.tsx`

## Dependencies

React `useId`.

## Risk Tier

R2

## Acceptance Criteria

No `Math.random()` is used for drag metadata fallback.

## Tests

Lint/type validation.

## Rollback

Revert sortable change.

## Assigned Model

GPT-5.3-Codex-Spark

## Assigned Agent

local codex execution

# Task

## Objective

Constrain GitHub Actions permissions.

## Scope

Six alerted workflow files.

## Files

`.github/workflows/build-branch.yml`,
`.github/workflows/check-version.yml`,
`.github/workflows/copyright-check.yml`,
`.github/workflows/feature-deployment.yml`,
`.github/workflows/pull-request-build-lint-api.yml`,
`.github/workflows/pull-request-build-lint-web-apps.yml`

## Dependencies

GitHub Actions token permission semantics.

## Risk Tier

R2

## Acceptance Criteria

Each workflow has explicit minimal permissions and release/cache write scopes
are job-limited.

## Tests

YAML review and post-push GitHub Actions run.

## Rollback

Revert workflow changes.

## Assigned Model

GPT-5.3-Codex-Spark

## Assigned Agent

local codex execution

# Acceptance Criteria

- The 36-alert baseline is addressed in source or workflow configuration.
- Targeted frontend and backend tests pass.
- Formatting, lint, and type checks pass for touched code.
- `git diff --check` is clean.
- Changes are committed and pushed to `preview`.
- GitHub code scanning is re-queried after CodeQL completes.
