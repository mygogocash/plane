# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import pytest

# Django imports
from django.db import IntegrityError, transaction
from django.utils import timezone

# Module imports
from plane.db.models import Issue, IssueProperty, IssuePropertyValue, IssueType, Project, State
from plane.tests.factories import IssuePropertyFactory, IssuePropertyValueFactory


@pytest.fixture
def project(workspace, create_user):
    return Project.objects.create(
        name="Custom Property Project",
        identifier="CPP",
        workspace=workspace,
        created_by=create_user,
    )


@pytest.fixture
def issue_type(workspace):
    return IssueType.objects.create(workspace=workspace, name="Bug")


@pytest.fixture
def content_type(workspace):
    return IssueType.objects.create(workspace=workspace, name="Content")


@pytest.fixture
def state(project):
    return State.objects.create(name="Todo", project=project, group="unstarted", color="#60646C")


@pytest.fixture
def issue(workspace, project, state, issue_type, create_user):
    return Issue.objects.create(
        name="Regression in payment flow",
        workspace=workspace,
        project=project,
        state=state,
        type=issue_type,
        created_by=create_user,
    )


@pytest.mark.unit
class TestIssuePropertyModels:
    @pytest.mark.django_db
    def test_issue_property_persists_scoped_to_issue_type(self, issue_type, workspace):
        issue_property = IssueProperty.objects.create(
            issue_type=issue_type,
            name="version",
            display_name="Version",
            property_type=IssueProperty.PropertyType.SELECT,
            settings={"options": [{"label": "1.4.0", "value": "1.4.0"}]},
            is_required=True,
        )

        assert issue_property.id is not None
        assert issue_property.issue_type_id == issue_type.id
        assert issue_property.workspace_id == workspace.id
        assert issue_property.property_type == "select"
        assert issue_property.settings["options"][0]["value"] == "1.4.0"

    @pytest.mark.django_db
    def test_duplicate_property_name_on_same_type_rejected(self, issue_type):
        IssueProperty.objects.create(
            issue_type=issue_type,
            name="version",
            display_name="Version",
            property_type=IssueProperty.PropertyType.SELECT,
        )

        with pytest.raises(IntegrityError):
            with transaction.atomic():
                IssueProperty.objects.create(
                    issue_type=issue_type,
                    name="version",
                    display_name="Version duplicate",
                    property_type=IssueProperty.PropertyType.TEXT,
                )

    @pytest.mark.django_db
    def test_same_name_allowed_on_different_types(self, issue_type, content_type):
        bug_version = IssueProperty.objects.create(
            issue_type=issue_type,
            name="version",
            display_name="Version",
            property_type=IssueProperty.PropertyType.TEXT,
        )
        content_version = IssueProperty.objects.create(
            issue_type=content_type,
            name="version",
            display_name="Version",
            property_type=IssueProperty.PropertyType.TEXT,
        )

        assert bug_version.id != content_version.id

    @pytest.mark.django_db
    def test_soft_deleted_property_name_can_be_reused(self, issue_type):
        first_property = IssueProperty.objects.create(
            issue_type=issue_type,
            name="version",
            display_name="Version",
            property_type=IssueProperty.PropertyType.TEXT,
        )
        first_property.deleted_at = timezone.now()
        first_property.save()

        reused_property = IssueProperty.objects.create(
            issue_type=issue_type,
            name="version",
            display_name="Version",
            property_type=IssueProperty.PropertyType.TEXT,
        )

        assert reused_property.id != first_property.id

    @pytest.mark.django_db
    def test_issue_property_value_unique_per_issue_property(self, issue):
        issue_property = IssuePropertyFactory(issue_type=issue.type)
        IssuePropertyValue.objects.create(
            project=issue.project,
            issue=issue,
            property=issue_property,
            value={"text": "1.4.0"},
        )

        with pytest.raises(IntegrityError):
            with transaction.atomic():
                IssuePropertyValue.objects.create(
                    project=issue.project,
                    issue=issue,
                    property=issue_property,
                    value={"text": "1.4.1"},
                )

    @pytest.mark.django_db
    def test_property_value_persists_json_value(self, issue):
        issue_property_value = IssuePropertyValueFactory(
            project=issue.project,
            issue=issue,
            property__issue_type=issue.type,
            value={"text": "1.4.0"},
        )

        issue_property_value.refresh_from_db()
        assert issue_property_value.value == {"text": "1.4.0"}
        assert issue_property_value.workspace_id == issue.workspace_id
