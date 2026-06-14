# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from rest_framework import status
from rest_framework.test import APIClient

# Module imports
from plane.db.models import (
    Issue,
    IssueActivity,
    IssueProperty,
    IssuePropertyOption,
    IssuePropertyValue,
    IssueType,
    Project,
    ProjectIssueType,
    ProjectMember,
    State,
    User,
    WorkspaceMember,
)


def _properties_url(slug, issue_type_id, pk=None):
    base = f"/api/workspaces/{slug}/issue-types/{issue_type_id}/properties/"
    return f"{base}{pk}/" if pk else base


def _property_options_url(slug, issue_type_id, property_id):
    return f"/api/workspaces/{slug}/issue-types/{issue_type_id}/properties/{property_id}/options/"


def _issue_url(slug, project_id, issue_id):
    return f"/api/workspaces/{slug}/projects/{project_id}/issues/{issue_id}/"


def _issues_url(slug, project_id):
    return f"/api/workspaces/{slug}/projects/{project_id}/issues/"


def _epic_property_values_url(slug, project_id, epic_id):
    return f"/api/workspaces/{slug}/projects/{project_id}/epics/{epic_id}/property-values/"


@pytest.fixture
def project(workspace, create_user):
    project = Project.objects.create(
        name="Issue Property Project",
        identifier="IPP",
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
def epic_type(workspace, project):
    issue_type = IssueType.objects.create(workspace=workspace, name="Epic", is_epic=True)
    ProjectIssueType.objects.create(project=project, issue_type=issue_type, is_default=True)
    return issue_type


@pytest.fixture
def content_type(workspace, project):
    issue_type = IssueType.objects.create(workspace=workspace, name="Content")
    ProjectIssueType.objects.create(project=project, issue_type=issue_type)
    return issue_type


@pytest.fixture
def state(project):
    return State.objects.create(name="Todo", project=project, group="unstarted", color="#60646C")


@pytest.fixture
def issue(workspace, project, state, issue_type, create_user):
    return Issue.objects.create(
        name="Regression in checkout",
        workspace=workspace,
        project=project,
        state=state,
        type=issue_type,
        created_by=create_user,
    )


@pytest.fixture
def epic(workspace, project, state, epic_type, create_user):
    return Issue.objects.create(
        name="Launch mobile rollout",
        workspace=workspace,
        project=project,
        state=state,
        type=epic_type,
        created_by=create_user,
    )


@pytest.fixture
def member_user(db, workspace, project):
    user = User.objects.create(email="property-member@plane.so", username="property_member")
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
    user = User.objects.create(email="property-guest@plane.so", username="property_guest")
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=5)
    ProjectMember.objects.create(project=project, member=user, role=5)
    return user


@pytest.fixture
def guest_client(guest_user):
    client = APIClient()
    client.force_authenticate(user=guest_user)
    return client


@pytest.fixture
def non_member_user(db):
    return User.objects.create(email="property-outsider@plane.so", username="property_outsider")


