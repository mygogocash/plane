# Copyright (c) 2023-present, Plane. All rights reserved.
#
# This source code is licensed under the GNU Affero General Public
# License v3.0 or later found in the LICENSE file in the root
# directory of this source tree.

import json
import importlib

import pytest
from rest_framework import status

from plane.db.models import Issue, IssueEmbedding, Project, ProjectMember, State, User, WorkspaceMember


def _duplicate_check_url(slug, project_id):
    return f"/api/workspaces/{slug}/projects/{project_id}/issues/duplicate-check/"


@pytest.fixture
def project(workspace, create_user):
    project = Project.objects.create(name="Duplicate Check", identifier="DUP", workspace=workspace)
    ProjectMember.objects.create(project=project, member=create_user, role=20)
    return project


@pytest.fixture
def open_state(project):
    return State.objects.create(name="Open", project=project, group="started", color="#46A758")


def _create_issue(project, state, name):
    return Issue.objects.create(project=project, state=state, name=name)


@pytest.mark.contract
class TestDuplicateCheckAPI:
    def test_duplicate_check_returns_ranked_same_project_candidates(
        self, session_client, workspace, project, open_state
    ):
        matching_issue = _create_issue(project, open_state, "Login dashboard crash")
        _create_issue(project, open_state, "Billing settings typo")

        response = session_client.post(
            _duplicate_check_url(workspace.slug, project.id),
            {
                "title": "Login dashboard crash",
                "description": "",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK, response.data
        assert response.data["retrieval"] == "keyword"
        assert response.data["high_confidence"] is True
        assert response.data["threshold"] == 0.65
        assert response.data["candidates"][0]["issue_id"] == str(matching_issue.id)
        assert response.data["candidates"][0]["score"] >= response.data["threshold"]
        assert response.data["candidates"][0]["matched_on"] == ["title"]

    def test_duplicate_check_filters_other_projects(self, session_client, workspace, project, open_state):
        other_project = Project.objects.create(name="Other Project", identifier="OTH", workspace=workspace)
        other_state = State.objects.create(
            name="Open",
            project=other_project,
            group="started",
            color="#46A758",
        )
        _create_issue(other_project, other_state, "Login dashboard crash")

        response = session_client.post(
            _duplicate_check_url(workspace.slug, project.id),
            {"title": "Login dashboard crash", "description": ""},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["candidates"] == []
        assert response.data["high_confidence"] is False

    def test_duplicate_check_empty_input_returns_empty_candidates(
        self, session_client, workspace, project, open_state
    ):
        _create_issue(project, open_state, "Login dashboard crash")

        response = session_client.post(
            _duplicate_check_url(workspace.slug, project.id),
            {"title": "  ", "description": ""},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["candidates"] == []
        assert response.data["high_confidence"] is False

    def test_non_member_cannot_check_duplicates(self, api_client, workspace, project, open_state):
        outsider = User.objects.create(email="duplicate-outsider@plane.so", username="duplicate_outsider")
        WorkspaceMember.objects.create(workspace=workspace, member=outsider, role=15)
        _create_issue(project, open_state, "Login dashboard crash")
        api_client.force_authenticate(user=outsider)

        response = api_client.post(
            _duplicate_check_url(workspace.slug, project.id),
            {"title": "Login dashboard crash", "description": ""},
            format="json",
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_duplicate_check_uses_embedding_rank_when_available(
        self, session_client, monkeypatch, workspace, project, open_state
    ):
        monkeypatch.setenv("WORKSPACE_AI_EMBEDDINGS_ENABLED", "1")
        monkeypatch.setattr(
            "plane.app.views.issue.similar.get_issue_embedding_provider",
            lambda: lambda _text: [1.0, 0.0],
        )
        semantic_match = _create_issue(project, open_state, "Refund workflow is unclear")
        weaker_match = _create_issue(project, open_state, "Login dashboard crash")
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

        response = session_client.post(
            _duplicate_check_url(workspace.slug, project.id),
            {"title": "Login dashboard crash", "description": ""},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["candidates"][0]["issue_id"] == str(semantic_match.id)
        assert response.data["candidates"][0]["matched_on"] == ["embedding"]

    def test_issue_create_records_duplicate_override_activity(
        self, session_client, monkeypatch, workspace, project, open_state, create_user
    ):
        matching_issue = _create_issue(project, open_state, "Login dashboard crash")
        calls = []

        def capture_activity(**kwargs):
            calls.append(kwargs)

        for module_name in ("plane.app.views.issue.base", "apps.api.plane.app.views.issue.base"):
            try:
                module = importlib.import_module(module_name)
            except ModuleNotFoundError:
                continue
            monkeypatch.setattr(module.issue_activity, "delay", capture_activity, raising=False)
            monkeypatch.setattr(
                type(module.issue_activity),
                "delay",
                lambda _task, *args, **kwargs: capture_activity(**kwargs),
                raising=False,
            )

        response = session_client.post(
            f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/",
            {
                "name": "Login dashboard crash",
                "description_html": "",
                "duplicate_override": {
                    "acknowledged": True,
                    "candidate_issue_ids": [str(matching_issue.id)],
                    "threshold": 0.65,
                },
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED, response.content

        override_call = next(
            call for call in calls if call.get("type") == "issue_duplicate_override.activity.created"
        )
        requested_data = json.loads(override_call["requested_data"])

        assert override_call["actor_id"] == str(create_user.id)
        assert override_call["project_id"] == str(project.id)
        assert override_call["issue_id"] == str(response.data["id"])
        assert requested_data == {
            "acknowledged": True,
            "candidate_issue_ids": [str(matching_issue.id)],
            "threshold": 0.65,
        }
