# Self-Host Feature Parity Matrix

Date: 2026-06-06

Last production evidence refresh: 2026-06-14

Target: GoGoCash/Manut self-hosted Plane on `mygogocash/plane` `preview`.

Latest verified production tag: `preview-254013b7228b`

Latest verified production rollout: `Plane CI/CD` run `27503184003`, Code
Quality runs `27503183507` and `27503183488`, open code-scanning alerts `0`,
live `GET https://app.manut.xyz/api/instances/ 200`, and live
`GET https://app.manut.xyz/gogocash/ 200`.

Historical feature rollout baseline: `preview-0b80aadd9610` from `Plane CI/CD`
run `27065884344`. Keep this baseline for June 6 feature evidence, not current
production state.

## Legend

- `Live`: functional in the verified production deployment or in the named
  local implementation tracker.
- `Present gated`: code exists and should be exposed through self-host
  entitlement.
- `Partial`: some models/routes/UI exist, but the end-to-end feature is not
  complete.
- `Missing`: needs a new open implementation in this fork.
- `External`: depends on infrastructure or third-party provider configuration.

## Source Reality

- Public fork base is Plane CE `1.3.1`.
- Public upstream tags also currently top out at `v1.3.1`.
- The repository contains `apps/web/ce`, not a private Commercial/Enterprise
  module tree.
- Current self-host entitlement helper is
  `apps/web/ce/lib/self-host-entitlements.ts`.
- GCP is the active deployment path; Railway is not the target.
- CI/CD publishes split Plane component images to Google Artifact Registry and
  rolls the `plane-ce` GKE workloads from `.github/workflows/ci-cd.yml`.

## Feature Matrix

