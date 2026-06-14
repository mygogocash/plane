# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
from uuid import uuid4

# Third party imports
import pytest
from rest_framework import status
from rest_framework.test import APIClient

# Module imports
from plane.db.models import Initiative, User, Workspace, WorkspaceMember
from plane.db.models.api import APIToken


def _initiatives_url(slug):
    return f"/api/v1/workspaces/{slug}/initiatives/"


def _initiative_detail_url(slug, initiative_id):
    return f"{_initiatives_url(slug)}{initiative_id}/"


def _nlq_url(slug):
    return f"/api/v1/workspaces/{slug}/copilot/query/"


def _keyed_client(user):
    token = APIToken.objects.create(user=user, label=f"initiative-key-{uuid4().hex[:8]}", token=uuid4().hex)
    client = APIClient()
    client.credentials(HTTP_X_API_KEY=token.token)
    return client


@pytest.fixture
def member_keyed_client(db, workspace):
    user = User.objects.create(email="initiative-v1-member@plane.so", username="initiative_v1_member")
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=15)
    return _keyed_client(user)


@pytest.fixture
def viewer_keyed_client(db, workspace):
    user = User.objects.create(email="initiative-v1-viewer@plane.so", username="initiative_v1_viewer")
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=5)
    return _keyed_client(user)


@pytest.fixture
def outsider_keyed_client(db, create_user):
    user = User.objects.create(email="initiative-v1-outsider@plane.so", username="initiative_v1_outsider")
    other_workspace = Workspace.objects.create(
        name="Outsider Workspace",
        slug="initiative-v1-outsider",
        owner=create_user,
    )
    WorkspaceMember.objects.create(workspace=other_workspace, member=user, role=15)
    return _keyed_client(user)


@pytest.mark.contract
class TestInitiativeV1:
    @pytest.mark.django_db
    def test_v1_list_create_detail_enforce_workspace_roles(
        self, member_keyed_client, viewer_keyed_client, outsider_keyed_client, workspace
    ):
        existing = Initiative.objects.create(
            workspace=workspace,
            name="Existing initiative",
            state=Initiative.State.PLANNED,
        )

        create_response = member_keyed_client.post(
            _initiatives_url(workspace.slug),
            {
                "name": "V1 initiative",
                "description_html": "<p>Ship it</p><script>alert(1)</script>",
                "state": Initiative.State.ACTIVE,
            },
            format="json",
        )

        assert create_response.status_code == status.HTTP_201_CREATED
        created = Initiative.objects.get(id=create_response.data["id"])
        assert created.state == Initiative.State.ACTIVE
        assert "<script" not in created.description_html
        assert created.description_stripped == "Ship it"

        list_response = member_keyed_client.get(_initiatives_url(workspace.slug))

        assert list_response.status_code == status.HTTP_200_OK
        listed_ids = {str(item["id"]) for item in list_response.data}
        assert str(existing.id) in listed_ids
        assert str(created.id) in listed_ids

        detail_response = member_keyed_client.get(_initiative_detail_url(workspace.slug, created.id))

        assert detail_response.status_code == status.HTTP_200_OK
        assert str(detail_response.data["id"]) == str(created.id)
        assert detail_response.data["name"] == "V1 initiative"

        viewer_list_response = viewer_keyed_client.get(_initiatives_url(workspace.slug))
        viewer_detail_response = viewer_keyed_client.get(_initiative_detail_url(workspace.slug, created.id))
        viewer_create_response = viewer_keyed_client.post(
            _initiatives_url(workspace.slug),
            {"name": "Viewer cannot create"},
            format="json",
        )

        assert viewer_list_response.status_code == status.HTTP_200_OK
        assert viewer_detail_response.status_code == status.HTTP_200_OK
        assert viewer_create_response.status_code == status.HTTP_403_FORBIDDEN
        assert not Initiative.objects.filter(workspace=workspace, name="Viewer cannot create").exists()

        outsider_response = outsider_keyed_client.get(_initiatives_url(workspace.slug))
        outsider_create_response = outsider_keyed_client.post(
            _initiatives_url(workspace.slug),
            {"name": "Outsider cannot create"},
            format="json",
        )

        assert outsider_response.status_code == status.HTTP_403_FORBIDDEN
        assert outsider_create_response.status_code == status.HTTP_403_FORBIDDEN
        assert not Initiative.objects.filter(workspace=workspace, name="Outsider cannot create").exists()

        nlq_response = member_keyed_client.post(
            _nlq_url(workspace.slug),
            {"scope": "workspace", "question": "What is blocked?"},
            format="json",
        )

        assert nlq_response.status_code == status.HTTP_404_NOT_FOUND
