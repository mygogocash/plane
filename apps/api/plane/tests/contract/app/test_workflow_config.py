# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""WF-T8 — workflow-config endpoint (read/update Project.workflow_status, admin-only writes)."""

# Python imports
import pytest
from rest_framework import status
from rest_framework.test import APIClient

# Module imports
from plane.db.models import Project, ProjectMember, User, WorkspaceMember


def _config_url(slug, project_id):
    return f"/api/workspaces/{slug}/projects/{project_id}/workflow-config/"


@pytest.fixture
def project(workspace, create_user):
    project = Project.objects.create(
        name="Workflow Project", identifier="WF", workspace=workspace, created_by=create_user
    )
    ProjectMember.objects.create(project=project, member=create_user, role=20)
    return project


@pytest.fixture
def member_user(db, workspace, project):
    user = User.objects.create(email="member@plane.so", username="member_user", first_name="Mem", last_name="Ber")
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=15)
    ProjectMember.objects.create(project=project, member=user, role=15)
    return user


@pytest.fixture
def member_client(member_user):
    client = APIClient()
    client.force_authenticate(user=member_user)
    return client


@pytest.mark.contract
class TestWorkflowConfig:
    @pytest.mark.django_db
    def test_patch_as_admin_sets_enabled__200(self, session_client, workspace, project):
        response = session_client.patch(
            _config_url(workspace.slug, project.id),
            {"workflow_status": "enabled"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["workflow_status"] == "enabled"
        project.refresh_from_db()
        assert project.workflow_status == "enabled"

    @pytest.mark.django_db
    def test_patch_as_member__403(self, member_client, workspace, project):
        response = member_client.patch(
            _config_url(workspace.slug, project.id),
            {"workflow_status": "enabled"},
            format="json",
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN
        project.refresh_from_db()
        assert project.workflow_status == "disabled"

    @pytest.mark.django_db
    def test_patch_invalid_status__400(self, session_client, workspace, project):
        response = session_client.patch(
            _config_url(workspace.slug, project.id),
            {"workflow_status": "bogus"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        project.refresh_from_db()
        assert project.workflow_status == "disabled"

    @pytest.mark.django_db
    def test_get_returns_current_status_scoped_to_project(self, session_client, workspace, project):
        project.workflow_status = "paused"
        project.save()

        response = session_client.get(_config_url(workspace.slug, project.id))

        assert response.status_code == status.HTTP_200_OK
        assert response.data["workflow_status"] == "paused"
