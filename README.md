# Manut

Manut is the GoGoCash-hosted fork deployed at [app.manut.xyz](https://app.manut.xyz).
The runtime product identity, CI/CD labels, public assets, and operational runbooks are
branded as Manut while internal source namespaces such as `@plane/*` and `plane.*`
remain unchanged for upstream compatibility.

This repository is based on Plane CE. Preserve upstream copyright and license text when
editing source files.

## Current Deployment

- Branch: `preview`
- App: `https://app.manut.xyz` (Cloudflare Worker `manut-app` + D1/R2/KV/Queues)
- Landing: `https://manut.xyz` (Cloudflare Pages)
- Primary CI/CD: `.github/workflows/cloudflare-ci-cd.yml` and Cloudflare Workers Builds
- **GCP/GKE runtime retired** (2026-06-25). Legacy Manut CI/CD still runs web/API checks on `preview` pushes but no longer publishes images or deploys to GKE.

Current operational docs:

- [Cloudflare stack migration](docs/cloudflare-stack-migration.md)
- [Manut CI/CD spec](docs/cicd-spec-2026-06-06.md) (partially legacy — GCP sections historical)

## CI/CD

Pushes to `preview` run checks, publish `manut-*` component images, run backend
migrations in GKE, roll out `manut-app-*` workloads, and smoke
`https://app.manut.xyz/api/instances/`.

Required GitHub repository variables:

- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_SERVICE_ACCOUNT`

Defaulted variables:

- `GCP_APP_URL=https://app.manut.xyz`
- `GCP_ARTIFACT_REPOSITORY=affine`
- `GCP_PROJECT_ID=affine-495114`
- `GCP_REGION=asia-southeast1`
- `GKE_CLUSTER=manut-ce-gke`
- `GKE_NAMESPACE=manut-ce`

## Runtime Cutover

The tracked Kubernetes resources target `manut-ce` and `manut-app`:

- `k8s/manut-helm-values.yaml`
- `k8s/app-manut-xyz-ingress.yaml`
- `k8s/cert-manager-letsencrypt.yaml`
- `k8s/github-actions-deployer-rbac.yaml`
- `k8s/manut-uploads-cors.json`

Do not delete the old `plane-ce` / `plane-app` runtime until public smoke and
authenticated smoke pass on `manut-app`.

## Local Development

Use the existing monorepo tooling:

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm --filter=web test
```

The API app is outside the main pnpm workspace and uses its Docker/Django test flow.

## License

This project remains licensed under the GNU Affero General Public License v3.0. See
[LICENSE.txt](LICENSE.txt).