| Feature family           | Target self-host behavior                              | Current status            | Evidence / starting point                                                             | Implementation path                                       |
| ------------------------ | ------------------------------------------------------ | ------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Projects and work items  | Full create/edit/list/detail workflow                  | Live                      | Core project/issue APIs and web routes exist                                          | Keep regression tested                                    |
| Cycles and modules       | Full project-level planning                            | Live                      | Cycle/module APIs and UI exist                                                        | Keep regression tested                                    |
| Active cycles            | Workspace-level active cycle view without upgrade      | Present gated             | `workspace-active-cycles-upgrade.tsx`; cycle services include workspace active cycles | Already entitlement-enabled; add route smoke              |
| Layouts and views        | List, board, calendar, gantt, spreadsheet, saved views | Live / partial by route   | Core issue layouts and workspace views exist                                          | Inventory route gaps and smoke                            |
| Public views/pages       | Shareable public surfaces on self-host                 | Live / present gated      | `space` app, deploy board models, public services                                     | Remove any remaining upsell copy                          |
| Bulk operations          | Full self-host bulk edit/transfer                      | Present gated             | `use-bulk-operation-status.ts`; bulk operation root                                   | Already entitlement-enabled; add coverage                 |
| Estimates                | Points/categories/time estimates                       | Present gated             | `packages/constants/src/estimates.ts`; API estimate type includes time                | Already entitlement-enabled; verify live                  |
| Dashboards               | Custom dashboards and widgets                          | Partial                   | Dashboard models/migrations and dashboard services exist                              | Build/repair UI and widget CRUD as needed                 |
| Analytics/reports        | Workspace/project analytics and export                 | Live / partial            | `plane.analytics`, app analytic URLs and export task                                  | Expose any hidden report UI; add smoke                    |
| Worklogs/time tracking   | Create/edit/list/delete/export issue worklogs          | Partial                   | `Project.is_time_tracking_enabled`; CE worklog components are stubs                   | Build worklog model/API/UI or wire missing implementation |
| Work item types          | Custom issue types and epic support                    | Partial                   | `IssueType.is_epic`; serializers expose `is_epic`                                     | Complete management UI and type-specific rules            |
| Epics                    | Epic work item type and hierarchy                      | Partial                   | CE epic store exists; API search references epics                                     | Verify route completeness, fill gaps                      |
| Initiatives              | Cross-project rollups                                  | Missing / partial unknown | Public route strings and marketing references only in current scan                    | Build model/API/UI if absent                              |
| Teamspaces               | Dedicated spaces with membership and governance        | Missing / partial unknown | i18n/subscription references; no obvious API model in scan                            | Build open teamspace model, permissions, nav              |
| Wiki                     | Workspace/project pages and nested docs                | Live / partial            | Page stores/routes exist                                                              | Remove gated/nested-page upsells, verify move/nest        |
| Nested pages and embeds  | Full page nesting and rich embeds                      | Present gated / partial   | Page import/embed code exists; prior embed upsell card hidden                         | Verify all embed commands and page nesting                |
| Project templates        | Clone reusable project structure                       | Partial                   | UI stubs: `ProjectTemplateSelect`; i18n keys exist                                    | Build template models/APIs/UI                             |
| Work item templates      | Create issues from templates                           | Partial                   | Issue modal accepts `templateId`; i18n keys exist                                     | Build template persistence and application                |
| Page templates           | Create pages from templates                            | Partial                   | i18n keys exist                                                                       | Build template persistence and application                |
| Recurring work items     | Scheduled generation and history                       | Partial / missing         | i18n keys and Celery recurring infrastructure exist                                   | Build recurrence model/API/worker/UI                      |
| Intake in-app            | Triage incoming work in projects                       | Live                      | `Intake`, `IntakeIssue`, intake views exist                                           | Keep regression tested                                    |
| Intake forms/email       | External forms/email into intake                       | Partial / missing         | deploy board/intake models, no clear email ingestion in scan                          | Build public forms and inbound email adapter              |
| Workflows                | State transition rules by project/type                 | Missing / partial unknown | i18n route strings, project settings route exists                                     | Build workflow models/API/UI/enforcement                  |
| Approvals                | Require approvers for transitions                      | Missing                   | No implementation found in quick scan                                                 | Build on top of workflow transitions                      |
| Automations              | Trigger/action rules                                   | Partial                   | i18n keys and project automation route; auto-archive task exists                      | Inventory route, build core engine if absent              |
| Integrations marketplace | GitHub/GitLab/Slack/Sentry integrations                | Partial / external        | OAuth providers and integration copy exist                                            | Prioritize GitHub/GitLab; require provider config         |
| Webhooks and REST API    | Full developer extensibility                           | Live / partial            | `packages/services/src/developer/webhook.service.ts`; API token service               | Verify all event coverage                                 |
| Plane AI copilot         | Self-host AI via Vertex/Gemini                         | Live / partial            | Prior copilot implementation in preview branch                                        | Expand context/actions/search                             |
| Semantic search          | Natural language search across workspace               | Missing / external        | Marketing references OpenSearch; no local model confirmed                             | Add OpenSearch/vector dependency plan                     |
| AI agents                | Assignable AI agents on work items                     | Missing                   | No complete agent model found in quick scan                                           | Build after AI action guardrails                          |
| Mobile self-host support | Web mobile plus Plane mobile app compatibility         | Partial                   | Responsive spec exists; public API must remain compatible                             | Continue responsive and API compatibility work            |
| SSO OIDC/SAML            | Self-host identity provider config                     | Partial / external        | Auth providers present; subscription constants gate OIDC/SAML                         | Inventory admin config and expose if implemented          |
| LDAP                     | Directory auth/group sync                              | Missing / external        | Subscription constant only in quick scan                                              | Build or integrate LDAP provider                          |
| Granular access control  | Fine-grained permissions                               | Missing / partial         | Existing workspace/project roles only                                                 | Extend RBAC carefully                                     |
| Audit logs               | API-enabled audit logs                                 | Partial / missing         | `AuditModel` base exists; no full user-facing audit API found                         | Build event log model/API/UI                              |
| Air-gapped operation     | No external calls, offline activation                  | External / missing        | Deployment/runtime concern                                                            | Remove Plane Cloud calls; document offline mode           |
| Backups/admin ops        | One-click backups/admin panel                          | External / partial        | GCP infra already managed; admin app exists                                           | Add GCP backup runbook/UI later                           |

## Immediate Backlog

1. Add self-host capability flags for all CE-present feature families.
2. Add tests proving the instance is treated as self-host/full-feature, not Free.
3. Remove remaining upgrade/pricing copy from reachable self-host screens.
4. Start worklogs/time tracking because the model flag exists but CE components
   are currently stubs.
5. Start templates because frontend placeholders and i18n keys exist.
6. Start workflows/approvals only after state-transition tests are in place.

## Risks

- The public CE source does not include every marketed Commercial feature.
- Stubbing UI would mislead users; every exposed feature must perform real work.
- Workflow and access-control features can break existing work item updates if
  enforced too broadly.
- Recurring work and AI actions need worker/idempotency protections before live
  deployment.
