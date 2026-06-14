# Testing

Use behavior-first tests. For code changes, follow red, green, refactor unless the task is explicitly documentation-only or mechanical formatting.

## Test Design Rules

- Write the smallest failing test that proves the requested behavior or regression.
- Prefer testing public behavior, contracts, and outcomes over private internals.
- Keep tests fast, independent, repeatable, self-validating, and timely.
- Mock external APIs, SDK boundaries, time, randomness, and third-party services. Prefer real local code and fixtures for internal logic.
- Name new Python tests with this shape when practical: `test_subject__given_condition__then_expected_behavior`.
- For UI work, combine targeted checks with a browser smoke when behavior or layout changes.

## Frontend Checks

Run from the repo root:

```bash
pnpm check
pnpm check:format
pnpm check:lint
pnpm check:types
pnpm fix
```

Target one package or app when iterating:

```bash
pnpm turbo run check:types --filter=web
pnpm turbo run check:lint --filter=@plane/ui
pnpm turbo run test --filter=<package>
```

`pnpm check` runs `check:format`, `check:lint`, and `check:types` through Turbo. Type checks may build upstream package outputs first.

## UI And Storybook

Use Storybook for shared UI components:

```bash
pnpm --filter=@plane/ui storybook
```

For app UI changes, run the relevant dev server and verify the actual workflow in browser:

```bash
pnpm dev
```

Expected local ports include `apps/web` on `3000` and `apps/admin` on `3001`.

## Backend API Tests

For backend code conventions, load [PYTHON.md](PYTHON.md). The Django/pytest suite runs in Docker through `docker-compose-test.yml`. Run `./setup.sh` once before the first test run so `apps/api/.env` exists.

Full suite:

```bash
docker compose -f docker-compose-test.yml up --build --abort-on-container-exit --exit-code-from api-tests
```

Filtered runs:

```bash
docker compose -f docker-compose-test.yml run --rm --build api-tests pytest -m unit
docker compose -f docker-compose-test.yml run --rm api-tests pytest -m contract
docker compose -f docker-compose-test.yml run --rm api-tests pytest plane/tests/contract/app -k "<name>"
```

Teardown:

```bash
docker compose -f docker-compose-test.yml down -v
```

Relevant backend docs:

- [apps/api/tests/RUNNING_TESTS.md](apps/api/tests/RUNNING_TESTS.md)
- [apps/api/plane/tests/README.md](apps/api/plane/tests/README.md)
- [apps/api/plane/tests/TESTING_GUIDE.md](apps/api/plane/tests/TESTING_GUIDE.md)

## Backend Test Markers

Markers are declared in `apps/api/pytest.ini`:

- `unit` - models, serializers, utilities, and isolated business logic.
- `contract` - API endpoint contracts.
- `smoke` - critical flow checks.
- `slow` - slower tests that may be skipped in targeted runs.

## Quality Gate Selection

- Docs-only: inspect links and affected markdown. Do not claim code validation.
- TypeScript-only: run targeted `check:types`/`check:lint`, then `pnpm check` when broad enough.
- Shared package: run the package check and at least one dependent app check when behavior can propagate.
- Backend API: run the smallest failing pytest first, then the matching marker or file after implementation.
- Cross-stack feature: run frontend checks, backend contract tests, and a browser smoke of the workflow.
