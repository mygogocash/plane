# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import pytest

# Module imports
from plane.db.models import WorkItemTemplate
from plane.tests.factories import IssueTypeFactory, ProjectFactory, WorkItemTemplateFactory


@pytest.fixture
def project():
    return ProjectFactory()


@pytest.fixture
def issue_type(project):
    return IssueTypeFactory(workspace=project.workspace)


@pytest.mark.unit
class TestWorkItemTemplateModel:
    @pytest.mark.django_db
    def test_template_persists_project_scoped(self, project, issue_type):
        template = WorkItemTemplate.objects.create(
            project=project,
            name="Bug report",
            description_html="<p>Describe the regression</p>",
            template_data={"priority": "high"},
            issue_type=issue_type,
        )

        assert template.id is not None
        assert template.project_id == project.id
        assert template.workspace_id == project.workspace_id
        assert template.issue_type_id == issue_type.id

    @pytest.mark.django_db
    def test_template_data_json_roundtrips(self, project, issue_type):
        payload = {
            "priority": "urgent",
            "labels": ["frontend", "payments"],
            "sub_items": [{"name": "Write regression test"}],
            "property_values": {"version": "1.4.0"},
        }

        template = WorkItemTemplateFactory(project=project, issue_type=issue_type, template_data=payload)

        template.refresh_from_db()
        assert template.template_data == payload

    @pytest.mark.django_db
    def test_template_issue_type_nullable(self, project):
        template = WorkItemTemplateFactory(project=project, issue_type=None)

        template.refresh_from_db()
        assert template.issue_type is None
        assert template.workspace_id == project.workspace_id

    @pytest.mark.django_db
    def test_is_active_defaults_true(self, project):
        template = WorkItemTemplate.objects.create(
            project=project,
            name="Default task",
            description_html="<p></p>",
            template_data={},
        )

        assert template.is_active is True
