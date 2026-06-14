# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import base64

import pytest
from rest_framework import status

from plane.db.models import Page, Project, ProjectMember, User


def _pages_url(workspace_slug, project_id):
    return f"/api/workspaces/{workspace_slug}/projects/{project_id}/pages/"


def _create_project(workspace, user):
    project = Project.objects.create(
        name="Pages Import Project",
        identifier="PIP",
        workspace=workspace,
    )
    ProjectMember.objects.create(project=project, member=user, role=20)
    return project


@pytest.mark.contract
class TestProjectPagesEndpoint:
    @pytest.mark.django_db
    def test_pages_create__given_import_payload__then_sanitizes_html_and_persists_metadata(
        self, session_client, workspace, create_user
    ):
        project = _create_project(workspace, create_user)
        payload = {
            "name": "Imported Notion Page",
            "access": 0,
            "description_html": '<h1>Imported</h1><p onclick="alert(1)">Body</p><script>alert("x")</script>',
            "description_json": {"type": "doc", "content": []},
            "description_binary": base64.b64encode(b"safe-binary").decode("utf-8"),
            "external_source": "notion",
            "external_id": "notion:imported-page:abc123",
        }

        response = session_client.post(_pages_url(workspace.slug, project.id), payload, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["external_source"] == "notion"
        assert response.data["external_id"] == "notion:imported-page:abc123"
        assert "<script" not in response.data["description_html"]
        assert "onclick" not in response.data["description_html"]

        page = Page.objects.get(pk=response.data["id"])
        assert page.external_source == "notion"
        assert page.external_id == "notion:imported-page:abc123"
        assert "<script" not in page.description_html
        assert "onclick" not in page.description_html

    @pytest.mark.django_db
    def test_pages_create__given_invalid_description_binary__then_rejects_request(
        self, session_client, workspace, create_user
    ):
        project = _create_project(workspace, create_user)

        response = session_client.post(
            _pages_url(workspace.slug, project.id),
            {
                "name": "Invalid Binary",
                "access": 0,
                "description_html": "<p>Body</p>",
                "description_binary": "not-base64-data",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "description_binary" in response.data

    @pytest.mark.django_db
    def test_pages_create__given_non_project_member__then_rejects_request(self, api_client, workspace, create_user):
        project = _create_project(workspace, create_user)
        outsider = User.objects.create_user(email="outsider-pages@example.com", username="outsider-pages")
        api_client.force_authenticate(user=outsider)

        response = api_client.post(
            _pages_url(workspace.slug, project.id),
            {"name": "Blocked", "access": 0, "description_html": "<p>Body</p>"},
            format="json",
        )

        assert response.status_code in {status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND}
