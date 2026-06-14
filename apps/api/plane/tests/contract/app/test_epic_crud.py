# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import (
    Issue,
    IssueType,
    Project,
    ProjectIssueType,
    ProjectMember,
    State,
    User,
    Workspace,
    WorkspaceMember,
)


def _epics_url(slug, project_id, pk=None):
    base = f"/api/workspaces/{slug}/projects/{project_id}/epics/"
    return f"{base}{pk}/" if pk else base


@pytest.fixture
def project(workspace, create_user):
    project = Project.objects.create(
        name="Epic Project",
        identifier="EPC",
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
    issue_type = IssueType.objects.create(workspace=workspace, name="Story", is_epic=False)
    ProjectIssueType.objects.create(project=project, issue_type=issue_type)
    return issue_type


@pytest.fixture
def member_user(db, workspace, project):
    user = User.objects.create(email="epic-member@plane.so", username="epic_member")
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=15)
    ProjectMember.objects.create(project=project, member=user, role=15)
    return user


@pytest.fixture
def member_client(member_user):
    client = APIClient()
    client.force_authenticate(user=member_user)
    return client


@pytest.fixture
def viewer_user(db, workspace, project):
    user = User.objects.create(email="epic-viewer@plane.so", username="epic_viewer")
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=5)
    ProjectMember.objects.create(project=project, member=user, role=5)
    return user


@pytest.fixture
def viewer_client(viewer_user):
    client = APIClient()
    client.force_authenticate(user=viewer_user)
    return client


@pytest.fixture
def non_member_client(db):
    user = User.objects.create(email="epic-non-member@plane.so", username="epic_non_member")
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.mark.contract
class TestEpicCRUD:
    @pytest.mark.django_db
    def test_create_epic_as_project_member_returns_201_and_sanitizes_description(
        self, member_client, workspace, project, state, epic_type
    ):
        response = member_client.post(
            _epics_url(workspace.slug, project.id),
            {
                "name": "Launch readiness",
                "description_html": "<p>Plan</p><script>alert(1)</script>",
                "state_id": str(state.id),
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        epic = Issue.objects.get(project=project, name="Launch readiness")
        assert epic.type_id == epic_type.id
        assert epic.type.is_epic is True
        assert "<script" not in epic.description_html
        assert epic.description_stripped == "Plan"
        assert response.data["is_epic"] is True

    @pytest.mark.django_db
    def test_list_epics_filters_to_is_epic_type(
        self, member_client, workspace, project, state, epic_type, story_type, create_user
    ):
        epic = Issue.objects.create(
            project=project,
            type=epic_type,
            state=state,
            name="Epic only",
            created_by=create_user,
        )
        Issue.objects.create(
            project=project,
            type=story_type,
            state=state,
            name="Plain issue",
            created_by=create_user,
        )

        response = member_client.get(_epics_url(workspace.slug, project.id))

        assert response.status_code == status.HTTP_200_OK
        assert [row["id"] for row in response.data] == [epic.id]
        assert response.data[0]["is_epic"] is True

    @pytest.mark.django_db
    def test_retrieve_patch_and_delete_epic_as_project_member(
        self, member_client, workspace, project, state, epic_type, create_user
    ):
        epic = Issue.objects.create(
            project=project,
            type=epic_type,
            state=state,
            name="Original epic",
            created_by=create_user,
        )

        retrieve_response = member_client.get(_epics_url(workspace.slug, project.id, epic.id))
        patch_response = member_client.patch(
            _epics_url(workspace.slug, project.id, epic.id),
            {"name": "Updated epic"},
            format="json",
        )
        delete_response = member_client.delete(_epics_url(workspace.slug, project.id, epic.id))

        assert retrieve_response.status_code == status.HTTP_200_OK
        assert retrieve_response.data["id"] == epic.id
        assert patch_response.status_code == status.HTTP_200_OK
        epic.refresh_from_db()
        assert epic.name == "Updated epic"
        assert epic.type_id == epic_type.id
        assert delete_response.status_code == status.HTTP_204_NO_CONTENT
        assert not Issue.objects.filter(pk=epic.id).exists()
        assert Issue.all_objects.get(pk=epic.id).deleted_at is not None

    @pytest.mark.django_db
    def test_create_epic_as_viewer_returns_403(self, viewer_client, workspace, project, state, epic_type):
        response = viewer_client.post(
            _epics_url(workspace.slug, project.id),
            {
                "name": "Viewer epic",
                "state_id": str(state.id),
                "type": str(epic_type.id),
            },
            format="json",
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert not Issue.objects.filter(project=project, name="Viewer epic").exists()

    @pytest.mark.django_db
    def test_create_epic_as_non_member_returns_403(self, non_member_client, workspace, project, state, epic_type):
        response = non_member_client.post(
            _epics_url(workspace.slug, project.id),
            {
                "name": "Non-member epic",
                "state_id": str(state.id),
                "type": str(epic_type.id),
            },
            format="json",
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert not Issue.objects.filter(project=project, name="Non-member epic").exists()

    @pytest.mark.django_db
    def test_epic_endpoint_cross_workspace_returns_400(self, member_client, project, state, epic_type, create_user):
        other_workspace = Workspace.objects.create(
            name="Other Workspace",
            owner=create_user,
            slug="other-workspace",
        )
        WorkspaceMember.objects.create(workspace=other_workspace, member=create_user, role=20)

        response = member_client.post(
            _epics_url(other_workspace.slug, project.id),
            {
                "name": "Cross workspace epic",
                "state_id": str(state.id),
                "type": str(epic_type.id),
            },
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert not Issue.objects.filter(project=project, name="Cross workspace epic").exists()
