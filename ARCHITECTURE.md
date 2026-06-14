# Architecture

Plane is an open-source project management monorepo. The main product surface is split between React Router web apps, shared TypeScript packages, and a Django API.

## Repository Map

- `apps/web` - primary user-facing web app on port `3000`.
- `apps/admin` - instance/admin app on port `3001`.
- `apps/space` and `apps/live` - additional React Router apps in the workspace.
- `apps/api` - Django/DRF backend. This is outside `pnpm-workspace.yaml`; use the Python and Docker flow documented in [TESTING.md](TESTING.md).
- `apps/proxy` - proxy service assets, also outside the pnpm workspace.
- `packages/ui` - shared React component library with Storybook.
- `packages/shared-state` - MobX stores and reactive state patterns.
- `packages/services` - frontend service clients and API access boundaries.
- `packages/types`, `packages/constants`, `packages/utils`, `packages/hooks` - shared contracts and utility layers.
- `packages/editor` - rich text/editor integration.
- `packages/i18n` - locale files and translation tooling.
- `deployments/` and `k8s/` - deployment manifests and self-hosting assets.

## Frontend Shape

- Apps use React 18, React Router 7, TypeScript 5.8, Vite, and shared workspace packages.
- Application state follows existing MobX store patterns in `packages/shared-state`.
- HTTP and domain service logic belongs in `packages/services` or an existing app service boundary, not directly inside reusable UI components.
- Shared visual primitives belong in `@plane/ui` when they are reusable across apps. App-specific orchestration belongs in the app.
- Icons should come from the existing icon dependency, usually `lucide-react`, when one exists.

## Backend Shape

- `apps/api` is a Django/DRF application with separate app-facing and external API contracts.
- External API routes live under `/api/v1/` and use API-key authentication.
- Web app API routes live under `/api/` and use session authentication.
- Permission checks must happen before data is serialized or sent to downstream services.
- New writes should reuse existing model/service validation, activity logging, and permission gates.

## Data And Dependency Flow

- UI components should stay presentation-oriented.
- App screens coordinate stores, service calls, routing, and side effects.
- Service clients hold API shapes and request construction.
- Backend views/serializers validate inputs and permissions before querying or mutating data.
- Shared packages may depend on lower-level shared packages, but avoid app-to-app dependencies.
- Internal workspace dependencies use `workspace:*`; catalog-managed external dependencies use `catalog:`.

## Security And Privacy

- Never expose backend secrets to frontend code.
- Treat workspace, project, issue, and membership scopes as authorization boundaries.
- Validate client input on the backend even if frontend forms validate it first.
- Sanitize or normalize model/API output before returning it to clients.
- If adding environment variables, update examples and document whether the value is public frontend config or backend-only secret material.

## Change Risk

- R0: auth, permissions, payments, destructive data operations, schema destruction, production deletion.
- R1: API contracts, schema changes, queues, webhooks, caching, deployment topology.
- R2: UI-only, docs-only, localized refactors, non-behavioral tooling.

R0 changes need explicit approval and a rollback plan before implementation. R1 changes need compatibility and migration review. R2 changes still need focused verification.
