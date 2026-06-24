# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""AI-T21 tests: MCP tool -> /api/v1/ mapping, token scope, audit boundary.

These tests exercise the MCP layer against a fake transport. They prove the
tools forward to the correct token-scoped ``/api/v1/`` endpoints (where Plane
performs auth + audit) and that auth/scope rejections surface with no data.
Live verification against a running ``/api/v1/`` is a separate integration step.
"""

import os
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from plane_mcp import PlaneClient, PlaneMCPServer  # noqa: E402


class FakeTransport:
    """Records calls and returns canned (status, payload) responses."""

    def __init__(self, response):
        self.response = response
        self.calls = []

    def __call__(self, method, url, headers, body):
        self.calls.append({"method": method, "url": url, "headers": headers, "body": body})
        return self.response


def _server(response):
    transport = FakeTransport(response)
    client = PlaneClient("https://plane.test", token="tok-123", transport=transport)
    return PlaneMCPServer(client), transport


def test_valid_token_create_issue_maps_to_api_v1_and_audits():
    server, transport = _server((201, {"id": "issue-1", "name": "Bug"}))
    result = server.call_tool("create_issue", slug="acme", project_id="p1", name="Bug")

    assert result["ok"] is True
    assert result["data"]["id"] == "issue-1"
    call = transport.calls[0]
    assert call["method"] == "POST"
    # Maps to the token-scoped /api/v1/ endpoint (where Plane writes the audit).
    assert call["url"] == "https://plane.test/api/v1/workspaces/acme/projects/p1/issues/"
    assert call["headers"]["X-API-Key"] == "tok-123"


def test_guest_token_write_tool_rejected_cannot_exceed_role():
    # Plane returns 403 for a write beyond the token holder's role.
    server, _ = _server((403, None))
    result = server.call_tool("update_issue", slug="acme", project_id="p1", issue_id="i1", priority="high")

    assert result["ok"] is False
    assert result["status"] == 403
    assert result["data"] is None


def test_invalid_revoked_or_cross_workspace_token_rejected_no_data():
    server, _ = _server((401, None))
    result = server.call_tool("create_issue", slug="acme", project_id="p1", name="X")

    assert result["ok"] is False
    assert result["status"] == 401
    assert result["data"] is None


def test_search_backlog_empty_returns_empty_set_still_audited():
    server, transport = _server((200, {"results": []}))
    result = server.call_tool("search_backlog", slug="acme", project_id="p1", query="login")

    assert result["ok"] is True
    assert result["data"] == []
    # The search endpoint was still hit (Plane records the read).
    assert transport.calls[0]["url"].endswith("/issues/?search=login")


def test_unknown_tool_rejected():
    server, _ = _server((200, {}))
    result = server.call_tool("delete_workspace", slug="acme")
    assert result["ok"] is False
    assert result["status"] == 400
