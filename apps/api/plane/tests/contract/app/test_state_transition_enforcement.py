# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import pytest
from rest_framework import status
from rest_framework.test import APIClient

# Module imports
from plane.db.models import (
    Issue,
    Project,
    ProjectMember,
    State,
    User,
    WorkspaceMember,
    WorkflowTransition,
)


def _issue_url(slug, project_id, issue_id):
    return f"/api/workspaces/{slug}/projects/{project_id}/issues/{issue_id}/"


def _transition_url(slug, project_id, issue_id):
    return f"/api/workspaces/{slug}/projects/{project_id}/issues/{issue_id}/state-transition/"


@pytest.fixture
def project(workspace, create_user):
    project = Project.objects.create(
        name="Workflow Project", identifier="WF", workspace=workspace, created_by=create_user
    )
    ProjectMember.objects.create(project=project, member=create_user, role=20)
    return project


@pytest.fixture
def state_a(project):
    return State.objects.create(name="Todo", project=project, group="unstarted", color="#60646C")


@pytest.fixture
def state_b(project):
    return State.objects.create(name="Done", project=project, group="completed", color="#46A758")


@pytest.fixture
def state_c(project):
    return State.objects.create(name="Doing", project=project, group="started", color="#F59E0B")


@pytest.fixture
def issue(workspace, project, state_a, create_user):
    return Issue.objects.create(
        name="WI", workspace=workspace, project=project, state=state_a, created_by=create_user
    )


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


@pytest.fixture
def guest_user(db, workspace, project):
    user = User.objects.create(email="guest@plane.so", username="guest_user", first_name="Gue", last_name="St")
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=5)
    ProjectMember.objects.create(project=project, member=user, role=5)
    return user


@pytest.fixture
def guest_client(guest_user):
    client = APIClient()
    client.force_authenticate(user=guest_user)
    return client


def _enable(project):
    project.workflow_status = "enabled"
    project.save()


@pytest.mark.contract
class TestStateTransitionEnforcement:
    @pytest.mark.django_db
    def test_partial_update_allowed_member__204_and_state_updated(
        self, member_client, workspace, project, state_a, state_b, issue
    ):
        _enable(project)
        WorkflowTransition.objects.create(project=project, from_state=state_a, to_state=state_b, allowed_roles=[15])

        response = member_client.patch(
            _issue_url(workspace.slug, project.id, issue.id), {"state_id": str(state_b.id)}, format="json"
        )

        assert response.status_code == status.HTTP_204_NO_CONTENT
        issue.refresh_from_db()
        assert issue.state_id == state_b.id

    @pytest.mark.django_db
    def test_partial_update_illegal_target__409_unchanged(
        self, member_client, workspace, project, state_a, state_b, state_c, issue
    ):
        _enable(project)
        WorkflowTransition.objects.create(project=project, from_state=state_a, to_state=state_b, allowed_roles=[15])

        # A has an outgoing rule (A->B); A->C is illegal
        response = member_client.patch(
            _issue_url(workspace.slug, project.id, issue.id), {"state_id": str(state_c.id)}, format="json"
        )

        assert response.status_code == status.HTTP_409_CONFLICT
        assert response.data["error"] == "Transition is not permitted"
        issue.refresh_from_db()
        assert issue.state_id == state_a.id

    @pytest.mark.django_db
    def test_state_transition_guest_excluded__403_unchanged(
        self, guest_client, workspace, project, state_a, state_b, issue
    ):
        _enable(project)
        WorkflowTransition.objects.create(project=project, from_state=state_a, to_state=state_b, allowed_roles=[15])

        response = guest_client.post(
            _transition_url(workspace.slug, project.id, issue.id), {"to_state": str(state_b.id)}, format="json"
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert response.data["error"] == "You are not permitted to perform this transition"
        issue.refresh_from_db()
        assert issue.state_id == state_a.id

    @pytest.mark.django_db
    def test_partial_update_disabled__unrestricted(
        self, member_client, workspace, project, state_a, state_b, state_c, issue
    ):
        # workflow_status defaults to "disabled"
        WorkflowTransition.objects.create(project=project, from_state=state_a, to_state=state_b, allowed_roles=[15])

        response = member_client.patch(
            _issue_url(workspace.slug, project.id, issue.id), {"state_id": str(state_c.id)}, format="json"
        )

        assert response.status_code == status.HTTP_204_NO_CONTENT
        issue.refresh_from_db()
        assert issue.state_id == state_c.id

    @pytest.mark.django_db
    def test_both_seams_illegal__both_409(
        self, member_client, workspace, project, state_a, state_b, state_c, issue
    ):
        _enable(project)
        WorkflowTransition.objects.create(project=project, from_state=state_a, to_state=state_b, allowed_roles=[15])

        patch_resp = member_client.patch(
            _issue_url(workspace.slug, project.id, issue.id), {"state_id": str(state_c.id)}, format="json"
        )
        post_resp = member_client.post(
            _transition_url(workspace.slug, project.id, issue.id), {"to_state": str(state_c.id)}, format="json"
        )

        assert patch_resp.status_code == status.HTTP_409_CONFLICT
        assert post_resp.status_code == status.HTTP_409_CONFLICT
        assert patch_resp.data["error"] == "Transition is not permitted"
        assert post_resp.data["error"] == "Transition is not permitted"

    @pytest.mark.django_db
    def test_partial_update_name_only__no_enforcement(
        self, member_client, workspace, project, state_a, state_b, issue
    ):
        _enable(project)
        # A rule exists, but a non-state edit must skip enforcement entirely and succeed
        WorkflowTransition.objects.create(project=project, from_state=state_a, to_state=state_b, allowed_roles=[20])

        response = member_client.patch(
            _issue_url(workspace.slug, project.id, issue.id), {"name": "Renamed"}, format="json"
        )

        assert response.status_code == status.HTTP_204_NO_CONTENT
        issue.refresh_from_db()
        assert issue.name == "Renamed"
        assert issue.state_id == state_a.id
