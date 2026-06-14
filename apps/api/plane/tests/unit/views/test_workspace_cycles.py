# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework import status

from plane.db.models import Cycle, Project, ProjectMember


@pytest.mark.unit
class TestWorkspaceCyclesEndpoint:
    @pytest.mark.django_db
    def test_workspace_cycles__given_cycle_view_current__then_returns_only_current_cycles(
        self, session_client, workspace, create_user
    ):
        project = Project.objects.create(
            name="Active Cycle Project",
            identifier="ACP",
            workspace=workspace,
            created_by=create_user,
            cycle_view=True,
        )
        ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)

        now = timezone.now()
        Cycle.objects.create(
            name="Current Cycle",
            project=project,
            workspace=workspace,
            start_date=now - timedelta(days=1),
            end_date=now + timedelta(days=6),
            owned_by=create_user,
        )
        Cycle.objects.create(
            name="Upcoming Cycle",
            project=project,
            workspace=workspace,
            start_date=now + timedelta(days=1),
            end_date=now + timedelta(days=8),
            owned_by=create_user,
        )
        Cycle.objects.create(
            name="Completed Cycle",
            project=project,
            workspace=workspace,
            start_date=now - timedelta(days=8),
            end_date=now - timedelta(days=1),
            owned_by=create_user,
        )
        Cycle.objects.create(
            name="Draft Cycle",
            project=project,
            workspace=workspace,
            owned_by=create_user,
        )

        response = session_client.get(f"/api/workspaces/{workspace.slug}/cycles/", {"cycle_view": "current"})

        assert response.status_code == status.HTTP_200_OK
        assert [cycle["name"] for cycle in response.data] == ["Current Cycle"]
        assert response.data[0]["status"] == "CURRENT"
