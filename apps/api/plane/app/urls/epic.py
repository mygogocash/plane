# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import EpicConvertEndpoint, EpicDuplicateEndpoint, EpicProgressEndpoint, EpicPropertyValuesEndpoint
from plane.app.views import EpicViewSet
from plane.app.views import EpicWorkItemsEndpoint
from plane.app.views import WorkItemConvertToEpicEndpoint


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
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/epics/<uuid:epic_id>/work-items/",
        EpicWorkItemsEndpoint.as_view(),
        name="project-epic-work-items",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/epics/<uuid:epic_id>/property-values/",
        EpicPropertyValuesEndpoint.as_view(),
        name="project-epic-property-values",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/epics/<uuid:epic_id>/convert/",
        EpicConvertEndpoint.as_view(),
        name="project-epic-convert",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/epics/<uuid:epic_id>/duplicate/",
        EpicDuplicateEndpoint.as_view(),
        name="project-epic-duplicate",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/work-items/<uuid:issue_id>/convert-to-epic/",
        WorkItemConvertToEpicEndpoint.as_view(),
        name="project-work-item-convert-to-epic",
    ),
]
