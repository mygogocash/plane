# Live Manut / Plane Bug Hunt - 2026-06-05

## Scope

Targets inspected:

- Landing site: `https://manut.xyz`
- Plane app: `http://app.manut.xyz`
- Temporary Plane smoke host: `http://plane.34.143.231.225.sslip.io`
- GKE namespace: `plane-ce` in project `affine-495114`

This pass used live HTTP probes, browser checks, Kubernetes/Helm state, selected source inspection, and read-only application logs. No destructive test data was created in this pass.

Secrets, email tokens, signed upload URLs, and private invitation details are intentionally omitted from this report.

## Executive Summary

The GKE Plane deployment is fundamentally alive: pods are running, the API answers, SMTP is configured, and `/uploads` routes to Cloud Storage instead of the web catch-all. The main production blockers are around domain/TLS, landing-to-app handoff, app branding/auth configuration, and one API route bug.

Highest priority issues:

1. `app.manut.xyz` is HTTP-only. HTTPS serves the default self-signed Kubernetes ingress certificate.
2. Production `manut.xyz` still routes sign-in and start links to `manut.xyz/sign-in` instead of `app.manut.xyz`.
3. The app authentication screen is still Plane-branded and has a mismatch with the landing promise: signup is disabled and Google auth is disabled.
4. The auth page emits React hydration errors in Chrome.
5. Authenticated `GET /api/workspaces/` can fail with `KeyError: 'slug'`.
6. The reported upload-save issue needs one authenticated network capture. Storage read/routing works, so the likely remaining defect is UI lifecycle or upload API error handling.

## Verified Healthy Areas

- GKE context is set to `gke_affine-495114_asia-southeast1_plane-ce-gke`.
- Helm release `plane-app` is deployed in namespace `plane-ce`.
- Plane pods inspected in `plane-ce` were running with zero restarts during this pass.
- `http://app.manut.xyz/api/instances/` returns `200`.
- `http://app.manut.xyz/god-mode/` returns the admin app shell.
- `http://app.manut.xyz/uploads` returns Cloud Storage XML `403`, not Plane HTML.
- A known uploaded asset path redirected to Cloud Storage and loaded as `image/png`.
- Cloud Storage CORS includes both `http://app.manut.xyz` and `https://app.manut.xyz`.
- Worker logs show invitation and magic-link email tasks reaching `Email sent successfully`.

## Findings

### P1 - `app.manut.xyz` HTTPS Is Broken

Status: verified.

Evidence:

- `http://app.manut.xyz/` returns the Plane app.
- `https://app.manut.xyz/` fails certificate verification.
- TLS inspection shows the default `Kubernetes Ingress Controller Fake Certificate`.
- `k8s/app-manut-xyz-ingress.yaml` has no `tls` section.

Suspected root cause:

- The NGINX ingress is exposed for `app.manut.xyz`, but no valid certificate is attached.

Fix batch:

- Install or verify `cert-manager` or use GKE managed certificates.
- Add TLS for `app.manut.xyz` to both app and uploads ingress definitions, or consolidate ingress routing under one TLS-enabled ingress.
- Redirect HTTP to HTTPS after certificate issuance is green.
- Update landing `appUrl` from `http://app.manut.xyz` to `https://app.manut.xyz` after HTTPS passes.

Acceptance criteria:

- `curl -fsS https://app.manut.xyz/api/instances/` succeeds.
- Browser shows a trusted certificate for `app.manut.xyz`.
- `curl -i https://app.manut.xyz/uploads` returns Cloud Storage XML, not Plane HTML.
- HTTP either redirects to HTTPS or remains explicitly documented as temporary.

Rollback:

- Remove the TLS annotations/secret reference and reapply the previous ingress.
- Keep landing links on HTTP only until HTTPS is confirmed.

### P1 - Production Landing Still Links Sign-In To `manut.xyz/sign-in`

Status: verified.

Evidence:

- Live landing anchors still include `https://manut.xyz/sign-in`.
- `https://manut.xyz/sign-in` returns a local app shell instead of redirecting to the Plane app.
- Mobile menu sign-in also points to `/sign-in`.
- Local changes exist in `/Users/kunanonjarat/Developer/AFFiNE-canary` to point landing app links at `app.manut.xyz`, but those changes are not live yet.

Suspected root cause:

- Landing changes are local but not deployed to production.

Fix batch:

- Commit and deploy the existing AFFiNE landing redirect changes.
- After Plane TLS is fixed, update landing config to `https://app.manut.xyz`.
- Add a production smoke test that fails if any CTA or sign-in link points to `/sign-in`.

Acceptance criteria:

- Header `Sign in`, hero CTA, pricing CTA, and mobile menu all point to `https://app.manut.xyz`.
- `https://manut.xyz/sign-in` either redirects to `https://app.manut.xyz` or is removed from public navigation.
- `llms.txt` references the app host, not `/sign-in`.

Rollback:

- Revert only the landing config/link commit if app handoff fails.

### P1 - Landing Auth Promise Does Not Match Plane Instance Config

Status: verified.

