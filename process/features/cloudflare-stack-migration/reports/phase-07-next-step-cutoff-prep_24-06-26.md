# Phase 7 Next-Step Cutoff Prep - 2026-06-24

## Verdict

GCP production remains **prepare-only**. Do not disable or delete production GCP
resources yet.

## Completed In This Pass

- Verified `preview` is synced at merge commit `ffc9da124`.
- Re-ran Phase 7 readiness:
  - status: `blocked`
  - passed: `14/19`
  - blocked: `5`
- Installed and verified local Kubernetes tooling:
  - `kubectl`: `/opt/homebrew/bin/kubectl`
  - client version: `v1.36.2`
  - `gke-gcloud-auth-plugin`: installed
- Re-ran GKE credential acquisition:
  - still blocked by `gcloud` interactive reauthentication
- Probed `https://app.manut.xyz` with the local Chrome default profile:
  - title: `Sign up - Manut`
  - result: no reusable authenticated session was available
  - visible input: email sign-in field
- Refreshed Better Stack cutover evidence:
  - `process/features/cloudflare-stack-migration/reports/phase-07-betterstack-cutover_24-06-26.json`
  - endpoint probes: `3/3`
  - monitor checks: `0/3`
- Refreshed D1 target evidence:
  - `process/features/cloudflare-stack-migration/reports/phase-07-d1-target-evidence-rerun_24-06-26.json`
  - `process/features/cloudflare-stack-migration/reports/phase-07-d1-target-counts-rerun_24-06-26.json`
  - `process/features/cloudflare-stack-migration/reports/phase-07-d1-target-relationships-rerun_24-06-26.json`
  - `final_import_ready=false`
  - required target rows: `0`

## Remaining Blockers

1. GCP live inventory
   - `kubectl` is now installed.
   - `gcloud` still requires interactive reauthentication:

```text
Reauthentication failed. cannot prompt during non-interactive execution.
```

2. Authenticated production smoke
   - Local browser probe reached the sign-in screen, not an authenticated workspace.
   - A logged-in operator session or completed input evidence is still required.

3. Better Stack monitor proof
   - Public endpoint probes pass.
   - Better Stack monitor proof remains blocked because no Better Stack API token is
     available in this shell.

4. D1 final import validation
   - D1 target required tables remain empty.
   - Real production data import and source-to-target validation are still required.

5. Explicit operator approval and seven green days
   - Operator approval must be recorded before cutover.
   - Seven green production days can only begin after Phase 7 cutover is green.

## Required Operator Actions

Run or provide the following before production GCP cutoff can continue:

```bash
gcloud auth login
gcloud config set project affine-495114
gcloud container clusters get-credentials manut-ce-gke --region asia-southeast1 --project affine-495114
```

Then capture live inventory:

```bash
kubectl get deploy,statefulset,svc,ingress,pvc -n manut-ce -o wide
kubectl get pods -n manut-ce -o wide
```

Provide or export the missing tokens/evidence inputs:

```bash
export BETTERSTACK_API_TOKEN=...
export AUTHENTICATED_SMOKE_INPUT=process/features/cloudflare-stack-migration/reports/phase-07-authenticated-smoke-input-template_24-06-26.json
export OPERATOR_APPROVAL_INPUT=process/features/cloudflare-stack-migration/reports/phase-07-operator-cutover-approval-input-template_24-06-26.json
```

## Cutoff Decision

Current status: **do not cut off production GCP**.

Safe work can continue on evidence capture, data import validation, monitor
configuration, and live inventory. Production GKE, Cloud SQL/Postgres, GCS
uploads, Artifact Registry rollback images, static IP, DNS/load-balancer
rollback paths, and rollback service accounts/secrets must remain available.
