# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Standalone Plane MCP server package (AI-T21).

Exposes four token-scoped tools that forward to Plane's ``/api/v1/`` API using
the caller's personal API token. Plane enforces role/workspace scope and writes
the audit trail server-side; this package never re-implements authorization.
"""

from .client import PlaneAPIError, PlaneClient
from .server import TOOLS, PlaneMCPServer

__all__ = ["PlaneAPIError", "PlaneClient", "PlaneMCPServer", "TOOLS"]
