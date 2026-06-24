# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""MCP stdio transport for Plane tools (AI-T21 live deploy)."""

# Python imports
import json
import os
import sys

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import TextContent, Tool

from .client import PlaneClient
from .server import TOOLS, PlaneMCPServer

TOOL_SCHEMAS: dict[str, dict] = {
    "create_issue": {
        "type": "object",
        "properties": {
            "slug": {"type": "string", "description": "Workspace slug"},
            "project_id": {"type": "string", "description": "Project UUID"},
            "name": {"type": "string", "description": "Issue title"},
            "description_html": {"type": "string", "description": "Optional HTML description"},
            "priority": {"type": "string", "description": "Optional priority"},
            "state_id": {"type": "string", "description": "Optional state UUID"},
        },
        "required": ["slug", "project_id", "name"],
    },
    "search_backlog": {
        "type": "object",
        "properties": {
            "slug": {"type": "string", "description": "Workspace slug"},
            "project_id": {"type": "string", "description": "Project UUID"},
            "query": {"type": "string", "description": "Search query (empty returns all)"},
        },
        "required": ["slug", "project_id"],
    },
    "get_cycle_status": {
        "type": "object",
        "properties": {
            "slug": {"type": "string", "description": "Workspace slug"},
            "project_id": {"type": "string", "description": "Project UUID"},
            "cycle_id": {"type": "string", "description": "Cycle UUID"},
        },
        "required": ["slug", "project_id", "cycle_id"],
    },
    "update_issue": {
        "type": "object",
        "properties": {
            "slug": {"type": "string", "description": "Workspace slug"},
            "project_id": {"type": "string", "description": "Project UUID"},
            "issue_id": {"type": "string", "description": "Issue UUID"},
            "name": {"type": "string", "description": "Optional new title"},
            "priority": {"type": "string", "description": "Optional priority"},
            "state_id": {"type": "string", "description": "Optional state UUID"},
        },
        "required": ["slug", "project_id", "issue_id"],
    },
}

TOOL_DESCRIPTIONS: dict[str, str] = {
    "create_issue": "Create a work item in a Plane project (token-scoped /api/v1/).",
    "search_backlog": "Search project backlog issues (token-scoped /api/v1/).",
    "get_cycle_status": "Read cycle status for a project (token-scoped /api/v1/).",
    "update_issue": "Patch a work item (token-scoped /api/v1/).",
}


def create_plane_mcp_server_from_env() -> PlaneMCPServer:
    token = os.environ.get("PLANE_API_TOKEN", "").strip()
    if not token:
        raise RuntimeError("PLANE_API_TOKEN is required")

    base_url = os.environ.get("PLANE_API_BASE_URL", "https://api.plane.so").strip()
    return PlaneMCPServer(PlaneClient(base_url, token))


def build_mcp_server(plane_mcp_server: PlaneMCPServer) -> Server:
    server = Server("plane-mcp")

    @server.list_tools()
    async def list_tools() -> list[Tool]:
        return [
            Tool(
                name=tool_name,
                description=TOOL_DESCRIPTIONS[tool_name],
                inputSchema=TOOL_SCHEMAS[tool_name],
            )
            for tool_name in TOOLS
        ]

    @server.call_tool()
    async def call_tool(name: str, arguments: dict | None) -> list[TextContent]:
        payload = plane_mcp_server.call_tool(name, **(arguments or {}))
        return [TextContent(type="text", text=json.dumps(payload))]

    return server


async def run_stdio_server(plane_mcp_server: PlaneMCPServer | None = None) -> None:
    mcp_server = build_mcp_server(plane_mcp_server or create_plane_mcp_server_from_env())
    async with stdio_server() as (read_stream, write_stream):
        await mcp_server.run(read_stream, write_stream, mcp_server.create_initialization_options())


def main() -> None:
    try:
        import asyncio

        asyncio.run(run_stdio_server())
    except Exception as error:  # noqa: BLE001 — surface startup failures on stderr only
        print(f"plane-mcp failed to start: {error}", file=sys.stderr)
        raise SystemExit(1) from error
