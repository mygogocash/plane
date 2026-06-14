# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import WorkflowTransitionViewSet, IssueStateTransitionEndpoint


urlpatterns = [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/state-transition/",
        IssueStateTransitionEndpoint.as_view(),
        name="issue-state-transition",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/workflow-transitions/",
        WorkflowTransitionViewSet.as_view({"get": "list", "post": "create"}),
        name="workflow-transitions",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/workflow-transitions/<uuid:pk>/",
        WorkflowTransitionViewSet.as_view(
            {"get": "retrieve", "patch": "partial_update", "delete": "destroy"}
        ),
        name="workflow-transition",
    ),
]
