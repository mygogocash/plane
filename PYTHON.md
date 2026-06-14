# Python

Use this file for backend work under `apps/api/**`.

## Backend Shape

- `apps/api` is a Django/DRF application and is not part of `pnpm-workspace.yaml`.
- App-facing API code lives under `plane/app/**` and serves `/api/` session-authenticated frontend routes.
- External API code lives under `plane/api/**` and serves `/api/v1/` API-key-authenticated routes.
- Core models live under `plane/db/models/**`.
- Tests live under `plane/tests/**` with `unit`, `contract`, `smoke`, and `slow` pytest markers.

## API Rules

- Validate workspace, project, issue, and membership permissions before data leaves the backend.
- Use the existing permission decorators/classes and serializers for the endpoint family being changed.
- Keep external API and web app API contracts separate; do not mix auth assumptions between `plane/api` and `plane/app`.
- Reuse existing model/service validation for writes, activity logging, and side effects.
- Return explicit error responses for missing config, invalid scope, and permission failures.
- Never expose secrets, credentials, or backend-only environment values in API responses.

## Style And Tooling

Ruff config lives in `apps/api/pyproject.toml`.

From `apps/api`:

```bash
ruff check . --fix
ruff format .
```

The Ruff config uses:

- line length `120`
- double quotes
- import sorting with `known-first-party = ["plane"]`
- parent-relative imports banned
- migrations excluded from lint/format sweeps

Do not add a `mypy` gate unless a project type-check configuration is also added.

## Tests

Run backend tests from the repo root through Docker:

```bash
docker compose -f docker-compose-test.yml run --rm --build api-tests pytest -m unit
docker compose -f docker-compose-test.yml run --rm api-tests pytest -m contract
docker compose -f docker-compose-test.yml run --rm api-tests pytest plane/tests/contract/app -k "<name>"
```

Use `@pytest.mark.django_db` for database tests and the correct marker for the test category. Prefer factory fixtures over hand-built object graphs when existing factories cover the model.

## Migrations

- Treat schema changes as R1 or R0 depending on reversibility.
- Keep migrations minimal and scoped to the changed model.
- Include rollback notes for destructive or data-shaping changes.
- Do not edit existing applied migrations unless the task explicitly targets unreleased migration cleanup.

## External Services

Mock external APIs, SDKs, time, randomness, email delivery, queue dispatch, object storage, and LLM/provider calls in unit and contract tests unless the test is explicitly an integration smoke.
