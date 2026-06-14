# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.api.views import (
    IssueStateTransitionAPIEndpoint,
    WorkflowTransitionAPIEndpoint,
    WorkflowTransitionDetailAPIEndpoint,
)


urlpatterns = [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/workflow-transitions/",
        WorkflowTransitionAPIEndpoint.as_view(http_method_names=["get", "post"]),
        name="workflow-transitions",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/workflow-transitions/<uuid:pk>/",
        WorkflowTransitionDetailAPIEndpoint.as_view(http_method_names=["get", "patch", "delete"]),
        name="workflow-transition",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/state-transition/",
        IssueStateTransitionAPIEndpoint.as_view(http_method_names=["post"]),
        name="issue-state-transition",
    ),
]
