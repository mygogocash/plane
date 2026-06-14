# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.api.views import InitiativeAPIEndpoint


urlpatterns = [
    path(
        "workspaces/<str:slug>/initiatives/",
        InitiativeAPIEndpoint.as_view(http_method_names=["get", "post"]),
        name="initiative-list",
    ),
    path(
        "workspaces/<str:slug>/initiatives/<uuid:pk>/",
        InitiativeAPIEndpoint.as_view(http_method_names=["get"]),
        name="initiative-detail",
    ),
]
