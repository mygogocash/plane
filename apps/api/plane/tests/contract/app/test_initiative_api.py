# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import pytest

# Third party imports
from rest_framework import status
from rest_framework.test import APIClient

# Module imports
from plane.db.models import (
    Initiative,
    InitiativeEpic,
    InitiativeProject,
    Issue,
    IssueType,
    Project,
    ProjectIssueType,
    State,
    User,
    Workspace,
    WorkspaceMember,
)


def _initiatives_url(slug, pk=None):
    base = f"/api/workspaces/{slug}/initiatives/"
    return f"{base}{pk}/" if pk else base


def _initiative_epics_url(slug, initiative_id):
    return f"/api/workspaces/{slug}/initiatives/{initiative_id}/epics/"


def _initiative_projects_url(slug, initiative_id):
    return f"/api/workspaces/{slug}/initiatives/{initiative_id}/projects/"


def _initiative_progress_url(slug, initiative_id):
    return f"/api/workspaces/{slug}/initiatives/{initiative_id}/progress/"


def _initiatives_summary_url(slug):
    return f"/api/workspaces/{slug}/initiatives-summary/"


@pytest.fixture
def member_user(db, workspace):
    user = User.objects.create(email="initiative-member@plane.so", username="initiative_member")
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=15)
    return user


@pytest.fixture
def member_client(member_user):
    client = APIClient()
    client.force_authenticate(user=member_user)
    return client


@pytest.fixture
def viewer_user(db, workspace):
    user = User.objects.create(email="initiative-viewer@plane.so", username="initiative_viewer")
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=5)
    return user


@pytest.fixture
def viewer_client(viewer_user):
    client = APIClient()
    client.force_authenticate(user=viewer_user)
    return client


@pytest.fixture
def non_member_client(db):
    user = User.objects.create(email="initiative-non-member@plane.so", username="initiative_non_member")
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def project(workspace, create_user):
    return Project.objects.create(
        name="Initiative Epic Project",
        identifier="IEP",
        workspace=workspace,
        created_by=create_user,
    )


@pytest.fixture
def direct_project(workspace, create_user):
    return Project.objects.create(
        name="Initiative Direct Project",
        identifier="IDP",
        workspace=workspace,
        created_by=create_user,
    )


@pytest.fixture
def epic_type(workspace, project, direct_project):
    issue_type = IssueType.objects.create(workspace=workspace, name="Epic", is_epic=True)
    ProjectIssueType.objects.create(project=project, issue_type=issue_type, is_default=True)
    ProjectIssueType.objects.create(project=direct_project, issue_type=issue_type, is_default=True)
    return issue_type


@pytest.fixture
def story_type(workspace, project, direct_project):
    issue_type = IssueType.objects.create(workspace=workspace, name="Story", is_epic=False)
    ProjectIssueType.objects.create(project=project, issue_type=issue_type)
    ProjectIssueType.objects.create(project=direct_project, issue_type=issue_type)
    return issue_type


@pytest.fixture
def state_factory():
    def _create(project, name, group):
        return State.objects.create(name=name, project=project, group=group, color="#60646C")

    return _create


@pytest.fixture
def epic(project, epic_type, state_factory, create_user):
    state = state_factory(project, "Backlog", "backlog")
    return Issue.objects.create(
        project=project,
        type=epic_type,
        state=state,
        name="Platform launch",
        created_by=create_user,
    )


def _create_work_item(project, story_type, state, name, create_user, parent=None):
    return Issue.objects.create(
        project=project,
        type=story_type,
        state=state,
        parent=parent,
        name=name,
        created_by=create_user,
    )


