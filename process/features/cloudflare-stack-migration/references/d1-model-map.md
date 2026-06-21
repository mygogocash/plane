# D1 Model Map - First Pass

Date: 21-06-26

Scope: read-only static inventory for Phase 4 D1 backend rewrite preparation.
This document does not contain production data, credentials, connection strings,
or export output.

## Source Inputs

- Static model root: `apps/api/plane`
- Model source roots found:
  - `apps/api/plane/db/models`
  - `apps/api/plane/license/models`
- Migration source roots found:
  - `apps/api/plane/db/migrations`
  - `apps/api/plane/license/migrations`
- Inventory command:
  - `node apps/cloudflare/tools/django-model-inventory.mjs --root apps/api/plane`

## Inventory Summary

- Model-like classes: 121 total
- Concrete model-like classes: 114
- Abstract model-like classes: 7
- Migration files: 138
- Apps detected: `db`, `license`

Migration operation counts from the static scan:

| Operation           | Count |
| ------------------- | ----: |
| CreateModel         |   129 |
| AddField            |   369 |
| AlterField          |   323 |
| AlterUniqueTogether |   100 |
| RemoveField         |    80 |
| AddConstraint       |    55 |
| RunPython           |    55 |
| RenameField         |    16 |
| DeleteModel         |    15 |
| RenameModel         |     7 |
| AddIndex            |     6 |
| RemoveConstraint    |     5 |

No `RunSQL` operation was detected by the static scanner. That does not remove
the need to review data migrations manually before D1 import.

## First-Pass Domain Mapping

| Domain                           | Primary Django tables                                                                                                                                                                        | D1 migration notes                                                                                                                           |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Instance metadata                | `instances`, `instance_configurations`, `changelogs`, `instance_admins`                                                                                                                      | Best first API candidate because it supports `/api/instances/`. Keep `instance_admins` behind user/auth mapping because it references users. |
| Identity and sessions            | `users`, `profiles`, `accounts`, `social_login_connections`, `sessions`                                                                                                                      | High risk. Auth semantics, password/session storage, OAuth token metadata, and Django auth join tables need explicit boundary decisions.     |
| Workspaces                       | `workspaces`, `workspace_members`, `workspace_member_invites`, `workspace_user_properties`, `workspace_home_preferences`, `workspace_user_preferences`, `workspace_themes`, `teams`          | Many soft-delete partial uniqueness rules. Preserve slug uniqueness behavior with `deleted_at` handling.                                     |
| Projects                         | `projects`, `project_members`, `project_member_invites`, `project_identifiers`, `project_user_properties`, `project_pages`, `project_deploy_boards`, `project_webhooks`                      | Core tenant boundary. Needs complete FK/index parity before any write path moves.                                                            |
| Work items                       | `issues`, `issue_assignees`, `issue_labels`, `issue_comments`, `issue_activities`, `issue_sequences`, `issue_subscribers`, `issue_relations`, `issue_versions`, `issue_description_versions` | Highest risk. `issues` has JSON, binary, many-to-many, partial-constraint, advisory-lock, and transaction concerns.                          |
| Cycles and modules               | `cycles`, `cycle_issues`, `cycle_user_properties`, `modules`, `module_members`, `module_issues`, `module_links`, `module_user_properties`                                                    | Join tables and partial uniqueness must be modeled explicitly.                                                                               |
| Pages and descriptions           | `pages`, `page_logs`, `page_labels`, `page_versions`, `descriptions`, `description_versions`, `project_pages`                                                                                | Binary description payloads need storage/encoding decision before D1 import.                                                                 |
| Views, labels, states, estimates | `issue_views`, `labels`, `states`, `estimates`, `estimate_points`                                                                                                                            | Mostly relational metadata, but JSON filters and conditional uniqueness need D1-specific indexes.                                            |
| Files and uploads                | `file_assets`, `issue_attachments`                                                                                                                                                           | D1 should store metadata only. Object bytes/checksums belong in R2 migration evidence.                                                       |
| Integrations and APIs            | `api_tokens`, `api_activity_logs`, `webhooks`, `webhook_logs`, `integrations`, `workspace_integrations`, `github_*`, `slack_project_syncs`                                                   | Token material and external integration state need security review before migration.                                                         |
| Notifications                    | `notifications`, `user_notification_preferences`, `email_notification_logs`                                                                                                                  | JSON payloads should be serialized consistently. Queue retry behavior belongs in Phase 5.                                                    |
| Newer product areas              | `initiatives`, `status_updates`, `workflow_transitions`, `work_item_approvals`, `issue_properties`, `recurring_work_items`, `work_item_templates`, `copilot_*`                               | Validate feature ownership and active use before prioritizing D1 rewrite.                                                                    |

