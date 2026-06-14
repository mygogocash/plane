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
    WorkspaceMember,
)


def _bulk_attach_url(slug, project_id, epic_id):
    return f"/api/workspaces/{slug}/projects/{project_id}/epics/{epic_id}/work-items/"


@pytest.fixture
def project(workspace, create_user):
    project = Project.objects.create(
        name="Epic Attach Project",
        identifier="EAP",
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
    user = User.objects.create(email="epic-attach-member@plane.so", username="epic_attach_member")
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
    user = User.objects.create(email="epic-attach-viewer@plane.so", username="epic_attach_viewer")
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
def other_epic(project, state, epic_type, create_user):
    return Issue.objects.create(
        project=project,
        type=epic_type,
        state=state,
        name="Other roadmap",
        created_by=create_user,
    )


@pytest.fixture
def work_item(project, state, story_type, create_user):
    return Issue.objects.create(project=project, type=story_type, state=state, name="Build UI", created_by=create_user)


@pytest.mark.contract
class TestEpicBulkAttach:
    @pytest.mark.django_db
    def test_bulk_attach_sets_parent_for_unparented_items(self, member_client, workspace, project, epic, work_item):
        response = member_client.post(
            _bulk_attach_url(workspace.slug, project.id, epic.id),
            {"issue_ids": [str(work_item.id)]},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        work_item.refresh_from_db()
        assert work_item.parent_id == epic.id
        assert response.data["attached_issue_ids"] == [str(work_item.id)]

    @pytest.mark.django_db
    def test_bulk_attach_rejects_item_already_parented_without_flag(
        self, member_client, workspace, project, epic, other_epic, work_item
    ):
        work_item.parent = other_epic
        work_item.save()

        response = member_client.post(
            _bulk_attach_url(workspace.slug, project.id, epic.id),
            {"issue_ids": [str(work_item.id)]},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        work_item.refresh_from_db()
        assert work_item.parent_id == other_epic.id
        assert "already_parented" in str(response.data)

    @pytest.mark.django_db
    def test_bulk_attach_reparents_with_flag_and_logs_activity(
        self, member_client, workspace, project, epic, other_epic, work_item
    ):
        work_item.parent = other_epic
        work_item.save()

        response = member_client.post(
            _bulk_attach_url(workspace.slug, project.id, epic.id),
            {"issue_ids": [str(work_item.id)], "reparent": True},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        work_item.refresh_from_db()
        assert work_item.parent_id == epic.id
        assert IssueActivity.objects.filter(
            issue=work_item,
            field="parent",
            verb="updated",
            old_identifier=other_epic.id,
            new_identifier=epic.id,
        ).exists()

    @pytest.mark.django_db
    def test_bulk_attach_requires_project_edit_role(self, viewer_client, workspace, project, epic, work_item):
        response = viewer_client.post(
            _bulk_attach_url(workspace.slug, project.id, epic.id),
            {"issue_ids": [str(work_item.id)]},
            format="json",
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN
        work_item.refresh_from_db()
        assert work_item.parent_id is None

    @pytest.mark.django_db
    def test_bulk_attach_rejects_issue_from_different_project(
        self, member_client, workspace, project, epic, story_type, state, create_user
    ):
        other_project = Project.objects.create(
            name="Other Project",
            identifier="OP",
            workspace=workspace,
            created_by=create_user,
        )
        ProjectMember.objects.create(project=other_project, member=create_user, role=20)
        foreign_state = State.objects.create(
            name="Other Todo",
            project=other_project,
            group="unstarted",
            color="#60646C",
        )
        ProjectIssueType.objects.create(project=other_project, issue_type=story_type)
        foreign_issue = Issue.objects.create(
            project=other_project,
            type=story_type,
            state=foreign_state,
            name="Foreign issue",
            created_by=create_user,
        )

        response = member_client.post(
            _bulk_attach_url(workspace.slug, project.id, epic.id),
            {"issue_ids": [str(foreign_issue.id)]},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        foreign_issue.refresh_from_db()
        assert foreign_issue.parent_id is None
