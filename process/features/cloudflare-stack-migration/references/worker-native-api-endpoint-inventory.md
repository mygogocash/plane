# Worker-Native API Endpoint Inventory

Priority order for Django → Worker migration. Paths are relative to `https://app.manut.xyz`.

## P0 — Login bootstrap (Slice 2)

| Method | Path                        | Django module                    | Worker status            |
| ------ | --------------------------- | -------------------------------- | ------------------------ |
| POST   | `/auth/magic-generate/`     | `authentication.views.app.magic` | planned                  |
| POST   | `/auth/magic-sign-in/`      | `authentication.views.app.magic` | planned                  |
| GET    | `/auth/get-csrf-token/`     | `authentication.views`           | planned                  |
| GET    | `/api/users/me/`            | `app.views.user`                 | planned                  |
| GET    | `/api/users/me/settings/`   | `app.views.user`                 | planned                  |
| GET    | `/api/users/me/workspaces/` | `app.views.workspace.base`       | **registered (Slice 0)** |

## P1 — Workspace shell (Slice 3)

| Method | Path                              | Notes                      |
| ------ | --------------------------------- | -------------------------- |
| GET    | `/api/workspaces/:slug/`          | Workspace detail           |
| GET    | `/api/workspaces/:slug/projects/` | Project list               |
| GET    | `/api/users/me/profile/`          | Profile + onboarding flags |

## P2 — Issues (Slice 4)

| Method | Path                                             | Notes                |
| ------ | ------------------------------------------------ | -------------------- |
| GET    | `/api/workspaces/:slug/projects/:id/issues/`     | Issue list (smoke)   |
| POST   | `/api/workspaces/:slug/projects/:id/issues/`     | Issue create (smoke) |
| PATCH  | `/api/workspaces/:slug/projects/:id/issues/:pk/` | Issue edit (smoke)   |
| DELETE | `/api/workspaces/:slug/projects/:id/issues/:pk/` | Issue delete (smoke) |

## P3 — Uploads (Slice 4)

| Method | Path                               | Notes                                  |
| ------ | ---------------------------------- | -------------------------------------- |
| POST   | `/api/assets/v2/workspaces/:slug/` | Presigned upload (currently GCS)       |
| GET    | `/uploads/:key`                    | R2 read when `R2_UPLOADS_READ_ENABLED` |

## Already on Worker (no migration)

| Method | Path              |
| ------ | ----------------- |
| GET    | `/healthz`        |
| GET    | `/api/instances/` |

## Shadow / diagnostic only

| Method | Path                                           |
| ------ | ---------------------------------------------- |
| GET    | `/api/cloudflare/d1/workspaces`                |
| GET    | `/api/cloudflare/d1/workspaces/:slug/projects` |
| GET    | `/api/cloudflare/migration-status`             |
| GET    | `/api/cloudflare/routes`                       |