@pytest.mark.contract
class TestInitiativeAPI:
    @pytest.mark.django_db
    def test_member_create_initiative_attach_epics_project_and_progress_rollup(
        self,
        member_client,
        workspace,
        project,
        direct_project,
        epic,
        story_type,
        state_factory,
        create_user,
    ):
        create_response = member_client.post(
            _initiatives_url(workspace.slug),
            {
                "name": "Q3 market expansion",
                "description_html": "<p>Expand</p><script>alert(1)</script>",
                "state": Initiative.State.ACTIVE,
            },
            format="json",
        )

        assert create_response.status_code == status.HTTP_201_CREATED
        initiative_id = create_response.data["id"]
        initiative = Initiative.objects.get(id=initiative_id)
        assert initiative.state == Initiative.State.ACTIVE
        assert "<script" not in initiative.description_html
        assert initiative.description_stripped == "Expand"

        epic_attach_response = member_client.post(
            _initiative_epics_url(workspace.slug, initiative_id),
            {"epic_ids": [str(epic.id)]},
            format="json",
        )
        project_attach_response = member_client.post(
            _initiative_projects_url(workspace.slug, initiative_id),
            {"project_ids": [str(direct_project.id)]},
            format="json",
        )

        assert epic_attach_response.status_code == status.HTTP_200_OK
        assert project_attach_response.status_code == status.HTTP_200_OK
        assert InitiativeEpic.objects.filter(initiative=initiative, epic=epic, deleted_at__isnull=True).exists()
        assert InitiativeProject.objects.filter(
            initiative=initiative,
            project=direct_project,
            deleted_at__isnull=True,
        ).exists()

        completed = state_factory(project, "Done", "completed")
        started = state_factory(project, "Doing", "started")
        direct_completed = state_factory(direct_project, "Direct Done", "completed")
        _create_work_item(project, story_type, completed, "Finished epic child", create_user, parent=epic)
        _create_work_item(project, story_type, started, "Started epic child", create_user, parent=epic)
        _create_work_item(direct_project, story_type, direct_completed, "Finished project item", create_user)

        progress_response = member_client.get(_initiative_progress_url(workspace.slug, initiative_id))

        assert progress_response.status_code == status.HTTP_200_OK
        assert progress_response.data["counts_by_group"]["completed"] == 2
        assert progress_response.data["counts_by_group"]["started"] == 1
        assert progress_response.data["total_count"] == 3
        assert progress_response.data["percent_complete"] == 66.67

        detach_response = member_client.delete(
            _initiative_projects_url(workspace.slug, initiative_id),
            {"project_ids": [str(direct_project.id)]},
            format="json",
        )

        assert detach_response.status_code == status.HTTP_200_OK
        assert not InitiativeProject.objects.filter(
            initiative=initiative,
            project=direct_project,
            deleted_at__isnull=True,
        ).exists()

    @pytest.mark.django_db
    def test_attach_cross_workspace_epic_returns_400(self, member_client, workspace, create_user):
        initiative = Initiative.objects.create(workspace=workspace, name="Cross workspace guard")
        other_workspace = Workspace.objects.create(
            name="Other Initiative Workspace",
            slug="other-initiative-workspace",
            owner=create_user,
        )
        other_project = Project.objects.create(
            name="Other Project",
            identifier="OIP",
            workspace=other_workspace,
            created_by=create_user,
        )
        other_epic_type = IssueType.objects.create(workspace=other_workspace, name="Other Epic", is_epic=True)
        ProjectIssueType.objects.create(project=other_project, issue_type=other_epic_type)
        other_state = State.objects.create(
            name="Other Todo",
            project=other_project,
            group="unstarted",
            color="#60646C",
        )
        other_epic = Issue.objects.create(
            project=other_project,
            type=other_epic_type,
            state=other_state,
            name="Foreign epic",
            created_by=create_user,
        )

        response = member_client.post(
            _initiative_epics_url(workspace.slug, initiative.id),
            {"epic_ids": [str(other_epic.id)]},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert not InitiativeEpic.objects.filter(initiative=initiative, epic=other_epic).exists()

    @pytest.mark.django_db
    def test_viewer_cannot_write_or_attach_403(self, viewer_client, workspace, epic):
        create_response = viewer_client.post(
            _initiatives_url(workspace.slug),
            {"name": "Viewer cannot create"},
            format="json",
        )
        initiative = Initiative.objects.create(workspace=workspace, name="Read only")
        attach_response = viewer_client.post(
            _initiative_epics_url(workspace.slug, initiative.id),
            {"epic_ids": [str(epic.id)]},
            format="json",
        )
        list_response = viewer_client.get(_initiatives_url(workspace.slug))

        assert create_response.status_code == status.HTTP_403_FORBIDDEN
        assert attach_response.status_code == status.HTTP_403_FORBIDDEN
        assert list_response.status_code == status.HTTP_200_OK

    @pytest.mark.django_db
    def test_non_member_403(self, non_member_client, workspace):
        response = non_member_client.get(_initiatives_url(workspace.slug))

        assert response.status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db
    def test_progress_skips_converted_or_deleted_member_epic(
        self, member_client, workspace, epic, story_type, state_factory, create_user
    ):
        initiative = Initiative.objects.create(workspace=workspace, name="Progress cleanup")
        membership = InitiativeEpic.objects.create(initiative=initiative, epic=epic)
        completed = state_factory(epic.project, "Done", "completed")
        _create_work_item(epic.project, story_type, completed, "Finished child", create_user, parent=epic)
        epic.type = story_type
        epic.save(update_fields=["type"])

        response = member_client.get(_initiative_progress_url(workspace.slug, initiative.id))

        assert response.status_code == status.HTTP_200_OK
        assert response.data["total_count"] == 0
        assert response.data["percent_complete"] == 0
        membership.refresh_from_db()
        assert membership.deleted_at is not None

    @pytest.mark.django_db
    def test_initiatives_summary_groups_by_five_lifecycle_states(self, member_client, workspace):
        for initiative_state in Initiative.State.values:
            Initiative.objects.create(
                workspace=workspace,
                name=f"{initiative_state.title()} initiative",
                state=initiative_state,
            )

        response = member_client.get(_initiatives_summary_url(workspace.slug))

        assert response.status_code == status.HTTP_200_OK
        assert set(response.data.keys()) == set(Initiative.State.values)
        assert {row["state"] for row in response.data[Initiative.State.DRAFT]} == {Initiative.State.DRAFT}
        assert all("progress" in row for rows in response.data.values() for row in rows)
