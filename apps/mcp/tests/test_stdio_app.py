# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import os
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from plane_mcp.server import TOOLS  # noqa: E402
from plane_mcp.stdio_app import (  # noqa: E402
    TOOL_SCHEMAS,
    create_plane_mcp_server_from_env,
)


def test_tool_schemas_cover_all_plane_tools():
    assert set(TOOL_SCHEMAS) == set(TOOLS)
    assert len(TOOLS) == 4


def test_create_plane_mcp_server_from_env_requires_token(monkeypatch):
    monkeypatch.delenv("PLANE_API_TOKEN", raising=False)
    with pytest.raises(RuntimeError, match="PLANE_API_TOKEN"):
        create_plane_mcp_server_from_env()


def test_create_plane_mcp_server_from_env_uses_base_url(monkeypatch):
    monkeypatch.setenv("PLANE_API_TOKEN", "tok")
    monkeypatch.setenv("PLANE_API_BASE_URL", "https://app.manut.xyz")
    server = create_plane_mcp_server_from_env()
    assert server._client.base_url == "https://app.manut.xyz"  # noqa: SLF001


def test_build_mcp_server_imports_mcp_sdk():
    pytest.importorskip("mcp")
    from plane_mcp.stdio_app import build_mcp_server  # noqa: WPS433

    from plane_mcp.client import PlaneClient
    from plane_mcp.server import PlaneMCPServer

    server = build_mcp_server(PlaneMCPServer(PlaneClient("https://plane.test", token="tok")))
    assert server.name == "plane-mcp"
