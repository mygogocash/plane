# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
from datetime import date

# Third party imports
import pytest
from rest_framework import status
from rest_framework.test import APIClient

# Module imports
from plane.db.models import Issue, IssueEmbedding, Project, ProjectMember, State, User, WorkspaceMember


def _similar_url(slug, project_id, title="", limit=None):
    url = f"/api/workspaces/{slug}/projects/{project_id}/issues/similar/?title={title}"
    if limit is not None:
        url = f"{url}&limit={limit}"
    return url


@pytest.fixture
def project(workspace, create_user):
    project = Project.objects.create(
        name="Similar Issue Project",
        identifier="SIM",
        workspace=workspace,
        created_by=create_user,
    )
    ProjectMember.objects.create(project=project, member=create_user, role=20)
    return project


@pytest.fixture
def open_state(project):
    return State.objects.create(name="Todo", project=project, group="unstarted", color="#60646C")


@pytest.fixture
def completed_state(project):
    return State.objects.create(name="Done", project=project, group="completed", color="#46A758")


@pytest.fixture
def cancelled_state(project):
    return State.objects.create(name="Cancelled", project=project, group="cancelled", color="#9AA4BC")


@pytest.fixture
def member_user(db, workspace, project):
    user = User.objects.create(email="similar-member@plane.so", username="similar_member")
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=15)
    ProjectMember.objects.create(project=project, member=user, role=15)
    return user


@pytest.fixture
def member_client(member_user):
    client = APIClient()
    client.force_authenticate(user=member_user)
    return client


@pytest.fixture
def non_member_client(db):
    user = User.objects.create(email="similar-outsider@plane.so", username="similar_outsider")
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _create_issue(project, state, name, **kwargs):
    return Issue.objects.create(
        workspace=project.workspace,
        project=project,
        state=state,
        name=name,
        created_by=project.created_by,
        **kwargs,
    )


@pytest.mark.contract
class TestSimilarIssuesAPI:
    @pytest.mark.django_db
    def test_similar_returns_same_project_open_issues_with_confidence(
        self, member_client, workspace, project, open_state
    ):
        best = _create_issue(project, open_state, "Checkout payment fails for mobile card")
        second = _create_issue(project, open_state, "Mobile checkout layout is broken")
        _create_issue(project, open_state, "Invite email is delayed")

        response = member_client.get(_similar_url(workspace.slug, project.id, "Checkout payment fails on mobile", 2))

        assert response.status_code == status.HTTP_200_OK
        assert [result["id"] for result in response.data["results"]] == [str(best.id), str(second.id)]
        assert response.data["results"][0]["confidence"] > response.data["results"][1]["confidence"]
        assert all(0 <= result["confidence"] <= 1 for result in response.data["results"])

    @pytest.mark.django_db
    def test_closed_or_archived_excluded(
        self, member_client, workspace, project, open_state, completed_state, cancelled_state
    ):
        open_issue = _create_issue(project, open_state, "Checkout payment fails on mobile")
        _create_issue(project, completed_state, "Checkout payment fails on desktop")
        _create_issue(project, cancelled_state, "Checkout payment fails on tablet")
        _create_issue(project, open_state, "Checkout payment fails when archived", archived_at=date.today())

        response = member_client.get(_similar_url(workspace.slug, project.id, "Checkout payment fails"))

        assert response.status_code == status.HTTP_200_OK
        assert [result["id"] for result in response.data["results"]] == [str(open_issue.id)]

    @pytest.mark.django_db
    def test_similar_uses_embedding_rank_when_available(
        self, member_client, monkeypatch, workspace, project, open_state
    ):
        monkeypatch.setenv("WORKSPACE_AI_EMBEDDINGS_ENABLED", "1")
        monkeypatch.setattr(
            "plane.app.views.issue.similar.get_issue_embedding_provider",
            lambda: lambda _text: [1.0, 0.0],
        )
        semantic_match = _create_issue(project, open_state, "Refund workflow is unclear")
        weaker_match = _create_issue(project, open_state, "Checkout payment fails for mobile card")
        IssueEmbedding.objects.create(
            workspace=workspace,
            project=project,
            issue=semantic_match,
            model_name="@cf/baai/bge-base-en-v1.5",
            content_hash="a" * 64,
            embedding=[1.0, 0.0],
        )
        IssueEmbedding.objects.create(
            workspace=workspace,
            project=project,
            issue=weaker_match,
            model_name="@cf/baai/bge-base-en-v1.5",
            content_hash="b" * 64,
            embedding=[0.0, 1.0],
        )

        response = member_client.get(_similar_url(workspace.slug, project.id, "checkout payment fails"))

        assert response.status_code == status.HTTP_200_OK
        assert response.data["results"][0]["issue_id"] == str(semantic_match.id)
        assert response.data["results"][0]["retrieval"] == "embedding"
        assert response.data["results"][0]["matched_on"] == ["embedding"]

    def test_cross_project_never_returned(self, member_client, workspace, project, open_state, member_user):
        other_project = Project.objects.create(
            name="Other Similar Project",
            identifier="OSP",
            workspace=workspace,
            created_by=member_user,
        )
        ProjectMember.objects.create(project=other_project, member=member_user, role=15)
        other_state = State.objects.create(name="Todo", project=other_project, group="unstarted", color="#60646C")
        in_scope = _create_issue(project, open_state, "Checkout payment fails in project")
        _create_issue(other_project, other_state, "Checkout payment fails in other project")

        response = member_client.get(_similar_url(workspace.slug, project.id, "Checkout payment fails"))

        assert response.status_code == status.HTTP_200_OK
        assert [result["id"] for result in response.data["results"]] == [str(in_scope.id)]

    @pytest.mark.django_db
    def test_non_member_cannot_query_similar_403(self, non_member_client, workspace, project):
        response = non_member_client.get(_similar_url(workspace.slug, project.id, "Checkout payment fails"))

        assert response.status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db
    def test_empty_or_short_title_returns_empty_200(self, member_client, workspace, project, open_state):
        _create_issue(project, open_state, "Checkout payment fails on mobile")

        empty_response = member_client.get(_similar_url(workspace.slug, project.id, ""))
        short_response = member_client.get(_similar_url(workspace.slug, project.id, "bug"))

        assert empty_response.status_code == status.HTTP_200_OK
        assert empty_response.data == {"results": []}
        assert short_response.status_code == status.HTTP_200_OK
        assert short_response.data == {"results": []}
