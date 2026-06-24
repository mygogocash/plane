# Phase 7 Authenticated Production Smoke Runbook

Canonical report (output):
`process/features/cloudflare-stack-migration/reports/phase-07-authenticated-smoke_21-06-26.json`

Input template (working copy):
`process/features/cloudflare-stack-migration/reports/phase-07-authenticated-smoke-input_24-06-26.json`

Reference template (regenerate anytime):
`process/features/cloudflare-stack-migration/references/phase-07-authenticated-smoke-input-template_22-06-26.json`

## When to run

Run **after** `app.manut.xyz` routes to the Cloudflare production stack (Phase 7 cutover), not from public `/api/instances/` probes or login-page-only checks. Every check URL must stay under `https://app.manut.xyz` and must not be a public health probe, auth page, or Sign up page.

## Prerequisites

- Operator account with production login (non-production creds only in your password manager — never commit tokens/passwords).
- Browser with devtools or screen-recording for evidence artifacts.
- Repo checkout at `/Users/kunanonjarat/Developer/mygogocash-plane`.
- `pnpm install` completed at repo root.

Optional env for evidence bundle orchestration (step 6):

```bash
export AUTHENTICATED_SMOKE_INPUT="process/features/cloudflare-stack-migration/reports/phase-07-authenticated-smoke-input_24-06-26.json"
export AUTHENTICATED_SMOKE_REPORT="process/features/cloudflare-stack-migration/reports/phase-07-authenticated-smoke_21-06-26.json"
```

---

## Step 0 — Baseline (expect BLOCKED until this gate passes)

All commands below assume repo root (`/Users/kunanonjarat/Developer/mygogocash-plane`). Paths are repo-relative; do **not** insert an extra `--` before flags when using `pnpm --filter @manut/cloudflare auth:smoke-report`.

```bash
cd /Users/kunanonjarat/Developer/mygogocash-plane

pnpm --silent --filter @manut/cloudflare cutover:readiness --json
```

Note the `authenticated-smoke` check status before you start. A blank template must report `ok: false`, `passed: 0`, `failed: 11`.

---

## Step 1 — Generate a fresh input template

```bash
cd /Users/kunanonjarat/Developer/mygogocash-plane

pnpm --filter @manut/cloudflare auth:smoke-report \
  --template \
  --out process/features/cloudflare-stack-migration/reports/phase-07-authenticated-smoke-input_24-06-26.json
```

Copy for editing (optional):

```bash
cp process/features/cloudflare-stack-migration/reports/phase-07-authenticated-smoke-input_24-06-26.json \
   process/features/cloudflare-stack-migration/reports/phase-07-authenticated-smoke-input-working.json
```

---

## Step 2 — Capture Cloudflare route provenance (during the same session)

While logged in or immediately before/after the browser smoke, capture edge evidence for `app.manut.xyz`:

```bash
curl -sS -D - -o /dev/null https://app.manut.xyz/ | tee /tmp/manut-app-headers.txt
curl -sS https://app.manut.xyz/cdn-cgi/trace | tee /tmp/manut-cdn-cgi-trace.txt
```

Record in the input JSON:

- `cloudflare_route_verified`: `true`
- `cloudflare_route_evidence.url`: e.g. `https://app.manut.xyz/cdn-cgi/trace`
- `cloudflare_route_evidence.note`: paste a **redacted** `cf-ray` / colo line from the trace (no secrets)

---

## Step 3 — Manual browser checklist (11 required checks)

Use a dedicated smoke workspace/project. Prefer names like `smoke-YYYYMMDD` for created work items.

For **each** check, set in the input JSON:

| Field         | Requirement                                                              |
| ------------- | ------------------------------------------------------------------------ |
| `ok`          | `true` only after the step succeeded in production                       |
| `evidence`    | Screenshot path, HAR id, screen recording name, or concise operator note |
| `observed_at` | ISO-8601 UTC timestamp of the observation                                |
| `url`         | Full `https://app.manut.xyz/...` URL where you performed the step        |
| `note`        | Optional extra context                                                   |
| `title`       | Optional page title snapshot                                             |

Also fill top-level operator metadata once per run:

| Field                                           | Example                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------ |
| `actor`                                         | `operator@yourcompany.com` (or operator handle)                    |
| `target_origin`                                 | `https://app.manut.xyz`                                            |
| `operator_evidence.run_id`                      | `auth-smoke-2026-06-24T12:00:00Z`                                  |
| `operator_evidence.workspace_identifier`        | workspace slug, e.g. `acme`                                        |
| `operator_evidence.authenticated_workspace_url` | `https://app.manut.xyz/acme/`                                      |
| `operator_evidence.user_identity_redacted`      | e.g. `user:…@example.com (redacted)` **or** use `browser_artifact` |
| `operator_evidence.browser_artifact`            | path to screenshot/recording of authenticated shell                |

### Check-by-check guide

