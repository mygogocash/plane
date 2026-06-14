# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.db.models import Issue
from plane.db.models.state import StateGroup
from plane.utils.similarity import MIN_SIMILARITY_TITLE_LENGTH, rank_similar_items

from .. import BaseAPIView


class SimilarIssuesEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="PROJECT")
    def get(self, request, slug, project_id):
        title = request.query_params.get("title", "")
        if len(title.strip()) < MIN_SIMILARITY_TITLE_LENGTH:
            return Response({"results": []}, status=status.HTTP_200_OK)

        try:
            limit = int(request.query_params.get("limit", 5))
        except (TypeError, ValueError):
            limit = 5
        limit = min(max(limit, 1), 10)

        candidates = Issue.issue_objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            state__group__in=[
                StateGroup.BACKLOG.value,
                StateGroup.UNSTARTED.value,
                StateGroup.STARTED.value,
            ],
        ).values("id", "name")

        return Response({"results": rank_similar_items(title, candidates, limit=limit)}, status=status.HTTP_200_OK)
