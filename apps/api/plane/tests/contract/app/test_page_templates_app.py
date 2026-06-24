# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from rest_framework import status

from plane.db.models import (
    Page,
    PageTemplate,
    Project,
    ProjectMember,
    ProjectPage,
    User,
    Workspace,
    WorkspaceMember,
)


def _templates_url(workspace_slug, template_id=None, suffix=""):
    base = f"/api/workspaces/{workspace_slug}/page-templates/"
    if template_id is None:
        return base
    return f"{base}{template_id}/{suffix}"


def _create_project(workspace, user, identifier="TPL", role=20):
    project = Project.objects.create(
        name=f"Template Project {identifier}",
        identifier=identifier,
        workspace=workspace,
    )
    ProjectMember.objects.create(project=project, member=user, role=role, is_active=True)
    return project


def _create_workspace_member(workspace, user, role=15):
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=role, is_active=True)


def _create_template(workspace, user, **overrides):
    payload = {
        "workspace": workspace,
        "owned_by": user,
        "name": "Runbook Template",
        "description_html": "<h1>Runbook</h1><p>Steps</p>",
        "description_json": {"type": "doc", "content": [{"type": "paragraph"}]},
        "logo_props": {"icon": "book"},
        "template_type": "runbook",
        "access": PageTemplate.PUBLIC_ACCESS,
    }
    payload.update(overrides)
    return PageTemplate.objects.create(**payload)


@pytest.mark.contract
class TestPageTemplatesEndpoint:
    @pytest.mark.django_db
    def test_page_templates_list__given_private_and_public_templates__then_returns_only_visible_templates(
        self, session_client, workspace, create_user
    ):
        project = _create_project(workspace, create_user, "PTV")
        other_user = User.objects.create_user(email="template-other@example.com", username="template-other")
        _create_workspace_member(workspace, other_user, role=15)
        ProjectMember.objects.create(project=project, member=other_user, role=15, is_active=True)

        public_template = _create_template(workspace, create_user, project=project, name="Public Template")
        private_template = _create_template(
            workspace,
            create_user,
            project=project,
            name="Owned Private Template",
            access=PageTemplate.PRIVATE_ACCESS,
        )
        hidden_template = _create_template(
            workspace,
            other_user,
            project=project,
            name="Other Private Template",
            access=PageTemplate.PRIVATE_ACCESS,
        )

        response = session_client.get(_templates_url(workspace.slug))

        assert response.status_code == status.HTTP_200_OK
        template_ids = {template["id"] for template in response.data}
        assert public_template.id in template_ids
        assert private_template.id in template_ids
        assert hidden_template.id not in template_ids

    @pytest.mark.django_db
    def test_page_templates_create__given_guest_project_member__then_rejects_request(
        self, api_client, workspace, create_user
    ):
        project = _create_project(workspace, create_user, "PTG")
        guest = User.objects.create_user(email="template-guest@example.com", username="template-guest")
        _create_workspace_member(workspace, guest, role=5)
        ProjectMember.objects.create(project=project, member=guest, role=5, is_active=True)
        api_client.force_authenticate(user=guest)

        response = api_client.post(
            _templates_url(workspace.slug),
            {
                "project": project.id,
                "name": "Blocked Template",
                "description_html": "<p>Blocked</p>",
                "template_type": "custom",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db
    def test_page_template_apply__given_valid_template__then_creates_project_page_from_template(
        self, session_client, workspace, create_user
    ):
        project = _create_project(workspace, create_user, "PTA")
        template = _create_template(
            workspace,
            create_user,
            project=project,
            name="Incident Runbook",
            description_html="<h1>Incident</h1><p>Restore service</p>",
            description_json={"type": "doc", "content": [{"type": "heading", "text": "Incident"}]},
            logo_props={"icon": "ambulance"},
        )

        response = session_client.post(
            _templates_url(workspace.slug, template.id, "apply/"),
            {"project_id": project.id, "name": "Production Incident Runbook"},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        page = Page.objects.get(pk=response.data["id"])
        assert page.name == "Production Incident Runbook"
        assert page.description_html == template.description_html
        assert page.description_json == template.description_json
        assert page.logo_props == template.logo_props
        assert "<" not in page.description_stripped
        assert "Incident" in page.description_stripped
        assert ProjectPage.objects.filter(project=project, page=page, workspace=workspace).exists()

    @pytest.mark.django_db
    def test_page_template_apply__given_template_scoped_to_another_project__then_rejects_request(
        self, session_client, workspace, create_user
    ):
        source_project = _create_project(workspace, create_user, "PTS")
        target_project = _create_project(workspace, create_user, "PTT")
        template = _create_template(workspace, create_user, project=source_project, name="Source Project Template")

        response = session_client.post(
            _templates_url(workspace.slug, template.id, "apply/"),
            {"project_id": target_project.id},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert not Page.objects.filter(name="Source Project Template").exists()

    @pytest.mark.django_db
    def test_page_templates_create__given_cross_workspace_project__then_rejects_request(
        self, session_client, workspace, create_user
    ):
        other_workspace = Workspace.objects.create(
            name="Other Template Workspace",
            slug="other-template-workspace",
            owner=create_user,
        )
        other_project = _create_project(other_workspace, create_user, "OTW")

        response = session_client.post(
            _templates_url(workspace.slug),
            {
                "project": other_project.id,
                "name": "Cross Workspace Template",
                "description_html": "<p>Cross workspace</p>",
                "template_type": "custom",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert not PageTemplate.objects.filter(name="Cross Workspace Template").exists()
