# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.db.models import Issue
from plane.db.models.state import StateGroup
from plane.utils.issue_embeddings import get_issue_embedding_provider, rank_issue_embeddings
from plane.utils.similarity import MIN_SIMILARITY_TITLE_LENGTH, rank_similar_items

from .. import BaseAPIView


DUPLICATE_BLOCK_THRESHOLD = 0.65
DEFAULT_SIMILAR_LIMIT = 5
MAX_SIMILAR_LIMIT = 10


def _candidate_issues(slug, project_id):
    return (
        Issue.issue_objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            archived_at__isnull=True,
            state__group__in=[
                StateGroup.BACKLOG.value,
                StateGroup.UNSTARTED.value,
                StateGroup.STARTED.value,
            ],
        )
        .select_related("state")
        .order_by("-updated_at")
    )


def _rank_project_issues(slug, project_id, query, limit=DEFAULT_SIMILAR_LIMIT):
    normalized_query = (query or "").strip()
    if len(normalized_query) < MIN_SIMILARITY_TITLE_LENGTH:
        return []

    issue_items = [
        {
            "id": str(issue.id),
            "name": issue.name,
            "sequence_id": issue.sequence_id,
            "state": issue.state.name if issue.state else None,
        }
        for issue in _candidate_issues(slug, project_id)
    ]
    return rank_similar_items(normalized_query, issue_items, limit=limit)


def _serialize_embedding_ranked_issues(query, issues, limit=DEFAULT_SIMILAR_LIMIT):
    ranked_issues = rank_issue_embeddings(
        query,
        list(issues),
        provider=get_issue_embedding_provider(),
        limit=limit,
    )
    if ranked_issues is None:
        return None

    return [
        {
            "id": str(issue.id),
            "issue_id": str(issue.id),
            "project_id": str(issue.project_id),
            "name": issue.name,
            "state": getattr(issue.state, "name", None),
            "score": round(score, 4),
            "confidence": round(score, 4),
            "matched_on": ["embedding"],
            "retrieval": "embedding",
        }
        for issue, score in ranked_issues
    ]


def _coerce_score(value):
    if isinstance(value, (int, float)):
        return float(value)

    try:
        return float(str(value).rstrip("%"))
    except (TypeError, ValueError):
        return 0


def _candidate_matched_on(candidate, request):
    matched_on = candidate.get("matched_on")
    if matched_on:
        return matched_on

    return _matched_on(
        title=request.data.get("title", ""),
        description=request.data.get("description", ""),
    )


def _coerce_limit(raw_limit):
    try:
        return min(max(int(raw_limit), 1), MAX_SIMILAR_LIMIT)
    except (TypeError, ValueError):
        return DEFAULT_SIMILAR_LIMIT


class SimilarIssuesEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="PROJECT")
    def get(self, request, slug, project_id):
        title = request.query_params.get("title", "")
        limit = _coerce_limit(request.query_params.get("limit", DEFAULT_SIMILAR_LIMIT))
        candidate_issues = _candidate_issues(slug, project_id)
        ranked_issues = _serialize_embedding_ranked_issues(title, candidate_issues, limit=limit)
        if ranked_issues is None:
            ranked_issues = _rank_project_issues(slug, project_id, title, limit=limit)

        return Response({"results": ranked_issues}, status=status.HTTP_200_OK)


class DuplicateCheckEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="PROJECT")
    def post(self, request, slug, project_id):
        title = request.data.get("title", "")
        description = request.data.get("description", "")
        query = " ".join(value.strip() for value in [title, description] if value and value.strip())

        candidate_issues = _candidate_issues(slug, project_id)
        ranked_issues = _serialize_embedding_ranked_issues(query, candidate_issues, limit=MAX_SIMILAR_LIMIT)
        if ranked_issues is None:
            ranked_issues = _rank_project_issues(slug, project_id, query, limit=MAX_SIMILAR_LIMIT)
        candidates = [
            {
                "issue_id": item["id"],
                "score": _coerce_score(item.get("score", item.get("confidence", 0))),
                "matched_on": _candidate_matched_on(item, request),
                "name": item["name"],
            }
            for item in ranked_issues
        ]
        retrieval = "embedding" if any(item.get("retrieval") == "embedding" for item in ranked_issues) else "keyword"

        return Response(
            {
                "candidates": candidates,
                "high_confidence": any(
                    candidate["score"] >= DUPLICATE_BLOCK_THRESHOLD for candidate in candidates
                ),
                "threshold": DUPLICATE_BLOCK_THRESHOLD,
                "retrieval": retrieval,
            },
            status=status.HTTP_200_OK,
        )


def _matched_on(title, description):
    matched_on = []
    if title and title.strip():
        matched_on.append("title")
    if description and description.strip():
        matched_on.append("description")
    return matched_on
