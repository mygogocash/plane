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
    Issue,
    IssueLabel,
    IssueProperty,
    IssuePropertyValue,
    IssueType,
    Label,
    Project,
    ProjectIssueType,
    ProjectMember,
    State,
    User,
    WorkItemTemplate,
    WorkspaceMember,
)
from plane.db.models.api import APIToken


def _templates_url(slug, project_id, pk=None):
    base = f"/api/workspaces/{slug}/projects/{project_id}/work-item-templates/"
    return f"{base}{pk}/" if pk else base


def _external_templates_url(slug, project_id):
    return f"/api/v1/workspaces/{slug}/projects/{project_id}/work-item-templates/"


def _issues_url(slug, project_id, template_id=None):
    base = f"/api/workspaces/{slug}/projects/{project_id}/issues/"
    return f"{base}?template_id={template_id}" if template_id else base


@pytest.fixture
def project(workspace, create_user):
    project = Project.objects.create(
        name="Template Project",
        identifier="TPL",
        workspace=workspace,
        created_by=create_user,
    )
    ProjectMember.objects.create(project=project, member=create_user, role=20)
    return project


@pytest.fixture
def issue_type(workspace, project):
    issue_type = IssueType.objects.create(workspace=workspace, name="Bug")
    ProjectIssueType.objects.create(project=project, issue_type=issue_type)
    return issue_type


@pytest.fixture
def story_type(workspace, project):
    issue_type = IssueType.objects.create(workspace=workspace, name="Story")
    ProjectIssueType.objects.create(project=project, issue_type=issue_type)
    return issue_type


@pytest.fixture
def state(project):
    return State.objects.create(name="Todo", project=project, group="unstarted", color="#60646C")


@pytest.fixture
def label(project):
    return Label.objects.create(project=project, name="frontend", color="#46A758")


@pytest.fixture
def issue_property(issue_type):
    return IssueProperty.objects.create(
        issue_type=issue_type,
        name="version",
        display_name="Version",
        property_type=IssueProperty.PropertyType.TEXT,
    )


@pytest.fixture
def member_user(db, workspace, project):
    user = User.objects.create(email="template-member@plane.so", username="template_member")
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
    user = User.objects.create(email="template-guest@plane.so", username="template_guest")
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=5)
    ProjectMember.objects.create(project=project, member=user, role=5)
    return user


@pytest.fixture
def guest_client(guest_user):
    client = APIClient()
    client.force_authenticate(user=guest_user)
    return client