Current Cloudflare foundation tables are migration support tables, not a 1:1
translation of Django tables:

- `instance_config`
- `migration_audit`
- `upload_object_audit`
- `job_audit`

## Representative High-Risk Models

| Model       | Table         | Fields | Relations | Static concerns                                                                                |
| ----------- | ------------- | -----: | --------: | ---------------------------------------------------------------------------------------------- |
| `Issue`     | `issues`      |     22 |         6 | JSON, binary, many-to-many, partial constraints, Postgres advisory lock, transaction semantics |
| `Project`   | `projects`    |     31 |         6 | JSON, partial constraints, composite uniqueness                                                |
| `Page`      | `pages`       |     22 |         5 | JSON, binary, many-to-many                                                                     |
| `FileAsset` | `file_assets` |     18 |         7 | JSON, file storage semantics                                                                   |
| `Module`    | `modules`     |     15 |         2 | JSON, many-to-many, partial constraints, composite uniqueness                                  |
| `Workspace` | `workspaces`  |      8 |         2 | Slug and ownership semantics must remain tenant-safe                                           |
| `Instance`  | `instances`   |     16 |         0 | Low-risk read candidate for instance metadata parity                                           |

## D1 Compatibility Concerns

Static concern counts:

| Concern                                    | Count |
| ------------------------------------------ | ----: |
| JSON fields                                |    55 |
| Composite uniqueness / `unique_together`   |    49 |
| Partial constraints or conditional indexes |    49 |
| Binary fields                              |     8 |
| Postgres-specific fields/indexes           |     5 |
| Many-to-many declarations                  |     4 |
| File fields                                |     2 |
| Transaction semantics                      |     2 |
| Postgres advisory locking/raw cursor use   |     1 |

Required design decisions before import:

- UUID primary keys should be stored as canonical text in D1 unless a table has a
  strong reason to use integer keys.
- `JSONField` values should be stored as text with explicit encode/decode
  helpers. Any JSON-path filtering needs a D1-supported query/index strategy.
- `BinaryField` values in descriptions and page versions need a storage decision:
  text encoding in D1, R2 object payloads, or explicit deprecation.
- Postgres `ArrayField`, GIN-style indexes, and conditional constraints need
  manual equivalents or product-level behavior changes.
- Soft-delete uniqueness patterns using `deleted_at IS NULL` must be validated
  against D1 partial unique indexes or replaced by deterministic application
  checks.
- `Issue.save()` uses a Postgres advisory transaction lock for per-project
  sequence generation. A Worker/D1 rewrite needs a Durable Object, D1 transaction
  pattern, or other serialized allocator before issue writes move.
- Date/time values should use UTC ISO text consistently. Django timezone-aware
  behavior should not be assumed in Worker code.
- Django auth tables and contrib join tables must be included in future row-count
  exports if the D1 boundary includes authentication state.

## Row-Count Verification Shape

The row-count comparison tool is intentionally file-based. It accepts source and
target JSON count files generated by a separate export step:

```json
{
  "counts": {
    "workspaces": 12,
    "projects": 48,
    "issues": 1200
  }
}
```

Comparison command:

```bash
node apps/cloudflare/tools/compare-row-counts.mjs source-counts.json target-counts.json
```

Expected behavior:

- exit `0` when all table counts match;
- exit `1` only when one or more table counts differ or a table is missing from
  one side;
- exit `2` for usage or invalid input.

## First Candidate

Start D1 API parity with read-only instance metadata:

1. Map `license.Instance` -> `instances`.
2. Map `license.InstanceConfiguration` -> `instance_configurations` only if the
   API contract needs key/value instance settings.
3. Keep `license.InstanceAdmin` out of the first pass until user/auth migration
   boundaries are explicit.

This candidate aligns with the existing `/api/instances/` public contract and has
the smallest relational blast radius in the current inventory.
