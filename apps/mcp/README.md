# Plane MCP server (AI-T21)

Standalone stdio MCP server that exposes four token-scoped Plane tools:

| Tool               | Plane API                                                                  |
| ------------------ | -------------------------------------------------------------------------- |
| `create_issue`     | `POST /api/v1/workspaces/{slug}/projects/{project_id}/issues/`             |
| `search_backlog`   | `GET /api/v1/workspaces/{slug}/projects/{project_id}/issues/?search=`      |
| `get_cycle_status` | `GET /api/v1/workspaces/{slug}/projects/{project_id}/cycles/{cycle_id}/`   |
| `update_issue`     | `PATCH /api/v1/workspaces/{slug}/projects/{project_id}/issues/{issue_id}/` |

Authorization, workspace scope, and audit logging are enforced by Plane when the personal API token is forwarded via `X-API-Key`. The MCP layer does not elevate privileges.

## Environment

| Variable             | Required | Default                | Description                                                   |
| -------------------- | -------- | ---------------------- | ------------------------------------------------------------- |
| `PLANE_API_TOKEN`    | yes      | —                      | Personal API token from Plane instance settings               |
| `PLANE_API_BASE_URL` | no       | `https://api.plane.so` | Plane API origin (e.g. `https://app.manut.xyz` for self-host) |

## Local run

```bash
cd apps/mcp
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export PLANE_API_TOKEN="plane_api_…"
export PLANE_API_BASE_URL="https://app.manut.xyz"
python -m plane_mcp
```

## Docker

```bash
docker build -f apps/mcp/Dockerfile.mcp -t plane-mcp .
docker run --rm -i \
  -e PLANE_API_TOKEN \
  -e PLANE_API_BASE_URL \
  plane-mcp
```

Use `-i` (interactive stdin) so MCP clients can attach stdio.

## Cursor / Claude Desktop config

```json
{
  "mcpServers": {
    "plane": {
      "command": "docker",
      "args": ["run", "--rm", "-i", "-e", "PLANE_API_TOKEN", "-e", "PLANE_API_BASE_URL", "plane-mcp"],
      "env": {
        "PLANE_API_TOKEN": "plane_api_…",
        "PLANE_API_BASE_URL": "https://app.manut.xyz"
      }
    }
  }
}
```

For local Python instead of Docker, set `"command": "python"` and `"args": ["-m", "plane_mcp"]` with `cwd` pointing at `apps/mcp` (and `PYTHONPATH` including `plane_mcp` parent).

## Tests

```bash
cd apps/mcp
pip install -r requirements.txt
pytest tests/ -q
```

Contract tests use a fake transport. Live verification against a running `/api/v1/` requires a valid token and is operator-gated.

## Removal

Delete the container/image and remove the MCP client entry. No Plane API changes are required.