Evidence:

- Landing uses "Start free" and sign-in flows.
- Plane instance config reports `enable_signup=false`, `is_google_enabled=false`, and `is_email_password_enabled=true`.
- The app login page shows only email/password and unique-code flow.

Suspected root cause:

- Product/auth policy is not finalized for public users. The landing advertises self-serve signup, while Plane is configured as invite-only.

Fix batch:

- Choose the production contract:
  - Invite-only: change landing CTAs to "Sign in" / "Request access" and keep signup disabled.
  - Self-serve: enable signup and configure the intended auth providers.
- If Google auth is required, configure OAuth client IDs, callback URLs, and allowed domains.
- Update app copy and legal links to Manut-owned terms.

Acceptance criteria:

- A first-time user following the landing CTA reaches a flow they can complete.
- Plane `/api/instances/` auth flags match the landing UI.
- No CTA sends users to a disabled or unavailable signup path.

Rollback:

- Restore the previous auth flags and landing copy together, not independently.

### P2 - App Auth Page Emits React Hydration Errors

Status: verified in browser console.

Evidence:

- Chrome reports React minified errors `#418` and `#423` on `http://app.manut.xyz/`.
- `/api/users/me/` returning `401` is expected for unauthenticated users and is not counted as this bug.

Suspected root cause:

- Server-rendered and client-rendered auth markup differ, likely in the auth layout, metadata, theme, or runtime config path.

Fix batch:

- Reproduce against a production build locally.
- Add a Playwright smoke that fails on console errors for the unauthenticated auth page.
- Inspect these source areas first:
  - `apps/web/app/(all)/sign-up/layout.tsx`
  - `apps/web/app/layout.tsx`
  - `apps/web/app/root.tsx`
  - `apps/web/core/components/account/auth-forms/auth-header.tsx`
  - `apps/web/core/components/auth-screens/footer.tsx`

Acceptance criteria:

- Fresh unauthenticated load of `https://app.manut.xyz/` has no React hydration errors.
- Expected `401` from `/api/users/me/` remains tolerated by the test.

Rollback:

- Revert the smallest auth-layout change if hydration errors or auth routing regress.

### P2 - Authenticated Workspace List API Can Fail With `KeyError: 'slug'`

Status: verified from API logs and source inspection.

Evidence:

- API logs show authenticated `GET /api/workspaces/` failing with `KeyError: 'slug'` and returning `400`.
- `apps/api/plane/app/views/workspace/base.py` decorates `WorkSpaceViewSet.list` with `@allow_permission(..., level="WORKSPACE")`.
- `apps/api/plane/app/urls/workspace.py` exposes the collection route as `workspaces/`, which has no `slug` route parameter.
- `apps/api/plane/app/permissions/base.py` assumes `kwargs["slug"]` for workspace-level permission checks.

Suspected root cause:

- A workspace-scoped permission decorator is applied to a collection route that does not include a workspace slug.

Fix batch:

- Add a failing API regression test for authenticated `GET /api/workspaces/`.
- Patch either the view or permission helper:
  - Preferred: remove the workspace-level decorator from the collection list route and rely on `get_queryset()`.
  - Alternative: make `allow_permission` explicitly handle collection routes without `slug`.
- Verify member/admin behavior and unauthenticated `401`.

Acceptance criteria:

- Authenticated `GET /api/workspaces/` returns `200`.
- Unauthenticated `GET /api/workspaces/` still returns `401`.
- No workspace access broadening occurs.

Rollback:

- Revert the API patch and test if workspace visibility changes unexpectedly.

### P2 - Upload And Save Needs Authenticated UI Repro

Status: user-reported, partially verified.

Evidence:

- User reported the workspace logo modal `Upload & Save` button does not work.
- Live `/uploads` routing is correct.
- A known uploaded static asset loads successfully from Cloud Storage.
- Source inspection shows `apps/web/core/components/core/modals/workspace-image-upload-modal.tsx` uploads and calls `onSuccess(asset_url)`, but does not close the modal directly after success.

Suspected root cause:

- If the upload API returns `2xx`, the UI may appear stuck because modal close/reset depends on the parent callback.
- If the API returns an error, current error handling may collapse useful backend details into generic toasts.

Fix batch:

- Capture authenticated network activity while clicking `Upload & Save`.
- Split result handling:
  - For `2xx`: close modal, clear selected image, refresh workspace logo state.
  - For non-`2xx`: show the actual validation/storage error.
- Add a component/integration test for successful workspace logo upload and error display.

Acceptance criteria:

- Workspace logo upload closes the modal after success.
- The new logo appears without a full hard refresh.
- Reload preserves the uploaded logo.
- Failed upload shows a specific actionable error.

Rollback:

- Revert only the modal lifecycle/error handling change.

### P2 - Landing Theme Menu Does Not Open

Status: verified on live landing.

Evidence:

- Clicking the theme button leaves `aria-expanded=false`.
- No `Light`, `Dark`, or `System` menu items mount after click.

Suspected root cause:

- Theme dropdown trigger/content wiring is broken in the deployed landing build.

