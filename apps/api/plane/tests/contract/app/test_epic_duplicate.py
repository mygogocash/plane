# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import (
    Issue,
    IssueActivity,
    IssueAssignee,
    IssueLabel,
    IssueType,
    Label,
    Project,
    ProjectIssueType,
    ProjectMember,
    State,
    User,
    Workspace,
    WorkspaceMember,
)


def _duplicate_url(slug, project_id, epic_id):
    return f"/api/workspaces/{slug}/projects/{project_id}/epics/{epic_id}/duplicate/"


@pytest.fixture
def project(workspace, create_user):
    project = Project.objects.create(
        name="Epic Duplicate Project",
        identifier="EDP",
        workspace=workspace,
        created_by=create_user,
    )
    ProjectMember.objects.create(project=project, member=create_user, role=20)
    return project


@pytest.fixture
def state(project):
    state = State.objects.create(name="Source Todo", project=project, group="unstarted", color="#60646C", default=True)
    project.default_state = state
    project.save()
    return state


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
    user = User.objects.create(email="epic-duplicate-member@plane.so", username="epic_duplicate_member")
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
    user = User.objects.create(email="epic-duplicate-viewer@plane.so", username="epic_duplicate_viewer")
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
    return Issue.objects.create(
        project=project,
        type=epic_type,
        state=state,
        name="Roadmap",
        description_html="<p>Ship the roadmap</p>",
        description_stripped="Ship the roadmap",
        created_by=create_user,
    )


@pytest.fixture
def work_item(project, state, story_type, create_user):
    return Issue.objects.create(project=project, type=story_type, state=state, name="Build UI", created_by=create_user)


def _create_target_project(workspace_owner, member_user, slug="target-duplicate-workspace"):
    target_workspace = Workspace.objects.create(
        name="Target Workspace",
        owner=workspace_owner,
        slug=slug,
    )
    WorkspaceMember.objects.create(workspace=target_workspace, member=member_user, role=15)
    target_project = Project.objects.create(
        name="Target Project",
        identifier="TDP",
        workspace=target_workspace,
        default_assignee=member_user,
        created_by=workspace_owner,
    )
    ProjectMember.objects.create(project=target_project, member=member_user, role=15)
    target_state = State.objects.create(
        name="Target Todo",
        project=target_project,
        group="unstarted",
        color="#60646C",
        default=True,
    )
    target_project.default_state = target_state
    target_project.save()
    target_epic_type = IssueType.objects.create(workspace=target_workspace, name="Epic", is_epic=True)
    ProjectIssueType.objects.create(project=target_project, issue_type=target_epic_type, is_default=True)
    return target_workspace, target_project, target_state


@pytest.mark.contract
class TestEpicDuplicate:
    @pytest.mark.django_db
    def test_duplicate_into_same_project_copies_epic(self, member_client, workspace, project, epic):
        response = member_client.post(
            _duplicate_url(workspace.slug, project.id, epic.id),
            {},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        duplicated = Issue.objects.get(id=response.data["epic_id"])
        assert duplicated.id != epic.id
        assert duplicated.project_id == project.id
        assert duplicated.type_id == epic.type_id
        assert duplicated.state_id == epic.state_id
        assert duplicated.name == epic.name
        assert response.data["remap_summary"] == []
        assert IssueActivity.objects.filter(
            issue=duplicated,
            field="duplicate",
            verb="created",
            old_identifier=epic.id,
            new_identifier=duplicated.id,
        ).exists()

    @pytest.mark.django_db
    def test_duplicate_with_subtree_copies_children(self, member_client, workspace, project, epic, work_item):
        work_item.parent = epic
        work_item.save()

        response = member_client.post(
            _duplicate_url(workspace.slug, project.id, epic.id),
            {"include_subtree": True},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        duplicated = Issue.objects.get(id=response.data["epic_id"])
        duplicated_child = Issue.objects.get(id=response.data["child_issue_ids"][0])
        assert duplicated_child.id != work_item.id
        assert duplicated_child.parent_id == duplicated.id
        assert duplicated_child.type_id == work_item.type_id
        assert duplicated_child.name == work_item.name

    @pytest.mark.django_db
    def test_duplicate_cross_workspace_remaps_state_label_member_to_target_defaults_and_returns_summary(
        self, member_client, workspace, project, epic, member_user, create_user
    ):
        source_label = Label.objects.create(workspace=workspace, project=project, name="Backend", color="#2F80ED")
        IssueLabel.objects.create(project=project, issue=epic, label=source_label)
        source_assignee = User.objects.create(email="source-assignee@plane.so", username="source_assignee")
        WorkspaceMember.objects.create(workspace=workspace, member=source_assignee, role=15)
        ProjectMember.objects.create(project=project, member=source_assignee, role=15)
        IssueAssignee.objects.create(project=project, issue=epic, assignee=source_assignee)
        target_workspace, target_project, target_state = _create_target_project(create_user, member_user)

        response = member_client.post(
            _duplicate_url(workspace.slug, project.id, epic.id),
            {
                "target_project_id": str(target_project.id),
                "target_workspace_slug": target_workspace.slug,
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        duplicated = Issue.objects.get(id=response.data["epic_id"])
        assert duplicated.workspace_id == target_workspace.id
        assert duplicated.project_id == target_project.id
        assert duplicated.state_id == target_state.id
        assert not IssueLabel.objects.filter(issue=duplicated, label_id=source_label.id).exists()
        assert not IssueLabel.objects.filter(issue=duplicated).exists()
        duplicated_assignee = IssueAssignee.objects.get(issue=duplicated)
        assert duplicated_assignee.assignee_id == member_user.id
        assert duplicated_assignee.assignee_id != source_assignee.id
        assert {entry["field"] for entry in response.data["remap_summary"]} == {"state", "label", "assignee"}

    @pytest.mark.django_db
    def test_duplicate_cross_workspace_without_compatible_issue_type_returns_safe_error(
        self, member_client, workspace, project, epic, member_user, create_user
    ):
        target_workspace, target_project, _ = _create_target_project(
            create_user,
            member_user,
            slug="target-duplicate-workspace-no-issue-type",
        )
        ProjectIssueType.objects.filter(project=target_project).delete()

        response = member_client.post(
            _duplicate_url(workspace.slug, project.id, epic.id),
            {
                "target_project_id": str(target_project.id),
                "target_workspace_slug": target_workspace.slug,
            },
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["error"] == "Target project is missing a compatible issue type"
        assert not Issue.objects.filter(project=target_project, name=epic.name).exists()

    @pytest.mark.django_db
    def test_duplicate_requires_edit_role_on_source_and_target(
        self, viewer_client, member_client, workspace, project, epic, member_user, create_user
    ):
        viewer_response = viewer_client.post(
            _duplicate_url(workspace.slug, project.id, epic.id),
            {},
            format="json",
        )

        assert viewer_response.status_code == status.HTTP_403_FORBIDDEN

        target_workspace, target_project, _ = _create_target_project(
            create_user,
            member_user,
            slug="target-duplicate-workspace-no-role",
        )
        ProjectMember.objects.filter(project=target_project, member=member_user).delete()
        member_response = member_client.post(
            _duplicate_url(workspace.slug, project.id, epic.id),
            {
                "target_project_id": str(target_project.id),
                "target_workspace_slug": target_workspace.slug,
            },
            format="json",
        )

        assert member_response.status_code == status.HTTP_403_FORBIDDEN
        assert not Issue.objects.filter(project=target_project, name=epic.name).exists()
