# Executive Summary
Fix the live Plane bug-hunt findings that can be addressed safely in source: project validation/upload ordering, API validation error contracts, resend support for pending workspace invites, and Railway deployment notes for SMTP and uploads.

# Business Goals
- Keep project creation reliable for GoGoCash admins.
- Prevent misleading generic errors and unnecessary asset uploads when input is invalid.
- Make Railway deployment requirements explicit so invites and cover uploads survive redeploys.
- Allow admins to resend pending workspace invitations after SMTP is configured.

# Technical Goals
- Return field-specific project validation codes from API serializers.
- Validate project names in the web client before cover-image upload.
- Normalize project error parsing across create and settings forms.
- Document Railway SMTP and `/uploads` configuration with rollback notes.

# Requirements
- Invalid project names containing forbidden characters must be rejected before any cover upload in the create form.
- API create/update/detail serializers must return field-shaped validation errors for forbidden project name and identifier characters.
- Existing valid project create/edit flows must remain unchanged.
- Railway SMTP setup must document `SKIP_ENV_VAR=0` and Resend SMTP variables.
- Pending workspace invitations must expose an admin-only resend action.
- Railway `/uploads` proxy behavior must be documented as required for public browser uploads.

# Non-Goals
- No schema migrations.
- No hard deletion of live test data.
- No bypass of Railway two-factor authentication.
- No replacement of Plane's all-in-one container image in this batch.

# Architecture
- Backend validation remains the source of truth.
- Frontend mirrors the same forbidden-character validation to avoid wasted uploads.
- Deployment guidance stays in docs because Railway production config is gated by account authentication.

# Data Models
- No data model changes.

# API Contracts
- `name` forbidden-character errors return `["PROJECT_NAME_CANNOT_CONTAIN_SPECIAL_CHARACTERS"]`.
- `identifier` forbidden-character errors return `["PROJECT_IDENTIFIER_CANNOT_CONTAIN_SPECIAL_CHARACTERS"]`.
- `POST /api/workspaces/:slug/invitations/:id/resend/` resends a pending invite and rejects responded invites with `INVITE_ALREADY_RESPONDED`.

# Security
- Do not expose SMTP secrets in docs, logs, or output.
- Use Railway secret variables for `EMAIL_HOST_PASSWORD`.
- Rotate the Resend key that was pasted into chat after delivery is confirmed.

# Edge Cases
- Local static cover selected with invalid project name.
- Remote cover selected with invalid project name.
- API clients bypassing the web form.
- Identifier changes in project settings.
- Resend sender domain not verified.
- Pending invite created before SMTP was enabled.
- Accepted or declined invite is resent.
- Railway redeploy losing dashboard-only command patches.

# Testing Strategy
- Add backend contract tests for invalid project name and identifier error shape.
- Add backend contract tests for pending and responded invitation resend.
- Run targeted Docker pytest for project contract tests when Docker is available.
- Run web type and lint checks for edited frontend files.

# Rollback Plan
- Revert the frontend validation helper imports/usages.
- Revert API serializer validation error shape changes.
- Remove deployment documentation additions.
- For Railway SMTP, delete `SKIP_ENV_VAR`, `ENABLE_SMTP`, and `EMAIL_*` variables or restore prior values through the Railway UI.

# Milestones
- Milestone 1: API contract tests and serializer fix.
- Milestone 2: Web create/settings validation and error parsing.
- Milestone 3: Workspace invite resend recovery.
- Milestone 4: Railway deployment documentation and verification notes.

# Epics
- Epic 1: Reliable Project Lifecycle
- Epic 2: Production Railway Operability

# User Stories
- As an admin, I want invalid project names rejected clearly so I know what to fix.
- As an admin, I want cover uploads to happen only after project input is valid so failed creates do not leave orphan assets.
- As an operator, I want Railway SMTP and upload proxy requirements documented so invites and covers work after redeploys.
- As an admin, I want to resend pending invite emails so teammates receive invites created before SMTP was working.

# Tasks
- Add project validation contract tests.
- Update API serializers to return code-based field errors.
- Add shared web project validation helpers.
- Validate project create/settings forms before upload/update.
- Add pending invitation resend endpoint and admin UI action.
- Add Railway deployment notes.

# Acceptance Criteria
- Invalid dotted project names show a specific special-character error.
- Invalid project create requests do not upload cover assets from the web form.
- API returns field-specific validation codes for invalid project names and identifiers.
- Valid project creation remains successful.
- Pending workspace invites can be resent without deleting them.
- Responded workspace invites cannot be resent.
- SMTP and `/uploads` Railway configuration is documented with rollback.
