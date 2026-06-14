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
    WorkspaceMember,
)


def _progress_url(slug, project_id, epic_id):
    return f"/api/workspaces/{slug}/projects/{project_id}/epics/{epic_id}/progress/"


@pytest.fixture
def project(workspace, create_user):
    project = Project.objects.create(
        name="Epic Progress Project",
        identifier="EPP",
        workspace=workspace,
        created_by=create_user,
    )
    ProjectMember.objects.create(project=project, member=create_user, role=20)
    return project


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
def state_factory(project):
    def _create(name, group):
        return State.objects.create(name=name, project=project, group=group, color="#60646C")

    return _create


@pytest.fixture
def viewer_user(db, workspace, project):
    user = User.objects.create(email="epic-progress-viewer@plane.so", username="epic_progress_viewer")
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=5)
    ProjectMember.objects.create(project=project, member=user, role=5)
    return user


@pytest.fixture
def viewer_client(viewer_user):
    client = APIClient()
    client.force_authenticate(user=viewer_user)
    return client


@pytest.mark.contract
class TestEpicProgress:
    @pytest.mark.django_db
    def test_progress_counts_children_by_state_group(
        self, viewer_client, workspace, project, epic_type, story_type, state_factory, create_user
    ):
        backlog = state_factory("Backlog", "backlog")
        started = state_factory("Doing", "started")
        completed = state_factory("Done", "completed")
        cancelled = state_factory("Cancelled", "cancelled")
        epic = Issue.objects.create(
            project=project, type=epic_type, state=backlog, name="Roadmap", created_by=create_user
        )

        Issue.objects.create(
            project=project,
            type=story_type,
            state=backlog,
            parent=epic,
            name="Backlog child",
            created_by=create_user,
        )
        Issue.objects.create(
            project=project,
            type=story_type,
            state=started,
            parent=epic,
            name="Started child",
            created_by=create_user,
        )
        Issue.objects.create(
            project=project,
            type=story_type,
            state=completed,
            parent=epic,
            name="Completed child one",
            created_by=create_user,
        )
        Issue.objects.create(
            project=project,
            type=story_type,
            state=completed,
            parent=epic,
            name="Completed child two",
            created_by=create_user,
        )
        deleted_child = Issue.objects.create(
            project=project,
            type=story_type,
            state=cancelled,
            parent=epic,
            name="Deleted child",
            created_by=create_user,
        )
        deleted_child.delete()

        response = viewer_client.get(_progress_url(workspace.slug, project.id, epic.id))

        assert response.status_code == status.HTTP_200_OK
        assert response.data["counts_by_group"] == {
            "backlog": 1,
            "unstarted": 0,
            "started": 1,
            "completed": 2,
            "cancelled": 0,
        }
        assert response.data["total_count"] == 4
        assert response.data["percent_complete"] == 50.0

    @pytest.mark.django_db
    def test_progress_zero_children_returns_zero_percent_no_divzero(
        self, viewer_client, workspace, project, epic_type, state_factory, create_user
    ):
        backlog = state_factory("Backlog", "backlog")
        epic = Issue.objects.create(
            project=project, type=epic_type, state=backlog, name="Empty epic", created_by=create_user
        )

        response = viewer_client.get(_progress_url(workspace.slug, project.id, epic.id))

        assert response.status_code == status.HTTP_200_OK
        assert response.data["counts_by_group"] == {
            "backlog": 0,
            "unstarted": 0,
            "started": 0,
            "completed": 0,
            "cancelled": 0,
        }
        assert response.data["total_count"] == 0
        assert response.data["percent_complete"] == 0
