# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Intake triage suggestion read/apply endpoints (AI-T17).

Reads are visible to project members; applying a suggestion requires
MEMBER+ on the owning project. Apply is idempotent and audited. Member
overrides in the apply body take precedence over AI-suggested values.
"""

# Third party imports
from rest_framework import serializers, status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE
from plane.db.models import IntakeIssue, ProjectMember, TriageSuggestion
from plane.utils.intake_triage import apply_triage_suggestion, is_low_confidence

from .base import BaseAPIView


class TriageSuggestionSerializer(serializers.ModelSerializer):
    low_confidence = serializers.SerializerMethodField()

    class Meta:
        model = TriageSuggestion
        fields = [
            "id",
            "intake_issue",
            "suggested_labels",
            "suggested_assignee",
            "suggested_priority",
            "suggested_project",
            "confidence",
            "low_confidence",
            "status",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_low_confidence(self, obj):
        return is_low_confidence(obj.confidence)


def _project_role(slug, project_id, user):
    member = ProjectMember.objects.filter(
        workspace__slug=slug, project_id=project_id, member=user, is_active=True
    ).first()
    return member.role if member else None


class IntakeTriageSuggestionListEndpoint(BaseAPIView):
    def get(self, request, slug, intake_id):
        intake_issue = (
            IntakeIssue.objects.filter(workspace__slug=slug, id=intake_id)
            .select_related("project", "triage_suggestion")
            .first()
        )
        if intake_issue is None:
            return Response({"error": "Intake issue not found"}, status=status.HTTP_404_NOT_FOUND)

        role = _project_role(slug, intake_issue.project_id, request.user)
        if role is None or role < ROLE.MEMBER.value:
            return Response(
                {"error": "You do not have access to this project."},
                status=status.HTTP_403_FORBIDDEN,
            )

        suggestions = TriageSuggestion.objects.filter(intake_issue=intake_issue).order_by("-created_at")
        return Response(
            TriageSuggestionSerializer(suggestions, many=True).data,
            status=status.HTTP_200_OK,
        )


class IntakeTriageSuggestionApplyEndpoint(BaseAPIView):
    def post(self, request, slug, suggestion_id):
        suggestion = (
            TriageSuggestion.objects.filter(workspace__slug=slug, id=suggestion_id)
            .select_related("intake_issue", "intake_issue__issue", "project")
            .first()
        )
        if suggestion is None:
            return Response({"error": "Suggestion not found"}, status=status.HTTP_404_NOT_FOUND)

        role = _project_role(slug, suggestion.project_id, request.user)
        if role is None or role < ROLE.MEMBER.value:
            return Response(
                {"error": "Only project members can apply triage suggestions."},
                status=status.HTTP_403_FORBIDDEN,
            )

        overrides = {}
        for key in ("labels", "assignee", "priority"):
            if key in request.data:
                overrides[key] = request.data.get(key)

        suggestion, outcome = apply_triage_suggestion(suggestion, request.user, overrides=overrides)
        return Response(
            {**TriageSuggestionSerializer(suggestion).data, "outcome": outcome},
            status=status.HTTP_200_OK,
        )
