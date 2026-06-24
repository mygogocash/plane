# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import logging

import pytest
from django.urls import reverse
from rest_framework import status


@pytest.mark.django_db
def test_client_error_report__given_payload__then_logs_sanitized_fields(api_client, caplog):
    url = reverse("client-error-report")

    with caplog.at_level(logging.WARNING, logger="plane.api.client_error"):
        response = api_client.post(
            url,
            {
                "message": "render failed",
                "name": "TypeError",
                "route": "/gogocash/",
                "stack": "x" * 2500,
                "url": "https://app.manut.xyz/gogocash/",
                "user_agent": "Chrome",
                "ignored": "secret",
            },
            format="json",
        )

    assert response.status_code == status.HTTP_202_ACCEPTED
    assert len(response.data["id"]) == 32

    record = next(record for record in caplog.records if record.getMessage().startswith("frontend_route_error"))
    assert record.payload["message"] == "render failed"
    assert record.payload["name"] == "TypeError"
    assert record.payload["route"] == "/gogocash/"
    assert len(record.payload["stack"]) == 2000
    assert "ignored" not in record.payload
