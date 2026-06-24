# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""MCP tool handlers (AI-T21).

Four tools map 1:1 to token-scoped Plane ``/api/v1/`` endpoints:

  - ``create_issue``      -> POST   .../projects/{project_id}/issues/
  - ``search_backlog``    -> GET    .../projects/{project_id}/issues/?search=
  - ``get_cycle_status``  -> GET    .../projects/{project_id}/cycles/{cycle_id}/
  - ``update_issue``      -> PATCH  .../projects/{project_id}/issues/{issue_id}/

Authorization, workspace scoping, and the audit trail are enforced by Plane
when these endpoints are called with the caller's token. A token cannot exceed
its holder's role: a write tool invoked with a GUEST/viewer token is rejected
by Plane (403) and surfaced here as a structured rejection with no data.
"""

# Module imports
from .client import PlaneAPIError

TOOLS = ("create_issue", "search_backlog", "get_cycle_status", "update_issue")


def _rejection(status):
    return {"ok": False, "status": status, "error": "rejected", "data": None}


class PlaneMCPServer:
    """Dispatches MCP tool calls to a :class:`PlaneClient`."""

    def __init__(self, client):
        self._client = client

    def _issues_path(self, slug, project_id):
        return f"/api/v1/workspaces/{slug}/projects/{project_id}/issues/"

    def create_issue(self, *, slug, project_id, name, **fields):
        body = {"name": name, **fields}
        return self._client.request("POST", self._issues_path(slug, project_id), body=body)

    def search_backlog(self, *, slug, project_id, query=""):
        path = f"{self._issues_path(slug, project_id)}?search={query}"
        payload = self._client.request("GET", path)
        if isinstance(payload, dict):
            return payload.get("results", [])
        return payload or []

    def get_cycle_status(self, *, slug, project_id, cycle_id):
        path = f"/api/v1/workspaces/{slug}/projects/{project_id}/cycles/{cycle_id}/"
        return self._client.request("GET", path)

    def update_issue(self, *, slug, project_id, issue_id, **fields):
        path = f"{self._issues_path(slug, project_id)}{issue_id}/"
        return self._client.request("PATCH", path, body=fields)

    def call_tool(self, tool_name, **kwargs):
        """Invoke a tool by name. Auth/scope rejections (401/403) and any other
        Plane error are returned as a structured rejection, never raised."""
        if tool_name not in TOOLS:
            return {"ok": False, "status": 400, "error": "unknown tool", "data": None}
        handler = getattr(self, tool_name)
        try:
            data = handler(**kwargs)
        except PlaneAPIError as error:
            return _rejection(error.status)
        return {"ok": True, "status": 200, "data": data}
