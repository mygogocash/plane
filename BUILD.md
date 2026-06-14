# Build And Runtime

This repo uses pnpm and Turbo for the TypeScript workspace, plus a separate Python/Docker flow for the Django API.

## Prerequisites

- Node `>=22.18.0`
- pnpm `11.3.0`
- Docker Compose v2 for backend tests and local API stacks

Install dependencies:

```bash
pnpm install
```

Generate local env files:

```bash
./setup.sh
```

## Development

Start all frontend workspace dev servers:

```bash
pnpm dev
```

Common local ports:

- `apps/web`: `3000`
- `apps/admin`: `3001`
- `@plane/ui` Storybook: `6006`

Start Storybook:

```bash
pnpm --filter=@plane/ui storybook
```

## Build

Build all Turbo packages and apps:

```bash
pnpm build
```

Build a target:

```bash
pnpm turbo run build --filter=<package>
```

## Checks

```bash
pnpm check
pnpm check:format
pnpm check:lint
pnpm check:types
```

Auto-fix:

```bash
pnpm fix
pnpm fix:format
pnpm fix:lint
```

## Backend

`apps/api` is not part of `pnpm-workspace.yaml`. Use Docker for the normal test path:

```bash
docker compose -f docker-compose-test.yml up --build --abort-on-container-exit --exit-code-from api-tests
```

Python lint/format config lives in `apps/api/pyproject.toml` for Ruff.
Backend coding conventions live in [PYTHON.md](PYTHON.md).

## Environment

- Do not commit real `.env` files.
- If adding a variable, update the relevant `.env.example`.
- Prefix frontend-public variables consistently with the existing `VITE_` convention.
- Document backend-only secrets separately from browser-visible config.

## Deployment Files

- `deployments/aio`, `deployments/cli`, `deployments/kubernetes`, and `deployments/swarm` contain self-hosting assets.
- `k8s/` contains local/custom Kubernetes manifests.
- Only edit deployment files for an explicit infrastructure task, and include rollback steps in the task notes.
