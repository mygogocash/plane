# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import EpicProgressEndpoint, EpicViewSet


urlpatterns = [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/epics/",
        EpicViewSet.as_view({"get": "list", "post": "create"}),
        name="project-epic",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/epics/<uuid:pk>/",
        EpicViewSet.as_view(
            {
                "get": "retrieve",
                "put": "partial_update",
                "patch": "partial_update",
                "delete": "destroy",
            }
        ),
        name="project-epic",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/epics/<uuid:epic_id>/progress/",
        EpicProgressEndpoint.as_view(),
        name="project-epic-progress",
    ),
]
