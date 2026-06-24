# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import serializers, status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.views.external.base import get_llm_config, is_llm_configured
from plane.db.models import Issue, Project
from plane.utils.generate_brief import create_brief_page, generate_brief_html

from .base import BaseAPIView


class GenerateBriefSerializer(serializers.Serializer):
    regenerate = serializers.BooleanField(required=False, default=False)


class GenerateBriefEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id, issue_id):
        serializer = GenerateBriefSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        project = Project.objects.filter(workspace__slug=slug, id=project_id).select_related("workspace").first()
        if project is None:
            return Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)

        issue = Issue.issue_objects.filter(id=issue_id, project_id=project_id, workspace__slug=slug).first()
        if issue is None:
            return Response({"error": "Issue not found"}, status=status.HTTP_404_NOT_FOUND)

        api_key, model, provider = get_llm_config()
        if not is_llm_configured(api_key, model, provider):
            return Response(
                {"error": "LLM provider API key and model are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        description_html, error = generate_brief_html(issue, api_key, model, provider)
        if error or not description_html:
            return Response(
                {"error": "An internal error has occurred."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        page = create_brief_page(
            workspace=project.workspace,
            project=project,
            issue=issue,
            user=request.user,
            description_html=description_html,
            regenerate=serializer.validated_data["regenerate"],
        )

        payload = {"page_id": str(page.id)}
        if serializer.validated_data["regenerate"]:
            payload["regenerated"] = True

        return Response(payload, status=status.HTTP_200_OK)
