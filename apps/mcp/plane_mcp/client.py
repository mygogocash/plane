# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Thin Plane ``/api/v1/`` client used by the MCP tool handlers.

The client forwards the caller's personal API token via the ``X-API-Key``
header so Plane enforces the token holder's role and workspace scope. A
``transport`` callable seam keeps the network boundary mockable in tests; the
default transport uses the stdlib so the package has no third-party runtime
dependency.
"""

# Python imports
import json
import urllib.error
import urllib.request


class PlaneAPIError(Exception):
    """Raised when Plane returns a non-2xx response.

    ``status`` carries the HTTP status so the tool layer can surface
    auth/scope rejections (401/403) without leaking response bodies.
    """

    def __init__(self, status, message=""):
        self.status = status
        self.message = message
        super().__init__(f"Plane API error {status}: {message}")


def _urllib_transport(method, url, headers, body):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    request = urllib.request.Request(url=url, method=method, headers=headers, data=data)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:  # noqa: S310 (trusted base_url)
            raw = response.read().decode("utf-8") or "null"
            return response.status, json.loads(raw)
    except urllib.error.HTTPError as error:
        return error.code, None


class PlaneClient:
    def __init__(self, base_url, token, transport=None):
        self.base_url = base_url.rstrip("/")
        self._token = token
        self._transport = transport or _urllib_transport

    def request(self, method, path, body=None):
        url = f"{self.base_url}{path}"
        headers = {"X-API-Key": self._token, "Content-Type": "application/json"}
        status, payload = self._transport(method, url, headers, body)
        if status < 200 or status >= 300:
            # Never echo the response body on rejection (no data leak).
            raise PlaneAPIError(status)
        return payload