@pytest.mark.contract
class TestWorkItemTemplateAPI:
    @pytest.mark.django_db
    def test_member_creates_template_sanitizes_html_and_persists(self, member_client, workspace, project, issue_type):
        response = member_client.post(
            _templates_url(workspace.slug, project.id),
            {
                "name": "Bug report",
                "description_html": "<p>Setup</p><script>alert(1)</script>",
                "template_data": {"property_values": {"free_text": "<b>unsafe</b>"}},
                "issue_type": str(issue_type.id),
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        template = WorkItemTemplate.objects.get(project=project, name="Bug report")
        assert template.workspace_id == workspace.id
        assert template.description_html == "Setupalert(1)"
        assert template.template_data["property_values"]["free_text"] == "unsafe"
        assert template.issue_type_id == issue_type.id

    @pytest.mark.django_db
    def test_blank_template_name_rejected_400(self, session_client, workspace, project):
        response = session_client.post(
            _templates_url(workspace.slug, project.id),
            {"name": "   ", "description_html": "<p></p>", "template_data": {}},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert not WorkItemTemplate.objects.filter(project=project).exists()

    @pytest.mark.django_db
    def test_guest_cannot_create_template_403(self, guest_client, workspace, project):
        response = guest_client.post(
            _templates_url(workspace.slug, project.id),
            {"name": "Guest template", "description_html": "<p></p>", "template_data": {}},
            format="json",
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert not WorkItemTemplate.objects.filter(project=project).exists()

    @pytest.mark.django_db
    def test_templates_filter_by_issue_type(self, member_client, workspace, project, issue_type, story_type):
        bug_template = WorkItemTemplate.objects.create(project=project, name="Bug", issue_type=issue_type)
        WorkItemTemplate.objects.create(project=project, name="Story", issue_type=story_type)

        response = member_client.get(f"{_templates_url(workspace.slug, project.id)}?issue_type={issue_type.id}")

        assert response.status_code == status.HTTP_200_OK
        assert [str(row["id"]) for row in response.data] == [str(bug_template.id)]

    @pytest.mark.django_db
    def test_empty_templates_list_returns_200_empty(self, member_client, workspace, project):
        response = member_client.get(_templates_url(workspace.slug, project.id))

        assert response.status_code == status.HTTP_200_OK
        assert response.data == []

    @pytest.mark.django_db
    def test_create_issue_from_template_hydrates_fields(
        self, session_client, workspace, project, issue_type, state, label, issue_property
    ):
        template = WorkItemTemplate.objects.create(
            project=project,
            name="Hydrate",
            issue_type=issue_type,
            template_data={
                "name": "Hydrated issue",
                "priority": "high",
                "state_id": str(state.id),
                "label_ids": [str(label.id)],
                "property_values": {str(issue_property.id): "<b>1.4.0</b>"},
                "sub_items": [{"name": "Write checklist"}],
            },
        )

        response = session_client.post(_issues_url(workspace.slug, project.id, template.id), {}, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        issue = Issue.objects.get(project=project, name="Hydrated issue")
        assert issue.priority == "high"
        assert issue.state_id == state.id
        assert issue.type_id == issue_type.id
        assert IssueLabel.objects.filter(issue=issue, label=label).exists()
        assert IssuePropertyValue.objects.get(issue=issue, property=issue_property).value == "1.4.0"
        assert Issue.objects.filter(parent=issue, name="Write checklist").exists()
        assert response.data["sub_issues_count"] == 1

    @pytest.mark.django_db
    def test_create_from_template_skips_missing_refs_and_warns(self, session_client, workspace, project):
        other_project = Project.objects.create(
            name="Other Template Project",
            identifier="OTP",
            workspace=workspace,
            created_by=project.created_by,
        )
        other_state = State.objects.create(name="Other", project=other_project, group="unstarted", color="#60646C")
        other_label = Label.objects.create(project=other_project, name="other", color="#46A758")
        other_user = User.objects.create(email="other-assignee@plane.so", username="other_assignee")
        template = WorkItemTemplate.objects.create(
            project=project,
            name="Missing refs",
            template_data={
                "name": "Issue with skipped refs",
                "state_id": str(other_state.id),
                "label_ids": [str(other_label.id)],
                "assignee_ids": [str(other_user.id)],
            },
        )

        response = session_client.post(_issues_url(workspace.slug, project.id, template.id), {}, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        issue = Issue.objects.get(project=project, name="Issue with skipped refs")
        assert issue.state_id is None
        assert not IssueLabel.objects.filter(issue=issue).exists()
        warning_fields = {warning["field"] for warning in response.data["warnings"]}
        assert {"state_id", "label_ids", "assignee_ids"}.issubset(warning_fields)

    @pytest.mark.django_db
    def test_template_id_other_project_rejected(self, session_client, workspace, project):
        other_project = Project.objects.create(
            name="Cross Project",
            identifier="CRP",
            workspace=workspace,
            created_by=project.created_by,
        )
        template = WorkItemTemplate.objects.create(
            project=other_project,
            name="Cross-project template",
            template_data={"name": "Should not create"},
        )

        response = session_client.post(_issues_url(workspace.slug, project.id, template.id), {}, format="json")

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert not Issue.objects.filter(project=project, name="Should not create").exists()

    @pytest.mark.django_db
    def test_deactivated_template_excluded_from_active_lists(self, member_client, workspace, project):
        template = WorkItemTemplate.objects.create(project=project, name="Reusable")

        patch_response = member_client.patch(
            _templates_url(workspace.slug, project.id, template.id),
            {"is_active": False},
            format="json",
        )
        active_response = member_client.get(_templates_url(workspace.slug, project.id))
        manager_response = member_client.get(f"{_templates_url(workspace.slug, project.id)}?include_inactive=true")

        assert patch_response.status_code == status.HTTP_200_OK
        assert active_response.status_code == status.HTTP_200_OK
        assert active_response.data == []
        assert [str(row["id"]) for row in manager_response.data] == [str(template.id)]

    @pytest.mark.django_db
    def test_delete_template_soft_deletes(self, member_client, workspace, project):
        template = WorkItemTemplate.objects.create(project=project, name="Delete me")

        response = member_client.delete(_templates_url(workspace.slug, project.id, template.id))

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not WorkItemTemplate.objects.filter(pk=template.id).exists()
        assert WorkItemTemplate.all_objects.get(pk=template.id).deleted_at is not None

    @pytest.mark.django_db
    def test_external_templates_read_only_lists_active(self, api_key_client, workspace, project):
        active = WorkItemTemplate.objects.create(project=project, name="External active")
        WorkItemTemplate.objects.create(project=project, name="External inactive", is_active=False)

        get_response = api_key_client.get(_external_templates_url(workspace.slug, project.id))
        post_response = api_key_client.post(
            _external_templates_url(workspace.slug, project.id),
            {"name": "No write"},
            format="json",
        )

        assert get_response.status_code == status.HTTP_200_OK
        assert [str(row["id"]) for row in get_response.data] == [str(active.id)]
        assert post_response.status_code == status.HTTP_405_METHOD_NOT_ALLOWED

    @pytest.mark.django_db
    def test_external_templates_requires_project_membership(self, workspace, project):
        outsider = User.objects.create(email="template-outsider@plane.so", username="template_outsider")
        token = APIToken.objects.create(user=outsider, label="Outsider", token="template-outsider-token")
        client = APIClient()
        client.credentials(HTTP_X_API_KEY=token.token)

        response = client.get(_external_templates_url(workspace.slug, project.id))

        assert response.status_code == status.HTTP_403_FORBIDDEN
