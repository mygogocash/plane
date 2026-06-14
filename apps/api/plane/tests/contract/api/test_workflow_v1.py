# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for the api-key (v1) workflow-transitions CRUD + state-transition mirror (WF-T7).

These assert the v1 endpoints behave identically to the session layer:
- writes are admin-only,
- the transition gate (illegal move -> 409, disallowed actor -> 403) is the same
  ``enforce_state_transition`` used by session,
- reads are scoped to the api key's workspace + project.

The ``api_token`` fixture belongs to ``create_user`` (the workspace owner). To exercise
non-admin api keys we create separate users + their own API tokens, each with a unique
username to avoid the unique-key collision.
"""

# Python imports
from uuid import uuid4

# Third party imports
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
from plane.db.models.api import APIToken


def _rules_url(slug, project_id, pk=None):
    base = f"/api/v1/workspaces/{slug}/projects/{project_id}/workflow-transitions/"
    return f"{base}{pk}/" if pk else base


def _transition_url(slug, project_id, issue_id):
    return f"/api/v1/workspaces/{slug}/projects/{project_id}/issues/{issue_id}/state-transition/"


def _keyed_client(user):
    """Return an APIClient authenticated with a fresh API key for ``user``."""
    token = APIToken.objects.create(user=user, label=f"key-{uuid4().hex[:8]}", token=uuid4().hex)
    client = APIClient()
    client.credentials(HTTP_X_API_KEY=token.token)
    return client


@pytest.fixture
def project(workspace, create_user):
    project = Project.objects.create(
        name="Workflow Project", identifier="WF", workspace=workspace, created_by=create_user
    )
    # create_user is the workspace owner (admin); make them a project admin too
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
def member_keyed_client(db, workspace, project):
    """API key whose member is a project (and workspace) MEMBER (role 15)."""
    user = User.objects.create(
        email="member@plane.so", username="member_user", first_name="Mem", last_name="Ber"
    )
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=15)
    ProjectMember.objects.create(project=project, member=user, role=15)
    return _keyed_client(user)


@pytest.fixture
def guest_keyed_client(db, workspace, project):
    """API key whose member is a project (and workspace) GUEST (role 5)."""
    user = User.objects.create(
        email="guest@plane.so", username="guest_user", first_name="Gue", last_name="St"
    )
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=5)
    ProjectMember.objects.create(project=project, member=user, role=5)
    return _keyed_client(user)


def _enable(project):
    project.workflow_status = "enabled"
    project.save()


@pytest.mark.contract
class TestWorkflowV1TransitionsCRUD:
    @pytest.mark.django_db
    def test_create_as_admin_keyed__201(self, api_key_client, workspace, project, state_a, state_b):
        """v1 workflow-transitions POST > api key whose member is Admin > 201."""
        response = api_key_client.post(
            _rules_url(workspace.slug, project.id),
            {"from_state": str(state_a.id), "to_state": str(state_b.id), "allowed_roles": [15]},
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert WorkflowTransition.objects.filter(
            project=project, from_state=state_a, to_state=state_b
        ).exists()

    @pytest.mark.django_db
    def test_create_as_member_keyed__403(
        self, member_keyed_client, workspace, project, state_a, state_b
    ):
        """v1 workflow-transitions POST > api key whose member is Member > 403."""
        response = member_keyed_client.post(
            _rules_url(workspace.slug, project.id),
            {"from_state": str(state_a.id), "to_state": str(state_b.id)},
            format="json",
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert not WorkflowTransition.objects.filter(project=project).exists()

    @pytest.mark.django_db
    def test_list_other_project__not_returned(
        self, api_key_client, workspace, project, state_a, state_b, create_user
    ):
        """v1 workflow-transitions GET > scoped to the api key's workspace+project only."""
        other = Project.objects.create(
            name="Other", identifier="OTH", workspace=workspace, created_by=create_user
        )
        ProjectMember.objects.create(project=other, member=create_user, role=20)
        WorkflowTransition.objects.create(project=project, from_state=state_a, to_state=state_b)

        # list under the OTHER project: the rule above belongs to `project`, must be absent
        response = api_key_client.get(_rules_url(workspace.slug, other.id))

        assert response.status_code == status.HTTP_200_OK
        assert response.data == []


@pytest.mark.contract
class TestWorkflowV1StateTransition:
    @pytest.mark.django_db
    def test_illegal_move__409_identical_to_session(
        self, api_key_client, workspace, project, state_a, state_b, state_c, issue
    ):
        """v1 state-transition > illegal move > 409 (identical to session)."""
        _enable(project)
        # A has an outgoing rule (A->B); A->C is illegal
        WorkflowTransition.objects.create(
            project=project, from_state=state_a, to_state=state_b, allowed_roles=[20]
        )

        response = api_key_client.post(
            _transition_url(workspace.slug, project.id, issue.id),
            {"to_state": str(state_c.id)},
            format="json",
        )

        assert response.status_code == status.HTTP_409_CONFLICT
        issue.refresh_from_db()
        assert issue.state_id == state_a.id

    @pytest.mark.django_db
    def test_guest_keyed_disallowed_move__403_identical_to_session(
        self, guest_keyed_client, workspace, project, state_a, state_b, issue
    ):
        """v1 state-transition > api key mapped to Guest attempting disallowed move > 403."""
        _enable(project)
        # Rule allows MEMBER (15) only; a Guest-keyed caller is not permitted.
        WorkflowTransition.objects.create(
            project=project, from_state=state_a, to_state=state_b, allowed_roles=[15]
        )

        response = guest_keyed_client.post(
            _transition_url(workspace.slug, project.id, issue.id),
            {"to_state": str(state_b.id)},
            format="json",
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN
        issue.refresh_from_db()
        assert issue.state_id == state_a.id
