# Agent Development Guide

This file is the always-loaded entrypoint for AI coding agents. Keep it short. Load the domain files below only when the task touches that area.

## Read Next

- [ARCHITECTURE.md](ARCHITECTURE.md) - system map, ownership boundaries, data flow, and security posture.
- [TESTING.md](TESTING.md) - TDD expectations, frontend checks, backend Docker pytest flow, and smoke testing.
- [TYPESCRIPT.md](TYPESCRIPT.md) - TypeScript, React, MobX, imports, formatting, and linting rules.
- [PYTHON.md](PYTHON.md) - Django API, DRF contracts, Ruff, migrations, and backend service rules.
- [BUILD.md](BUILD.md) - install, dev, build, environment, Docker, and deployment notes.
- [SKILLS.md](SKILLS.md) - on-demand workflows for PRs, release notes, branch names, and translation.
- [spec.md](spec.md) - current feature spec. Verify the task scope before replacing it.

Also check nested `AGENTS.md` files before editing inside a package. Today this repo has `packages/tailwind-config/AGENTS.md`.

## Workspace Facts

- Plane is a monorepo with React Router web apps, shared TypeScript packages, and a Django API.
- `apps/api` is intentionally excluded from the pnpm workspace and uses its own Python/Docker test flow.
- This local checkout may not contain `.git`. Do not claim a commit or push from this directory unless `git status` succeeds. If publishing is required, use a real clone or ask for the intended publish path.
- Use `pnpm`, not `npm` or `yarn`.
- Runtime baseline: Node `>=22.18.0`, pnpm `11.3.0`.

## Common Commands

```bash
pnpm install
pnpm dev
pnpm build
pnpm check
pnpm check:format
pnpm check:lint
pnpm check:types
pnpm fix
pnpm turbo run <command> --filter=<package>
pnpm --filter=@plane/ui storybook
```

Backend tests run through the isolated Docker stack:

```bash
./setup.sh
docker compose -f docker-compose-test.yml up --build --abort-on-container-exit --exit-code-from api-tests
docker compose -f docker-compose-test.yml run --rm --build api-tests pytest -m unit
docker compose -f docker-compose-test.yml down -v
```

## Code Boundaries

- Do not edit generated or dependency output: `node_modules/`, `.turbo/`, `.react-router/`, `.next/`, `.vite/`, `dist/`, `build/`, `coverage/`, `storybook-static/`.
- Do not print, commit, or hardcode secrets. If an environment variable changes, update the relevant `.env.example` and documentation.
- Do not modify deployment assets under `deployments/` or `k8s/` unless the task is explicitly infrastructure or release related.
- Keep user-facing strings in the i18n system when the surrounding code already uses it. Load the translate skill before editing `packages/i18n/src/locales/**`.
- Prefer existing shared packages before adding local one-off helpers: `@plane/ui`, `@plane/services`, `@plane/shared-state`, `@plane/types`, `@plane/utils`, and `@plane/constants`.

## Engineering Workflow

- Start with discovery: inspect the target files, package scripts, tests, and current runtime behavior.
- For nontrivial code changes, update or create an appropriate spec before implementation. If `spec.md` already belongs to another active task, create a scoped spec under `docs/` instead of overwriting it.
- Use TDD for behavior changes: write the smallest failing test, implement the minimum fix, then refactor.
- Keep changes scoped to the request. Avoid unrelated cleanup.
- For UI work, verify in a browser against the relevant local surface and capture the actual behavior.
- For backend/API work, prove permissions, validation, and rollback behavior with contract or unit tests.
- For Python backend work, load [PYTHON.md](PYTHON.md) before changing `apps/api/**`.

## Completion Gates

Choose the narrowest meaningful checks while working, then run the broader gate when the change warrants it:

```bash
pnpm check
docker compose -f docker-compose-test.yml run --rm --build api-tests pytest -m unit
```

For docs-only changes, at minimum inspect the rendered links/paths and avoid claiming full code validation.
