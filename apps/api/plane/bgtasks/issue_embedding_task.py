# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from celery import shared_task

from plane.db.models import Issue
from plane.utils.issue_embeddings import (
    get_issue_embedding_provider,
    issue_embeddings_enabled,
    upsert_issue_embedding,
)


DEFAULT_BACKFILL_LIMIT = 100
MAX_BACKFILL_LIMIT = 1000


def _coerce_limit(limit):
    try:
        value = int(limit)
    except (TypeError, ValueError):
        return DEFAULT_BACKFILL_LIMIT

    return min(max(value, 1), MAX_BACKFILL_LIMIT)


def _issue_queryset(project_id=None, workspace_id=None):
    queryset = (
        Issue.issue_objects.filter(archived_at__isnull=True)
        .select_related("project", "workspace", "state")
        .order_by("-updated_at")
    )
    if project_id:
        queryset = queryset.filter(project_id=project_id)
    if workspace_id:
        queryset = queryset.filter(workspace_id=workspace_id)
    return queryset


@shared_task
def issue_embedding_task(issue_id):
    if not issue_embeddings_enabled():
        return {"status": "disabled", "issue_id": str(issue_id)}

    provider = get_issue_embedding_provider()
    if provider is None:
        return {"status": "provider_unavailable", "issue_id": str(issue_id)}

    issue = _issue_queryset().filter(pk=issue_id).first()
    if issue is None:
        return {"status": "missing", "issue_id": str(issue_id)}

    embedding = upsert_issue_embedding(issue, provider=provider)
    if embedding is None:
        return {"status": "skipped", "issue_id": str(issue_id)}

    return {
        "status": "ready",
        "issue_id": str(issue.id),
        "embedding_id": str(embedding.id),
    }


@shared_task
def backfill_issue_embeddings(project_id=None, workspace_id=None, limit=DEFAULT_BACKFILL_LIMIT):
    if not issue_embeddings_enabled():
        return {
            "status": "disabled",
            "processed": 0,
            "ready": 0,
            "skipped": 0,
        }

    provider = get_issue_embedding_provider()
    if provider is None:
        return {
            "status": "provider_unavailable",
            "processed": 0,
            "ready": 0,
            "skipped": 0,
        }

    processed = 0
    ready = 0
    skipped = 0
    for issue in _issue_queryset(project_id=project_id, workspace_id=workspace_id)[: _coerce_limit(limit)]:
        processed += 1
        if upsert_issue_embedding(issue, provider=provider) is None:
            skipped += 1
        else:
            ready += 1

    return {
        "status": "ok",
        "processed": processed,
        "ready": ready,
        "skipped": skipped,
    }
