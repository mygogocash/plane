# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import (
    Issue,
    IssueActivity,
    IssueType,
    Project,
    ProjectIssueType,
    ProjectMember,
    State,
    User,
    Workspace,
    WorkspaceMember,
)


def _epic_convert_url(slug, project_id, epic_id):
    return f"/api/workspaces/{slug}/projects/{project_id}/epics/{epic_id}/convert/"


def _work_item_convert_url(slug, project_id, issue_id):
    return f"/api/workspaces/{slug}/projects/{project_id}/work-items/{issue_id}/convert-to-epic/"


@pytest.fixture
def project(workspace, create_user):
    project = Project.objects.create(
        name="Epic Convert Project",
        identifier="ECP",
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
def member_user(db, workspace, project):
    user = User.objects.create(email="epic-convert-member@plane.so", username="epic_convert_member")
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
    user = User.objects.create(email="epic-convert-viewer@plane.so", username="epic_convert_viewer")
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=5)
    ProjectMember.objects.create(project=project, member=user, role=5)
    return user


@pytest.fixture
def viewer_client(viewer_user):
    client = APIClient()
    client.force_authenticate(user=viewer_user)
    return client


@pytest.fixture
def epic(project, state, epic_type, create_user):
    return Issue.objects.create(project=project, type=epic_type, state=state, name="Roadmap", created_by=create_user)


@pytest.fixture
def parent_epic(project, state, epic_type, create_user):
    return Issue.objects.create(
        project=project,
        type=epic_type,
        state=state,
        name="Parent roadmap",
        created_by=create_user,
    )


@pytest.fixture
def work_item(project, state, story_type, create_user):
    return Issue.objects.create(project=project, type=story_type, state=state, name="Build UI", created_by=create_user)


@pytest.mark.contract
class TestEpicConvert:
    @pytest.mark.django_db
    def test_convert_epic_to_work_item_flips_type_to_target(
        self, member_client, workspace, project, epic, epic_type, story_type
    ):
        response = member_client.post(
            _epic_convert_url(workspace.slug, project.id, epic.id),
            {"target_issue_type_id": str(story_type.id)},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        epic.refresh_from_db()
        assert epic.type_id == story_type.id
        assert response.data["is_epic"] is False
        assert IssueActivity.objects.filter(
            issue=epic,
            field="type",
            verb="updated",
            old_identifier=epic_type.id,
            new_identifier=story_type.id,
        ).exists()

    @pytest.mark.django_db
    def test_convert_epic_with_children_reparents_per_policy_and_logs(
        self, member_client, workspace, project, epic, parent_epic, work_item, story_type
    ):
        epic.parent = parent_epic
        epic.save()
        work_item.parent = epic
        work_item.save()

        response = member_client.post(
            _epic_convert_url(workspace.slug, project.id, epic.id),
            {"target_issue_type_id": str(story_type.id)},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["child_reparenting_policy"] == "reparent_to_epic_parent"
        work_item.refresh_from_db()
        assert work_item.parent_id == parent_epic.id
        assert IssueActivity.objects.filter(
            issue=work_item,
            field="parent",
            verb="updated",
            old_identifier=epic.id,
            new_identifier=parent_epic.id,
        ).exists()

    @pytest.mark.django_db
    def test_convert_work_item_to_epic_sets_is_epic_type(
        self, member_client, workspace, project, work_item, story_type, epic_type
    ):
        response = member_client.post(
            _work_item_convert_url(workspace.slug, project.id, work_item.id),
            {},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        work_item.refresh_from_db()
        assert work_item.type_id == epic_type.id
        assert response.data["is_epic"] is True
        assert IssueActivity.objects.filter(
            issue=work_item,
            field="type",
            verb="updated",
            old_identifier=story_type.id,
            new_identifier=epic_type.id,
        ).exists()

    @pytest.mark.django_db
    def test_convert_requires_project_edit_role(self, viewer_client, workspace, project, epic, epic_type, story_type):
        response = viewer_client.post(
            _epic_convert_url(workspace.slug, project.id, epic.id),
            {"target_issue_type_id": str(story_type.id)},
            format="json",
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN
        epic.refresh_from_db()
        assert epic.type_id == epic_type.id

    @pytest.mark.django_db
    def test_convert_cross_workspace_target_type_rejected(
        self, member_client, workspace, project, epic, epic_type, create_user
    ):
        other_workspace = Workspace.objects.create(
            name="Other Workspace",
            owner=create_user,
            slug="other-convert-workspace",
        )
        other_type = IssueType.objects.create(workspace=other_workspace, name="Foreign Story")

        response = member_client.post(
            _epic_convert_url(workspace.slug, project.id, epic.id),
            {"target_issue_type_id": str(other_type.id)},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        epic.refresh_from_db()
        assert epic.type_id == epic_type.id
