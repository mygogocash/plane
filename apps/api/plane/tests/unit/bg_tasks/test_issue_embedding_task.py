# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import importlib

import pytest
from django.utils import timezone

from plane.db.models import Issue, IssueEmbedding, Project, State


issue_embedding_task_module = importlib.import_module("plane.bgtasks.issue_embedding_task")
issue_embedding_signal_module = importlib.import_module("plane.db.signals.issue_embedding")


@pytest.fixture
def embedding_project(workspace, create_user):
    return Project.objects.create(
        name="Embedding Task Project",
        identifier="ETP",
        workspace=workspace,
        created_by=create_user,
        updated_by=create_user,
    )


@pytest.fixture
def embedding_state(embedding_project):
    return State.objects.create(
        name="Triage",
        color="#4E5355",
        project=embedding_project,
    )


@pytest.fixture
def embedding_issue(embedding_project, embedding_state, create_user):
    return Issue.objects.create(
        project=embedding_project,
        state=embedding_state,
        name="Checkout payment fails",
        created_by=create_user,
        updated_by=create_user,
    )


@pytest.mark.django_db
def test_issue_embedding_task__given_disabled_flag__then_noops(monkeypatch, embedding_issue):
    monkeypatch.delenv("WORKSPACE_AI_EMBEDDINGS_ENABLED", raising=False)

    result = issue_embedding_task_module.issue_embedding_task.run(str(embedding_issue.id))

    assert result == {"status": "disabled", "issue_id": str(embedding_issue.id)}
    assert IssueEmbedding.objects.count() == 0


@pytest.mark.django_db
def test_issue_embedding_task__given_provider__then_stores_embedding(monkeypatch, embedding_issue):
    monkeypatch.setenv("WORKSPACE_AI_EMBEDDINGS_ENABLED", "1")
    monkeypatch.setattr(
        issue_embedding_task_module,
        "get_issue_embedding_provider",
        lambda: lambda _text: [1.0, 0.0],
    )

    result = issue_embedding_task_module.issue_embedding_task.run(str(embedding_issue.id))

    assert result["status"] == "ready"
    assert result["issue_id"] == str(embedding_issue.id)
    embedding = IssueEmbedding.objects.get(issue=embedding_issue)
    assert result["embedding_id"] == str(embedding.id)
    assert embedding.embedding == [1.0, 0.0]


@pytest.mark.django_db
def test_backfill_issue_embeddings__given_no_provider__then_reports_unavailable(monkeypatch):
    monkeypatch.setenv("WORKSPACE_AI_EMBEDDINGS_ENABLED", "1")
    monkeypatch.setattr(issue_embedding_task_module, "get_issue_embedding_provider", lambda: None)

    result = issue_embedding_task_module.backfill_issue_embeddings.run(limit=10)

    assert result == {
        "status": "provider_unavailable",
        "processed": 0,
        "ready": 0,
        "skipped": 0,
    }


@pytest.mark.django_db
def test_backfill_issue_embeddings__given_project_scope__then_updates_matching_issues(
    monkeypatch,
    embedding_project,
    embedding_state,
    embedding_issue,
    create_user,
):
    other_project = Project.objects.create(
        name="Other Embedding Task Project",
        identifier="OET",
        workspace=embedding_project.workspace,
        created_by=create_user,
        updated_by=create_user,
    )
    other_state = State.objects.create(
        name="Triage",
        color="#4E5355",
        project=other_project,
    )
    Issue.objects.create(
        project=embedding_project,
        state=embedding_state,
        name="Payment retry fails",
        created_by=create_user,
        updated_by=create_user,
    )
    other_issue = Issue.objects.create(
        project=other_project,
        state=other_state,
        name="Should not be embedded by project backfill",
        created_by=create_user,
        updated_by=create_user,
    )
    monkeypatch.setenv("WORKSPACE_AI_EMBEDDINGS_ENABLED", "1")
    monkeypatch.setattr(
        issue_embedding_task_module,
        "get_issue_embedding_provider",
        lambda: lambda _text: [0.5, 0.5],
    )

    result = issue_embedding_task_module.backfill_issue_embeddings.run(
        project_id=str(embedding_project.id),
        limit=10,
    )

    assert result == {
        "status": "ok",
        "processed": 2,
        "ready": 2,
        "skipped": 0,
    }
    assert IssueEmbedding.objects.filter(project=embedding_project).count() == 2
    assert not IssueEmbedding.objects.filter(issue=other_issue).exists()


@pytest.mark.django_db
def test_issue_save_signal__given_disabled_embeddings__then_does_not_enqueue(
    monkeypatch,
    embedding_project,
    embedding_state,
    create_user,
):
    captured = []
    monkeypatch.delenv("WORKSPACE_AI_EMBEDDINGS_ENABLED", raising=False)
    monkeypatch.setattr(
        issue_embedding_signal_module.issue_embedding_task,
        "delay",
        lambda issue_id: captured.append(issue_id),
    )

    Issue.objects.create(
        project=embedding_project,
        state=embedding_state,
        name="Signal disabled issue",
        created_by=create_user,
        updated_by=create_user,
    )

    assert captured == []


@pytest.mark.django_db
def test_issue_save_signal__given_enabled_embeddings__then_enqueues_after_commit(
    monkeypatch,
    embedding_project,
    embedding_state,
    create_user,
):
    captured = []
    monkeypatch.setenv("WORKSPACE_AI_EMBEDDINGS_ENABLED", "1")
    monkeypatch.setattr(
        issue_embedding_signal_module.transaction,
        "on_commit",
        lambda callback, robust=False: callback(),
    )
    monkeypatch.setattr(
        issue_embedding_signal_module.issue_embedding_task,
        "delay",
        lambda issue_id: captured.append(issue_id),
    )

    issue = Issue.objects.create(
        project=embedding_project,
        state=embedding_state,
        name="Signal enabled issue",
        created_by=create_user,
        updated_by=create_user,
    )

    assert captured == [str(issue.id)]


@pytest.mark.django_db
def test_issue_save_signal__given_issue_update__then_enqueues_refresh(
    monkeypatch,
    embedding_issue,
):
    captured = []
    monkeypatch.setenv("WORKSPACE_AI_EMBEDDINGS_ENABLED", "1")
    monkeypatch.setattr(
        issue_embedding_signal_module.transaction,
        "on_commit",
        lambda callback, robust=False: callback(),
    )
    monkeypatch.setattr(
        issue_embedding_signal_module.issue_embedding_task,
        "delay",
        lambda issue_id: captured.append(issue_id),
    )

    embedding_issue.name = "Updated signal issue"
    embedding_issue.save(update_fields=["name"])

    assert captured == [str(embedding_issue.id)]


@pytest.mark.django_db
def test_issue_save_signal__given_archived_issue__then_does_not_enqueue(
    monkeypatch,
    embedding_issue,
):
    captured = []
    monkeypatch.setenv("WORKSPACE_AI_EMBEDDINGS_ENABLED", "1")
    monkeypatch.setattr(
        issue_embedding_signal_module.transaction,
        "on_commit",
        lambda callback, robust=False: callback(),
    )
    monkeypatch.setattr(
        issue_embedding_signal_module.issue_embedding_task,
        "delay",
        lambda issue_id: captured.append(issue_id),
    )

    embedding_issue.archived_at = timezone.now().date()
    embedding_issue.save(update_fields=["archived_at"])

    assert captured == []