| ID                   | What to do                                                                   | URL hint                                  |
| -------------------- | ---------------------------------------------------------------------------- | ----------------------------------------- |
| `login`              | Log in with production creds; land in authenticated app shell (not Sign up). | `https://app.manut.xyz/` → workspace home |
| `session-refresh`    | Hard refresh (`Cmd+Shift+R`); session still authenticated.                   | Same workspace URL                        |
| `workspace-sidebar`  | Sidebar shows correct workspace name/context.                                | `https://app.manut.xyz/{slug}/`           |
| `project-list`       | Projects list loads without error.                                           | `https://app.manut.xyz/{slug}/projects/`  |
| `work-item-create`   | Create a non-critical test issue.                                            | Project issues view URL                   |
| `work-item-edit`     | Edit title/description of that issue.                                        | Issue detail URL                          |
| `work-item-delete`   | Delete or archive the test issue.                                            | Issue detail URL                          |
| `upload-attachment`  | Upload attachment or workspace logo; file resolves via uploads path.         | Issue detail or settings upload URL       |
| `live-update`        | Change visible in another tab/session (e.g. title edit or live doc).         | Issue or page URL                         |
| `admin-route`        | Open admin route: loads for admin **or** correctly denies non-admin.         | `https://app.manut.xyz/god-mode/`         |
| `public-space-route` | Open a public space URL; no authenticated-session leakage.                   | Public space share URL                    |

**Rejected evidence (tool will fail):** `/api/instances/`, `/api/health`, `/login`, `/sign-up`, empty strings, "assumed pass" notes.

---

## Step 4 — Dry-run validation (expect failure until filled)

```bash
cd /Users/kunanonjarat/Developer/mygogocash-plane

pnpm --filter @manut/cloudflare auth:smoke-report \
  --input process/features/cloudflare-stack-migration/reports/phase-07-authenticated-smoke-input_24-06-26.json \
  --json | jq '{ok, summary, errors: .errors[0:8]}'
```

Fix every item in `errors` before proceeding.

---

## Step 5 — Emit canonical report (must exit 0)

```bash
cd /Users/kunanonjarat/Developer/mygogocash-plane

pnpm --filter @manut/cloudflare auth:smoke-report \
  --input process/features/cloudflare-stack-migration/reports/phase-07-authenticated-smoke-input_24-06-26.json \
  --out process/features/cloudflare-stack-migration/reports/phase-07-authenticated-smoke_21-06-26.json \
  --json
```

Success criteria:

- Exit code `0`
- `ok: true`
- `summary.passed: 11`, `summary.failed: 0`
- `operator_evidence_verified: true`
- `cloudflare_route_verified: true`

---

## Step 6 — Wire into cutover evidence + readiness

```bash
cd /Users/kunanonjarat/Developer/mygogocash-plane

export AUTHENTICATED_SMOKE_INPUT="process/features/cloudflare-stack-migration/reports/phase-07-authenticated-smoke-input_24-06-26.json"
export AUTHENTICATED_SMOKE_REPORT="process/features/cloudflare-stack-migration/reports/phase-07-authenticated-smoke_21-06-26.json"

pnpm --silent --filter @manut/cloudflare cutover:evidence --json --dry-run

pnpm --silent --filter @manut/cloudflare cutover:readiness --json
```

Confirm `authenticated-smoke` is no longer in `blockedChecks` / selected blockers.

---

## Minimal passing shape (illustrative — replace with real evidence)

```json
{
  "actor": "operator@example.com",
  "target_origin": "https://app.manut.xyz",
  "cloudflare_route_verified": true,
  "cloudflare_route_evidence": {
    "url": "https://app.manut.xyz/cdn-cgi/trace",
    "note": "cf-ray=… colo=BKK verified during authenticated session"
  },
  "operator_evidence": {
    "run_id": "auth-smoke-2026-06-24T15:30:00Z",
    "workspace_identifier": "your-workspace-slug",
    "authenticated_workspace_url": "https://app.manut.xyz/your-workspace-slug/",
    "user_identity_redacted": "user:op@example.com",
    "browser_artifact": "/path/to/redacted-authenticated-shell.png",
    "note": "Production smoke after Cloudflare cutover"
  },
  "checks": [
    {
      "id": "login",
      "ok": true,
      "evidence": "Authenticated shell screenshot /path/to/login-pass.png",
      "observed_at": "2026-06-24T15:31:00.000Z",
      "url": "https://app.manut.xyz/your-workspace-slug/",
      "note": "Landed in workspace home after credential login"
    }
  ]
}
```

(All 11 check IDs must be present — the template generator includes them.)

---

## Troubleshooting

| Symptom                                         | Likely fix                                                                       |
| ----------------------------------------------- | -------------------------------------------------------------------------------- |
| `operator_evidence_missing`                     | Fill `operator_evidence` block                                                   |
| `operator_session_evidence_missing`             | Set `user_identity_redacted` **or** `browser_artifact`                           |
| `public_probe_url` / `unauthenticated_evidence` | URL or evidence text points at `/api/instances`, login, or Sign up               |
| `cloudflare_route_verified` error               | Set `cloudflare_route_verified: true` + non-empty `cloudflare_route_evidence`    |
| `Authenticated smoke actor is required`         | Set top-level `actor`                                                            |
| Exit code 1 with `ok_false` on checks           | Set `ok: true` only with evidence + observed_at + valid production URL per check |

---

## Related Phase 7 gates (same session / maintenance window)

After authenticated smoke passes, continue with:

```bash
# Better Stack (requires BETTERSTACK_API_TOKEN)
pnpm --filter @manut/cloudflare betterstack:cutover-report \
  --json --require-endpoint-probes \
  --out process/features/cloudflare-stack-migration/reports/phase-07-betterstack-cutover_21-06-26.json

# Operator approval (separate input template)
pnpm --filter @manut/cloudflare operator:approval-report --template \
  --out process/features/cloudflare-stack-migration/reports/phase-07-operator-cutover-approval-input-template_24-06-26.json
```

See `process/general-plans/reports/pending-operator-gates_24-06-26.md` for the full gate table.
