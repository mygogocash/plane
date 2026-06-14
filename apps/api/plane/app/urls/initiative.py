# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import (
    InitiativeStatusUpdateReactionEndpoint,
    InitiativeStatusUpdateViewSet,
    InitiativeEpicMembersEndpoint,
    InitiativeProgressEndpoint,
    InitiativeProjectMembersEndpoint,
    InitiativesSummaryEndpoint,
    InitiativeViewSet,
)


urlpatterns = [
    path(
        "workspaces/<str:slug>/initiatives/",
        InitiativeViewSet.as_view({"get": "list", "post": "create"}),
        name="workspace-initiative",
    ),
    path(
        "workspaces/<str:slug>/initiatives-summary/",
        InitiativesSummaryEndpoint.as_view(),
        name="workspace-initiatives-summary",
    ),
    path(
        "workspaces/<str:slug>/initiatives/<uuid:pk>/",
        InitiativeViewSet.as_view(
            {
                "get": "retrieve",
                "put": "partial_update",
                "patch": "partial_update",
                "delete": "destroy",
            }
        ),
        name="workspace-initiative",
    ),
    path(
        "workspaces/<str:slug>/initiatives/<uuid:initiative_id>/epics/",
        InitiativeEpicMembersEndpoint.as_view(),
        name="workspace-initiative-epics",
    ),
    path(
        "workspaces/<str:slug>/initiatives/<uuid:initiative_id>/projects/",
        InitiativeProjectMembersEndpoint.as_view(),
        name="workspace-initiative-projects",
    ),
    path(
        "workspaces/<str:slug>/initiatives/<uuid:initiative_id>/progress/",
        InitiativeProgressEndpoint.as_view(),
        name="workspace-initiative-progress",
    ),
    path(
        "workspaces/<str:slug>/initiatives/<uuid:initiative_id>/status-updates/",
        InitiativeStatusUpdateViewSet.as_view({"get": "list", "post": "create"}),
        name="workspace-initiative-status-updates",
    ),
    path(
        "workspaces/<str:slug>/initiatives/<uuid:initiative_id>/status-updates/<uuid:pk>/",
        InitiativeStatusUpdateViewSet.as_view(
            {
                "get": "retrieve",
                "put": "partial_update",
                "patch": "partial_update",
                "delete": "destroy",
            }
        ),
        name="workspace-initiative-status-updates",
    ),
    path(
        "workspaces/<str:slug>/initiatives/<uuid:initiative_id>/status-updates/<uuid:status_update_id>/reactions/",
        InitiativeStatusUpdateReactionEndpoint.as_view(),
        name="workspace-initiative-status-update-reactions",
    ),
    path(
        "workspaces/<str:slug>/initiatives/<uuid:initiative_id>/status-updates/<uuid:status_update_id>/reactions/<str:reaction_code>/",
        InitiativeStatusUpdateReactionEndpoint.as_view(),
        name="workspace-initiative-status-update-reactions",
    ),
]
