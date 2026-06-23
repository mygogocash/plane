# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import pytest
from rest_framework import status
from rest_framework.test import APIClient

# Module imports
from plane.db.models import (
    Project,
    ProjectMember,
    State,
    User,
    WorkspaceMember,
    WorkflowTransition,
)


def _rules_url(slug, project_id, pk=None):
    base = f"/api/workspaces/{slug}/projects/{project_id}/workflow-transitions/"
    return f"{base}{pk}/" if pk else base


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
class TestWorkflowTransitionsCRUD:
    @pytest.mark.django_db
    def test_create_as_admin__201(self, session_client, workspace, project, state_a, state_b):
        response = session_client.post(
            _rules_url(workspace.slug, project.id),
            {"from_state": str(state_a.id), "to_state": str(state_b.id), "allowed_roles": [15]},
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert WorkflowTransition.objects.filter(project=project, from_state=state_a, to_state=state_b).exists()

    @pytest.mark.django_db
    def test_create_as_member__403(self, member_client, workspace, project, state_a, state_b):
        response = member_client.post(
            _rules_url(workspace.slug, project.id),
            {"from_state": str(state_a.id), "to_state": str(state_b.id)},
            format="json",
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert not WorkflowTransition.objects.filter(project=project).exists()

    @pytest.mark.django_db
    def test_list_filter_by_from_state__only_matching(
        self, session_client, workspace, project, state_a, state_b
    ):
        third = State.objects.create(name="Doing", project=project, group="started", color="#F59E0B")
        WorkflowTransition.objects.create(project=project, from_state=state_a, to_state=state_b)
        WorkflowTransition.objects.create(project=project, from_state=third, to_state=state_b)

        response = session_client.get(_rules_url(workspace.slug, project.id), {"from_state": str(state_a.id)})

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1
        assert response.data[0]["from_state"] == state_a.id

    @pytest.mark.django_db
    def test_list_other_project__not_returned(self, session_client, workspace, project, state_a, state_b, create_user):
        other = Project.objects.create(
            name="Other", identifier="OTH", workspace=workspace, created_by=create_user
        )
        ProjectMember.objects.create(project=other, member=create_user, role=20)
        WorkflowTransition.objects.create(project=project, from_state=state_a, to_state=state_b)

        # list under the OTHER project: the rule above belongs to `project`, must be absent
        response = session_client.get(_rules_url(workspace.slug, other.id))

        assert response.status_code == status.HTTP_200_OK
        assert response.data == []

    @pytest.mark.django_db
    def test_patch_allowed_roles_and_actors_as_admin__200(
        self, session_client, workspace, project, state_a, state_b, member_user
    ):
        rule = WorkflowTransition.objects.create(
            project=project, from_state=state_a, to_state=state_b, allowed_roles=[5]
        )
        member_pm = ProjectMember.objects.get(project=project, member=member_user)

        response = session_client.patch(
            _rules_url(workspace.slug, project.id, rule.id),
            {"allowed_roles": [15, 20], "actors": [str(member_pm.id)]},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        rule.refresh_from_db()
        assert rule.allowed_roles == [15, 20]
        # nested actors upserted
        assert rule.actors.filter(member=member_pm, deleted_at__isnull=True).count() == 1

    @pytest.mark.django_db
    def test_delete_as_admin__soft_deletes(self, session_client, workspace, project, state_a, state_b, monkeypatch):
        rule = WorkflowTransition.objects.create(project=project, from_state=state_a, to_state=state_b)
        monkeypatch.setattr(
            "plane.db.mixins.soft_delete_related_objects.delay",
            lambda *args, **kwargs: None,
        )
        response = session_client.delete(_rules_url(workspace.slug, project.id, rule.id))

        assert response.status_code == status.HTTP_204_NO_CONTENT
        # soft delete: row still exists via all_objects with deleted_at set, hidden from default manager
        assert not WorkflowTransition.objects.filter(pk=rule.id).exists()
        assert WorkflowTransition.all_objects.get(pk=rule.id).deleted_at is not None

    @pytest.mark.django_db
    def test_create_cross_project_state__400(self, session_client, workspace, project, state_a, create_user):
        other = Project.objects.create(
            name="Other", identifier="OTH", workspace=workspace, created_by=create_user
        )
        ProjectMember.objects.create(project=other, member=create_user, role=20)
        foreign_state = State.objects.create(name="Foreign", project=other, group="completed", color="#000")

        response = session_client.post(
            _rules_url(workspace.slug, project.id),
            {"from_state": str(state_a.id), "to_state": str(foreign_state.id)},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert not WorkflowTransition.objects.filter(project=project).exists()
