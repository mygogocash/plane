# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from uuid import uuid4

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import Issue, IssueType, Project, ProjectIssueType, ProjectMember, State, User, Workspace
from plane.db.models import WorkspaceMember
from plane.db.models.api import APIToken


def _epics_url(slug, project_id):
    return f"/api/v1/workspaces/{slug}/projects/{project_id}/epics/"


def _epic_detail_url(slug, project_id, epic_id):
    return f"{_epics_url(slug, project_id)}{epic_id}/"


def _keyed_client(user):
    token = APIToken.objects.create(user=user, label=f"epic-key-{uuid4().hex[:8]}", token=uuid4().hex)
    client = APIClient()
    client.credentials(HTTP_X_API_KEY=token.token)
    return client


@pytest.fixture
def project(workspace, create_user):
    project = Project.objects.create(
        name="Epic V1 Project",
        identifier="EV1",
        workspace=workspace,
        created_by=create_user,
    )
    ProjectMember.objects.create(project=project, member=create_user, role=20)
    return project


@pytest.fixture
def state(project):
    return State.objects.create(name="Todo", project=project, group="unstarted", color="#60646C", default=True)


@pytest.fixture
def epic_type(workspace, project):
    issue_type = IssueType.objects.create(workspace=workspace, name="Epic", is_epic=True)
    ProjectIssueType.objects.create(project=project, issue_type=issue_type, is_default=True)
    return issue_type


@pytest.fixture
def story_type(workspace, project):
    issue_type = IssueType.objects.create(workspace=workspace, name="Story")
    ProjectIssueType.objects.create(project=project, issue_type=issue_type)
    return issue_type


@pytest.fixture
def member_keyed_client(db, workspace, project):
    user = User.objects.create(email="epic-v1-member@plane.so", username="epic_v1_member")
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=15)
    ProjectMember.objects.create(project=project, member=user, role=15)
    return _keyed_client(user)


@pytest.fixture
def viewer_keyed_client(db, workspace, project):
    user = User.objects.create(email="epic-v1-viewer@plane.so", username="epic_v1_viewer")
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=5)
    ProjectMember.objects.create(project=project, member=user, role=5)
    return _keyed_client(user)


@pytest.mark.contract
class TestEpicV1:
    @pytest.mark.django_db
    def test_v1_list_create_detail_enforce_same_roles(
        self, member_keyed_client, viewer_keyed_client, workspace, project, state, epic_type, story_type, create_user
    ):
        non_epic = Issue.objects.create(
            project=project,
            state=state,
            type=story_type,
            name="Plain work item",
            created_by=create_user,
        )

        create_response = member_keyed_client.post(
            _epics_url(workspace.slug, project.id),
            {
                "name": "V1 Epic",
                "state_id": str(state.id),
                "type": str(epic_type.id),
            },
            format="json",
        )

        assert create_response.status_code == status.HTTP_201_CREATED
        created_epic = Issue.objects.get(id=create_response.data["id"])
        assert created_epic.type_id == epic_type.id

        list_response = member_keyed_client.get(_epics_url(workspace.slug, project.id))

        assert list_response.status_code == status.HTTP_200_OK
        listed_ids = {str(item["id"]) for item in list_response.data}
        assert str(created_epic.id) in listed_ids
        assert str(non_epic.id) not in listed_ids

        detail_response = member_keyed_client.get(_epic_detail_url(workspace.slug, project.id, created_epic.id))

        assert detail_response.status_code == status.HTTP_200_OK
        assert str(detail_response.data["id"]) == str(created_epic.id)
        assert detail_response.data["is_epic"] is True

        viewer_response = viewer_keyed_client.post(
            _epics_url(workspace.slug, project.id),
            {
                "name": "Viewer V1 Epic",
                "state_id": str(state.id),
                "type": str(epic_type.id),
            },
            format="json",
        )

        assert viewer_response.status_code == status.HTTP_403_FORBIDDEN
        assert not Issue.objects.filter(project=project, name="Viewer V1 Epic").exists()

        other_workspace = Workspace.objects.create(
            name="Other V1 Workspace",
            owner=create_user,
            slug="other-v1-workspace",
        )
        WorkspaceMember.objects.create(workspace=other_workspace, member=create_user, role=20)

        cross_workspace_response = member_keyed_client.get(_epics_url(other_workspace.slug, project.id))

        assert cross_workspace_response.status_code == status.HTTP_400_BAD_REQUEST
