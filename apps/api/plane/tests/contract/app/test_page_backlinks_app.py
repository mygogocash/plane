# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from rest_framework import status

from plane.db.models import Page, PageLog, Project, ProjectMember, ProjectPage, User


def _backlinks_url(workspace_slug, project_id, page_id):
    return f"/api/workspaces/{workspace_slug}/projects/{project_id}/pages/{page_id}/backlinks/"


def _create_project(workspace, user, identifier):
    project = Project.objects.create(
        name=f"Backlink Project {identifier}",
        identifier=identifier,
        workspace=workspace,
    )
    ProjectMember.objects.create(project=project, member=user, role=20, is_active=True)
    return project


def _create_page(workspace, project, user, name, access=Page.PUBLIC_ACCESS):
    page = Page.objects.create(
        workspace=workspace,
        owned_by=user,
        name=name,
        description_html=f"<p>{name}</p>",
        access=access,
        is_global=True,
    )
    ProjectPage.objects.create(project=project, page=page, workspace=workspace)
    return page


def _link_page(source_page, target_page, workspace, entity_name="back_link"):
    PageLog.objects.create(
        page=source_page,
        workspace=workspace,
        entity_identifier=target_page.id,
        entity_name=entity_name,
        entity_type="page",
    )


@pytest.mark.contract
class TestPageBacklinksEndpoint:
    @pytest.mark.django_db
    def test_page_backlinks__given_readable_source_pages__then_returns_inbound_pages(
        self, session_client, workspace, create_user
    ):
        project = _create_project(workspace, create_user, "BL")
        target_page = _create_page(workspace, project, create_user, "Target Page")
        source_page = _create_page(workspace, project, create_user, "Source Page")
        mention_page = _create_page(workspace, project, create_user, "Mention Page")
        _link_page(source_page, target_page, workspace)
        _link_page(mention_page, target_page, workspace, entity_name="page_mention")

        response = session_client.get(_backlinks_url(workspace.slug, project.id, target_page.id))

        assert response.status_code == status.HTTP_200_OK
        backlink_ids = {backlink["id"] for backlink in response.data["backlinks"]}
        assert backlink_ids == {source_page.id, mention_page.id}
        assert response.data["backlinks"][0]["project_ids"]
        assert response.data["backlinks"][0]["project_identifiers"]

    @pytest.mark.django_db
    def test_page_backlinks__given_source_page_in_unjoined_project__then_does_not_leak_it(
        self, session_client, workspace, create_user
    ):
        visible_project = _create_project(workspace, create_user, "VB")
        hidden_project = Project.objects.create(
            name="Hidden Backlink Project",
            identifier="HB",
            workspace=workspace,
        )
        target_page = _create_page(workspace, visible_project, create_user, "Target Page")
        visible_source_page = _create_page(workspace, visible_project, create_user, "Visible Source")
        hidden_source_page = _create_page(workspace, hidden_project, create_user, "Hidden Source")
        _link_page(visible_source_page, target_page, workspace)
        _link_page(hidden_source_page, target_page, workspace)

        response = session_client.get(_backlinks_url(workspace.slug, visible_project.id, target_page.id))

        assert response.status_code == status.HTTP_200_OK
        backlink_ids = {backlink["id"] for backlink in response.data["backlinks"]}
        assert backlink_ids == {visible_source_page.id}
        assert hidden_source_page.id not in backlink_ids

    @pytest.mark.django_db
    def test_page_backlinks__given_non_project_member__then_denies_target_page(
        self, api_client, workspace, create_user
    ):
        project = _create_project(workspace, create_user, "DN")
        target_page = _create_page(workspace, project, create_user, "Target Page")
        outsider = User.objects.create_user(email="backlinks-outsider@example.com", username="backlinks-outsider")
        api_client.force_authenticate(user=outsider)

        response = api_client.get(_backlinks_url(workspace.slug, project.id, target_page.id))

        assert response.status_code == status.HTTP_403_FORBIDDEN
