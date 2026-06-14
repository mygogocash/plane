# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import (
    Initiative,
    Issue,
    IssueType,
    Project,
    ProjectIssueType,
    ProjectMember,
    State,
    StatusUpdate,
    StatusUpdateReaction,
    User,
    WorkspaceMember,
)


def _epic_status_updates_url(slug, project_id, epic_id, pk=None):
    base = f"/api/workspaces/{slug}/projects/{project_id}/epics/{epic_id}/status-updates/"
    return f"{base}{pk}/" if pk else base


def _initiative_status_updates_url(slug, initiative_id, pk=None):
    base = f"/api/workspaces/{slug}/initiatives/{initiative_id}/status-updates/"
    return f"{base}{pk}/" if pk else base


def _epic_status_update_reactions_url(slug, project_id, epic_id, status_update_id, reaction_code=None):
    base = f"/api/workspaces/{slug}/projects/{project_id}/epics/{epic_id}/status-updates/{status_update_id}/reactions/"
    return f"{base}{reaction_code}/" if reaction_code else base


@pytest.fixture
def project(workspace, create_user):
    project = Project.objects.create(
        name="Status Update Project",
        identifier="SUP",
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
def epic(project, state, epic_type, create_user):
    return Issue.objects.create(
        project=project,
        type=epic_type,
        state=state,
        name="Launch roadmap",
        created_by=create_user,
    )


@pytest.fixture
def initiative(workspace):
    return Initiative.objects.create(workspace=workspace, name="Market expansion")


@pytest.fixture
def member_user(db, workspace, project):
    user = User.objects.create(email="status-member@plane.so", username="status_member")
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
    user = User.objects.create(email="status-viewer@plane.so", username="status_viewer")
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
    user = User.objects.create(email="status-outsider@plane.so", username="status_outsider")
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.mark.contract
class TestStatusUpdateAPI:
    @pytest.mark.django_db
    def test_project_member_posts_at_risk_update_on_epic_sets_comment_fields_and_epic_fk(
        self, member_client, workspace, project, epic, member_user
    ):
        response = member_client.post(
            _epic_status_updates_url(workspace.slug, project.id, epic.id),
            {
                "status": StatusUpdate.Status.AT_RISK,
                "comment_html": "<p>Blocked by beta access</p><script>alert(1)</script>",
                "comment_json": {"type": "doc"},
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        status_update = StatusUpdate.objects.get(id=response.data["id"])
        assert status_update.workspace_id == workspace.id
        assert status_update.epic_id == epic.id
        assert status_update.initiative_id is None
        assert status_update.actor_id == member_user.id
        assert "<script" not in status_update.comment_html
        assert status_update.comment_stripped == "Blocked by beta access"

    @pytest.mark.django_db
    def test_workspace_member_posts_update_on_initiative_sets_initiative_fk(
        self, member_client, workspace, initiative, member_user
    ):
        response = member_client.post(
            _initiative_status_updates_url(workspace.slug, initiative.id),
            {
                "status": StatusUpdate.Status.ON_TRACK,
                "comment_html": "<p>Ready for launch</p>",
                "comment_json": {"type": "doc"},
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        status_update = StatusUpdate.objects.get(id=response.data["id"])
        assert status_update.workspace_id == workspace.id
        assert status_update.epic_id is None
        assert status_update.initiative_id == initiative.id
        assert status_update.actor_id == member_user.id
        assert status_update.comment_stripped == "Ready for launch"

    @pytest.mark.django_db
    def test_threaded_reply_attaches_via_parent_and_reaction_persists(
        self, member_client, workspace, project, epic, member_user
    ):
        parent_response = member_client.post(
            _epic_status_updates_url(workspace.slug, project.id, epic.id),
            {"status": StatusUpdate.Status.AT_RISK, "comment_html": "<p>Blocked</p>"},
            format="json",
        )
        reply_response = member_client.post(
            _epic_status_updates_url(workspace.slug, project.id, epic.id),
            {
                "status": StatusUpdate.Status.AT_RISK,
                "comment_html": "<p>Investigating</p>",
                "parent": parent_response.data["id"],
            },
            format="json",
        )
        reaction_response = member_client.post(
            _epic_status_update_reactions_url(workspace.slug, project.id, epic.id, parent_response.data["id"]),
            {"reaction": "plus-one"},
            format="json",
        )

        assert parent_response.status_code == status.HTTP_201_CREATED
        assert reply_response.status_code == status.HTTP_201_CREATED
        assert reaction_response.status_code == status.HTTP_201_CREATED
        reply = StatusUpdate.objects.get(id=reply_response.data["id"])
        reaction = StatusUpdateReaction.objects.get(id=reaction_response.data["id"])
        assert reply.parent_id == parent_response.data["id"]
        assert reaction.status_update_id == parent_response.data["id"]
        assert reaction.actor_id == member_user.id

    @pytest.mark.django_db
    def test_duplicate_reaction_rejected(self, member_client, workspace, project, epic):
        status_update = StatusUpdate.objects.create(
            workspace=workspace,
            epic=epic,
            status=StatusUpdate.Status.ON_TRACK,
            comment_html="<p>Clear</p>",
        )

        first_response = member_client.post(
            _epic_status_update_reactions_url(workspace.slug, project.id, epic.id, status_update.id),
            {"reaction": "plus-one"},
            format="json",
        )
        second_response = member_client.post(
            _epic_status_update_reactions_url(workspace.slug, project.id, epic.id, status_update.id),
            {"reaction": "plus-one"},
            format="json",
        )

        assert first_response.status_code == status.HTTP_201_CREATED
        assert second_response.status_code == status.HTTP_400_BAD_REQUEST
        assert StatusUpdateReaction.objects.filter(status_update=status_update, reaction="plus-one").count() == 1

    @pytest.mark.django_db
    def test_reaction_delete_removes_actor_reaction(self, member_client, workspace, project, epic, member_user):
        status_update = StatusUpdate.objects.create(
            workspace=workspace,
            epic=epic,
            status=StatusUpdate.Status.ON_TRACK,
            comment_html="<p>Clear</p>",
        )
        StatusUpdateReaction.objects.create(status_update=status_update, actor=member_user, reaction="plus-one")

        response = member_client.delete(
            _epic_status_update_reactions_url(workspace.slug, project.id, epic.id, status_update.id, "plus-one")
        )

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not StatusUpdateReaction.objects.filter(status_update=status_update, reaction="plus-one").exists()

    @pytest.mark.django_db
    def test_missing_status_rejected(self, member_client, workspace, project, epic):
        response = member_client.post(
            _epic_status_updates_url(workspace.slug, project.id, epic.id),
            {"comment_html": "<p>Missing status</p>"},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert not StatusUpdate.objects.filter(epic=epic, comment_stripped="Missing status").exists()

    @pytest.mark.django_db
    def test_member_patch_and_delete_status_update(self, member_client, workspace, project, epic):
        status_update = StatusUpdate.objects.create(
            workspace=workspace,
            epic=epic,
            status=StatusUpdate.Status.AT_RISK,
            comment_html="<p>Blocked</p>",
        )

        patch_response = member_client.patch(
            _epic_status_updates_url(workspace.slug, project.id, epic.id, status_update.id),
            {"status": StatusUpdate.Status.ON_TRACK, "comment_html": "<p>Unblocked</p>"},
            format="json",
        )
        delete_response = member_client.delete(
            _epic_status_updates_url(workspace.slug, project.id, epic.id, status_update.id)
        )

        assert patch_response.status_code == status.HTTP_200_OK
        status_update.refresh_from_db()
        assert status_update.status == StatusUpdate.Status.ON_TRACK
        assert status_update.comment_stripped == "Unblocked"
        assert delete_response.status_code == status.HTTP_204_NO_CONTENT
        assert not StatusUpdate.objects.filter(id=status_update.id).exists()

    @pytest.mark.django_db
    def test_non_member_cannot_author_403(self, non_member_client, workspace, project, epic):
        response = non_member_client.post(
            _epic_status_updates_url(workspace.slug, project.id, epic.id),
            {"status": StatusUpdate.Status.OFF_TRACK, "comment_html": "<p>Outside</p>"},
            format="json",
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert not StatusUpdate.objects.filter(epic=epic, comment_stripped="Outside").exists()

    @pytest.mark.django_db
    def test_read_requires_viewer_role(self, viewer_client, non_member_client, workspace, project, epic):
        status_update = StatusUpdate.objects.create(
            workspace=workspace,
            epic=epic,
            status=StatusUpdate.Status.ON_TRACK,
            comment_html="<p>Visible</p>",
        )

        viewer_response = viewer_client.get(_epic_status_updates_url(workspace.slug, project.id, epic.id))
        outsider_response = non_member_client.get(_epic_status_updates_url(workspace.slug, project.id, epic.id))

        assert viewer_response.status_code == status.HTTP_200_OK
        assert [row["id"] for row in viewer_response.data] == [status_update.id]
        assert outsider_response.status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db
    def test_reaction_on_deleted_status_update_rejected(self, member_client, workspace, project, epic):
        status_update = StatusUpdate.objects.create(
            workspace=workspace,
            epic=epic,
            status=StatusUpdate.Status.ON_TRACK,
            comment_html="<p>Closed</p>",
        )
        status_update.delete()

        response = member_client.post(
            _epic_status_update_reactions_url(workspace.slug, project.id, epic.id, status_update.id),
            {"reaction": "plus-one"},
            format="json",
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert not StatusUpdateReaction.objects.filter(status_update=status_update).exists()