Fix batch:

- Fix the theme menu component in AFFiNE landing.
- Add a browser test that opens the menu and selects a theme option.

Acceptance criteria:

- Theme menu opens on desktop.
- Keyboard and pointer selection work.
- Selected theme persists according to the current theme strategy.

Rollback:

- Revert the theme-menu component change.

### P2 - Landing Legal/Security Routes Are Not Fully Live

Status: verified.

Evidence:

- `https://manut.xyz/security` returns a generic app shell, not a real security page.
- `https://manut.xyz/legal/data-deletion-instructions` returns a generic app shell even though the local repo contains this page.

Suspected root cause:

- Production landing deployment is behind local route changes or route matching is falling through to the app shell.

Fix batch:

- Deploy current landing route changes.
- Add route smoke tests for required legal/compliance URLs.

Acceptance criteria:

- Required legal/compliance routes return page-specific content.
- Footer/legal links do not lead to generic shells.

Rollback:

- Revert the landing route deployment if Cloud Run routing regresses.

### P3 - Landing Footer Social Links Are Placeholders

Status: verified.

Evidence:

- Footer `Discord` and `X / Twitter` links point to `#`.

Fix batch:

- Replace placeholders with real links or remove the links until official accounts exist.

Acceptance criteria:

- No public footer social link has `href="#"`.

Rollback:

- Restore previous footer if real social URLs are not ready.

## Solve Plan

### Batch 1 - Fix `app.manut.xyz` TLS

Risk tier: R1.

Tasks:

- Add certificate management for `app.manut.xyz`.
- Update `k8s/app-manut-xyz-ingress.yaml` with TLS.
- Validate app, API, admin, spaces, live route, and uploads over HTTPS.
- Only after validation, switch landing `appUrl` to HTTPS.

Validation:

```bash
kubectl get pods -n plane-ce
helm status plane-app -n plane-ce
curl -Iv https://app.manut.xyz/
curl -fsS https://app.manut.xyz/api/instances/
curl -i https://app.manut.xyz/uploads
```

### Batch 2 - Deploy Landing Handoff Fixes

Risk tier: R2.

Tasks:

- Commit and deploy the AFFiNE landing changes that redirect app actions to `app.manut.xyz`.
- Update smoke tests to check all visible CTAs and `/sign-in`.
- Re-run legal route checks.

Validation:

```bash
cd /Users/kunanonjarat/Developer/AFFiNE-canary/manut-landing
npm run test:app-links
npm run test:google-legal
npm run lint
npm run build
```

### Batch 3 - Resolve Auth And Branding Contract

Risk tier: R1.

Tasks:

- Decide invite-only vs self-serve signup.
- Align Plane instance flags, landing CTA copy, and app auth UI.
- Replace Plane-branded auth copy, metadata, and legal links with Manut copy.
- Keep Resend SMTP enabled, but store only rotated keys in deployment secrets.

Validation:

- `/api/instances/` auth flags match product behavior.
- A new user can complete the intended first-run path.
- Invite email delivery is confirmed in Resend and recipient inbox.

### Batch 4 - Fix Upload-Save Flow

Risk tier: R2.

Tasks:

- Use a controlled authenticated account to capture the workspace logo upload network response.
- Patch modal success/error handling.
- Add web tests around upload success and failure.

Validation:

- Upload closes the modal and refreshes the logo.
- Reload keeps the uploaded logo.
- Upload failure shows a specific message.
- `/uploads` still returns Cloud Storage XML.

### Batch 5 - Fix Workspace Collection API Permission Bug

Risk tier: R1.

Tasks:

- Add a failing test for authenticated `GET /api/workspaces/`.
- Patch the workspace list permission behavior.
- Verify no access broadening.

Validation:

```bash
docker compose -f docker-compose-test.yml run --rm api-tests pytest -k "workspace and list"
```

Then run the broader API contract subset if the targeted test passes.

### Batch 6 - Add Live Smoke Automation

Risk tier: R2.

Tasks:

- Add a smoke script for:
  - landing CTA destinations
  - `app.manut.xyz` HTTPS
  - `/api/instances/`
  - `/uploads`
  - auth page console errors
- Run the smoke after every deploy.

Acceptance criteria:

- Smoke fails fast on broken domain handoff, bad TLS, upload misrouting, or auth hydration errors.

## Not Fully Verified Yet

This pass does not certify every authenticated Plane feature end-to-end. The next pass needs a controlled signed-in test account and should create cleanup-safe records prefixed with `BUGHUNT-20260605-`.

Required authenticated checks:

- Workspace settings save.
- Workspace logo upload.
- Project create/edit/archive/delete.
- Project cover upload.
- Work item create/edit/status/assignee/label/comment/attachment.
- Pages creation and reload persistence.
- Member invite resend and acceptance.
- Logout/login recovery.

## Recommended Next Step

Start with Batch 1 and Batch 2. TLS and landing handoff are the public blockers; the upload and workspace API fixes should follow once a controlled authenticated browser capture confirms the exact failure path.