@pytest.mark.contract
class TestIssuePropertyAPI:
    @pytest.mark.django_db
    def test_admin_creates_select_property_persists_and_logs_activity(
        self, session_client, workspace, issue_type, project
    ):
        response = session_client.post(
            _properties_url(workspace.slug, issue_type.id),
            {
                "name": "version",
                "display_name": "Version",
                "property_type": "select",
                "settings": {"options": [{"label": "1.4.0", "value": "1.4.0"}]},
                "is_required": True,
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        issue_property = IssueProperty.objects.get(issue_type=issue_type, name="version")
        assert issue_property.workspace_id == workspace.id
        assert issue_property.settings["options"][0]["value"] == "1.4.0"
        assert IssueActivity.objects.filter(
            project=project,
            issue__isnull=True,
            field="issue_property",
            verb="created",
            new_identifier=issue_property.id,
        ).exists()

    @pytest.mark.django_db
    def test_invalid_property_type_rejected_400(self, session_client, workspace, issue_type):
        response = session_client.post(
            _properties_url(workspace.slug, issue_type.id),
            {"name": "version", "display_name": "Version", "property_type": "frobnicate"},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert not IssueProperty.objects.filter(issue_type=issue_type).exists()

    @pytest.mark.django_db
    def test_select_without_options_rejected_400(self, session_client, workspace, issue_type):
        response = session_client.post(
            _properties_url(workspace.slug, issue_type.id),
            {"name": "version", "display_name": "Version", "property_type": "select", "settings": {"options": []}},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert not IssueProperty.objects.filter(issue_type=issue_type).exists()

    @pytest.mark.django_db
    def test_duplicate_property_name_rejected_409(self, session_client, workspace, issue_type):
        IssueProperty.objects.create(
            issue_type=issue_type,
            name="version",
            display_name="Version",
            property_type=IssueProperty.PropertyType.TEXT,
        )

        response = session_client.post(
            _properties_url(workspace.slug, issue_type.id),
            {"name": "version", "display_name": "Version", "property_type": "text"},
            format="json",
        )

        assert response.status_code == status.HTTP_409_CONFLICT

    @pytest.mark.django_db
    def test_project_member_can_create_property_definition_and_guest_cannot(
        self, member_client, guest_client, workspace, issue_type
    ):
        payload = {"name": "version", "display_name": "Version", "property_type": "text"}

        member_response = member_client.post(_properties_url(workspace.slug, issue_type.id), payload, format="json")
        guest_response = guest_client.post(_properties_url(workspace.slug, issue_type.id), payload, format="json")

        assert member_response.status_code == status.HTTP_201_CREATED
        assert guest_response.status_code == status.HTTP_403_FORBIDDEN
        assert IssueProperty.objects.filter(issue_type=issue_type, name="version").exists()

    @pytest.mark.django_db
    def test_define_epic_properties_options_and_set_values_persist_and_reload(
        self, member_client, workspace, project, epic, epic_type, member_user
    ):
        text_response = member_client.post(
            _properties_url(workspace.slug, epic_type.id),
            {
                "name": "launch-summary",
                "display_name": "Launch summary",
                "property_type": "text",
                "is_required": True,
            },
            format="json",
        )
        option_response = member_client.post(
            _properties_url(workspace.slug, epic_type.id),
            {
                "name": "launch-tier",
                "display_name": "Launch tier",
                "property_type": "option",
                "is_multi": True,
            },
            format="json",
        )
        member_response = member_client.post(
            _properties_url(workspace.slug, epic_type.id),
            {
                "name": "release-owner",
                "display_name": "Release owner",
                "property_type": "member",
            },
            format="json",
        )

        assert text_response.status_code == status.HTTP_201_CREATED
        assert option_response.status_code == status.HTTP_201_CREATED
        assert member_response.status_code == status.HTTP_201_CREATED

        text_property_id = str(text_response.data["id"])
        option_property_id = str(option_response.data["id"])
        member_property_id = str(member_response.data["id"])
        beta_option_response = member_client.post(
            _property_options_url(workspace.slug, epic_type.id, option_property_id),
            {"name": "Beta", "sort_order": 10, "is_default": True},
            format="json",
        )
        ga_option_response = member_client.post(
            _property_options_url(workspace.slug, epic_type.id, option_property_id),
            {"name": "GA", "sort_order": 20},
            format="json",
        )

        assert beta_option_response.status_code == status.HTTP_201_CREATED
        assert ga_option_response.status_code == status.HTTP_201_CREATED
        properties_reload_response = member_client.get(_properties_url(workspace.slug, epic_type.id))

        assert properties_reload_response.status_code == status.HTTP_200_OK
        reloaded_option_property = next(
            item for item in properties_reload_response.data if str(item["id"]) == option_property_id
        )
        assert reloaded_option_property["settings"]["options"] == [
            {
                "id": beta_option_response.data["id"],
                "is_default": True,
                "label": "Beta",
                "name": "Beta",
                "sort_order": 10.0,
                "value": beta_option_response.data["id"],
            },
            {
                "id": ga_option_response.data["id"],
                "is_default": False,
                "label": "GA",
                "name": "GA",
                "sort_order": 20.0,
                "value": ga_option_response.data["id"],
            },
        ]

        property_values = {
            text_property_id: "<b>Launch in Q3</b>",
            option_property_id: [str(beta_option_response.data["id"]), str(ga_option_response.data["id"])],
            member_property_id: str(member_user.id),
        }
        set_response = member_client.post(
            _epic_property_values_url(workspace.slug, project.id, epic.id),
            {"property_values": property_values},
            format="json",
        )
        reload_response = member_client.get(_epic_property_values_url(workspace.slug, project.id, epic.id))

        assert set_response.status_code == status.HTTP_200_OK
        assert reload_response.status_code == status.HTTP_200_OK
        assert set_response.data["property_values"][text_property_id] == "Launch in Q3"
        assert reload_response.data["property_values"] == set_response.data["property_values"]
        assert IssuePropertyOption.objects.filter(property_id=option_property_id).count() == 2
        assert IssuePropertyValue.objects.get(issue=epic, property_id=text_property_id).value_text == ("Launch in Q3")
        assert IssuePropertyValue.objects.get(issue=epic, property_id=member_property_id).value_uuid == member_user.id

    @pytest.mark.django_db
    def test_epic_required_property_missing_value_rejected(self, member_client, workspace, project, epic, epic_type):
        required_property = IssueProperty.objects.create(
            issue_type=epic_type,
            name="launch-summary",
            display_name="Launch summary",
            property_type=IssueProperty.PropertyType.TEXT,
            is_required=True,
        )

        response = member_client.post(
            _epic_property_values_url(workspace.slug, project.id, epic.id),
            {"property_values": {}},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["property_values"]["missing_required"] == [required_property.name]
        assert not IssuePropertyValue.objects.filter(issue=epic, property=required_property).exists()

    @pytest.mark.django_db
    def test_epic_member_value_uuid_must_be_workspace_member(
        self, member_client, workspace, project, epic, epic_type, non_member_user
    ):
        member_property = IssueProperty.objects.create(
            issue_type=epic_type,
            name="release-owner",
            display_name="Release owner",
            property_type=IssueProperty.PropertyType.MEMBER,
        )

        response = member_client.post(
            _epic_property_values_url(workspace.slug, project.id, epic.id),
            {"property_values": {str(member_property.id): str(non_member_user.id)}},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["property_values"][str(member_property.id)] == "member_not_in_workspace"
        assert not IssuePropertyValue.objects.filter(issue=epic, property=member_property).exists()

    @pytest.mark.django_db
    def test_epic_property_value_write_requires_edit_role(self, guest_client, workspace, project, epic, epic_type):
        text_property = IssueProperty.objects.create(
            issue_type=epic_type,
            name="launch-summary",
            display_name="Launch summary",
            property_type=IssueProperty.PropertyType.TEXT,
        )

        response = guest_client.post(
            _epic_property_values_url(workspace.slug, project.id, epic.id),
            {"property_values": {str(text_property.id): "Launch in Q3"}},
            format="json",
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert not IssuePropertyValue.objects.filter(issue=epic, property=text_property).exists()

    @pytest.mark.django_db
    def test_empty_properties_list_returns_200_empty(self, member_client, workspace, issue_type):
        response = member_client.get(_properties_url(workspace.slug, issue_type.id))

        assert response.status_code == status.HTTP_200_OK
        assert response.data == []

    @pytest.mark.django_db
    def test_member_sets_property_value_upserts_sanitizes_returns_and_logs(
        self, member_client, workspace, project, issue
    ):
        issue_property = IssueProperty.objects.create(
            issue_type=issue.type,
            name="version",
            display_name="Version",
            property_type=IssueProperty.PropertyType.TEXT,
        )

        first_response = member_client.patch(
            _issue_url(workspace.slug, project.id, issue.id),
            {"property_values": {str(issue_property.id): "<b>1.4.0</b>"}},
            format="json",
        )
        second_response = member_client.patch(
            _issue_url(workspace.slug, project.id, issue.id),
            {"property_values": {str(issue_property.id): "1.4.1"}},
            format="json",
        )

        assert first_response.status_code == status.HTTP_204_NO_CONTENT
        assert second_response.status_code == status.HTTP_204_NO_CONTENT
        value = IssuePropertyValue.objects.get(issue=issue, property=issue_property)
        assert value.value == "1.4.1"
        assert IssuePropertyValue.objects.filter(issue=issue, property=issue_property).count() == 1
        assert IssueActivity.objects.filter(
            issue=issue,
            field="property_values",
            verb="updated",
            new_identifier=issue_property.id,
        ).exists()

        detail_response = member_client.get(_issue_url(workspace.slug, project.id, issue.id))
        assert detail_response.status_code == status.HTTP_200_OK
        assert detail_response.data["property_values"][str(issue_property.id)] == "1.4.1"

    @pytest.mark.django_db
    def test_missing_required_property_value_rejected_400(self, session_client, workspace, project, issue_type, state):
        IssueProperty.objects.create(
            issue_type=issue_type,
            name="version",
            display_name="Version",
            property_type=IssueProperty.PropertyType.TEXT,
            is_required=True,
        )

        response = session_client.post(
            _issues_url(workspace.slug, project.id),
            {"name": "Missing required custom field", "state_id": str(state.id), "type": str(issue_type.id)},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["property_values"]["missing_required"] == ["version"]

    @pytest.mark.django_db
    def test_property_values_cross_type_rejected_400(self, member_client, workspace, project, issue, content_type):
        content_property = IssueProperty.objects.create(
            issue_type=content_type,
            name="channel",
            display_name="Channel",
            property_type=IssueProperty.PropertyType.TEXT,
        )

        response = member_client.patch(
            _issue_url(workspace.slug, project.id, issue.id),
            {"property_values": {str(content_property.id): "release-notes"}},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["property_values"][str(content_property.id)] == "property_not_for_type"
        assert not IssuePropertyValue.objects.filter(issue=issue).exists()

    @pytest.mark.django_db
    def test_guest_cannot_set_property_value_403(self, guest_client, workspace, project, issue):
        issue_property = IssueProperty.objects.create(
            issue_type=issue.type,
            name="version",
            display_name="Version",
            property_type=IssueProperty.PropertyType.TEXT,
        )

        response = guest_client.patch(
            _issue_url(workspace.slug, project.id, issue.id),
            {"property_values": {str(issue_property.id): "1.4.0"}},
            format="json",
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert not IssuePropertyValue.objects.filter(issue=issue).exists()

    @pytest.mark.django_db
    def test_property_type_change_with_existing_values_blocked_409(self, session_client, workspace, issue):
        issue_property = IssueProperty.objects.create(
            issue_type=issue.type,
            name="version",
            display_name="Version",
            property_type=IssueProperty.PropertyType.SELECT,
            settings={"options": [{"label": "1.4.0", "value": "1.4.0"}]},
        )
        IssuePropertyValue.objects.create(
            project=issue.project,
            issue=issue,
            property=issue_property,
            value="1.4.0",
        )

        response = session_client.patch(
            _properties_url(workspace.slug, issue.type_id, issue_property.id),
            {"property_type": "number"},
            format="json",
        )

        assert response.status_code == status.HTTP_409_CONFLICT
        issue_property.refresh_from_db()
        assert issue_property.property_type == "select"

    @pytest.mark.django_db
    def test_property_type_change_without_values_allowed_200(self, session_client, workspace, issue_type):
        issue_property = IssueProperty.objects.create(
            issue_type=issue_type,
            name="version",
            display_name="Version",
            property_type=IssueProperty.PropertyType.TEXT,
        )

        response = session_client.patch(
            _properties_url(workspace.slug, issue_type.id, issue_property.id),
            {"property_type": "number"},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        issue_property.refresh_from_db()
        assert issue_property.property_type == "number"
