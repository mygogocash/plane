# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from rest_framework import status

from plane.db.models import Page, Project, ProjectMember, ProjectPage


def _entity_search_url(workspace_slug):
    return f"/api/workspaces/{workspace_slug}/entity-search/"


def _create_project(workspace, user, identifier="SP"):
    project = Project.objects.create(
        name=f"Search Project {identifier}",
        identifier=identifier,
        workspace=workspace,
    )
    ProjectMember.objects.create(project=project, member=user, role=20, is_active=True)
    return project


def _create_global_project_page(workspace, project, user, name, description_html):
    page = Page.objects.create(
        workspace=workspace,
        owned_by=user,
        name=name,
        description_html=description_html,
        access=Page.PUBLIC_ACCESS,
        is_global=True,
    )
    ProjectPage.objects.create(project=project, page=page, workspace=workspace)
    return page


@pytest.mark.contract
class TestSearchEndpointPages:
    @pytest.mark.django_db
    def test_entity_search__given_page_content_match__then_returns_page_with_bounded_snippet(
        self, session_client, workspace, create_user
    ):
        project = _create_project(workspace, create_user)
        page = _create_global_project_page(
            workspace=workspace,
            project=project,
            user=create_user,
            name="Release Notes",
            description_html=f"<p>globalsearchmarker {'x' * 240}</p>",
        )

        response = session_client.get(
            _entity_search_url(workspace.slug),
            {
                "query": "globalsearchmarker",
                "query_type": "page",
                "count": 10,
            },
        )

        assert response.status_code == status.HTTP_200_OK
        page_results = response.data["page"]
        assert len(page_results) == 1
        assert page_results[0]["id"] == page.id
        assert "globalsearchmarker" in page_results[0]["snippet"]
        assert len(page_results[0]["snippet"]) <= 200

    @pytest.mark.django_db
    def test_entity_search__given_page_in_project_without_membership__then_does_not_leak_content(
        self, session_client, workspace, create_user
    ):
        visible_project = _create_project(workspace, create_user, identifier="VS")
        hidden_project = Project.objects.create(
            name="Hidden Search Project",
            identifier="HS",
            workspace=workspace,
        )
        _create_global_project_page(
            workspace=workspace,
            project=visible_project,
            user=create_user,
            name="Visible Page",
            description_html="<p>Visible project content.</p>",
        )
        _create_global_project_page(
            workspace=workspace,
            project=hidden_project,
            user=create_user,
            name="Hidden Page",
            description_html="<p>restrictedsearchmarker should not be exposed.</p>",
        )

        response = session_client.get(
            _entity_search_url(workspace.slug),
            {
                "query": "restrictedsearchmarker",
                "query_type": "page",
                "count": 10,
            },
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["page"] == []
