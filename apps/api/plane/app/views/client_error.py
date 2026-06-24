# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import logging
from uuid import uuid4

from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from plane.app.views.base import BaseAPIView


logger = logging.getLogger("plane.api.client_error")

MAX_FIELD_LENGTH = 2000
ALLOWED_FIELDS = {
    "message",
    "name",
    "route",
    "stack",
    "url",
    "user_agent",
}


def _sanitize_client_error_payload(payload):
    sanitized = {}

    for field in ALLOWED_FIELDS:
        value = payload.get(field)
        if value is None:
            continue

        sanitized[field] = str(value)[:MAX_FIELD_LENGTH]

    return sanitized


class ClientErrorReportEndpoint(BaseAPIView):
    permission_classes = [AllowAny]

    def post(self, request):
        error_id = uuid4().hex
        payload = _sanitize_client_error_payload(request.data if isinstance(request.data, dict) else {})
        user_id = str(request.user.id) if request.user.is_authenticated else None

        logger.warning(
            "frontend_route_error error_id=%s user_id=%s payload=%s",
            error_id,
            user_id,
            payload,
            extra={
                "error_id": error_id,
                "payload": payload,
                "user_id": user_id,
            },
        )

        return Response({"id": error_id}, status=status.HTTP_202_ACCEPTED)
