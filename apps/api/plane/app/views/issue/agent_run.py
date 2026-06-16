# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response

# Module imports
from ..base import BaseAPIView
from ..external.base import get_llm_config, is_llm_configured
from plane.app.permissions import ROLE, allow_permission
from plane.db.models import AgentRun, Issue, IssueActivity


_TERMINAL_STATUSES = {
    AgentRun.Status.SUCCEEDED,
    AgentRun.Status.FAILED,
    AgentRun.Status.CANCELLED,
}


class AgentRunEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id, issue_id):
        # Fail closed: a run cannot be requested without a configured AI provider.
        api_key, model, provider = get_llm_config()
        if not is_llm_configured(api_key, model, provider):
            return Response(
                {"error": "LLM provider API key and model are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        issue = (
            Issue.issue_objects.filter(workspace__slug=slug, project_id=project_id, id=issue_id)
            .select_related("project", "workspace")
            .first()
        )
        if issue is None:
            return Response({"error": "Issue not found"}, status=status.HTTP_404_NOT_FOUND)

        agent_key = str(request.data.get("agent_key") or "").strip()
        if not agent_key:
            return Response({"error": "agent_key is required"}, status=status.HTTP_400_BAD_REQUEST)

        agent_input = request.data.get("input")
        if not isinstance(agent_input, dict):
            agent_input = {}

        agent_run = AgentRun.objects.create(
            project=issue.project,
            workspace=issue.workspace,
            issue=issue,
            agent_key=agent_key,
            requested_by=request.user,
            input=agent_input,
            status=AgentRun.Status.QUEUED,
            created_by=request.user,
        )
        _log_agent_run_activity(issue, request.user, agent_run, comment="queued an agent run")
        # v1 records the request only — no autonomous work-item mutation is performed.
        return Response(_serialize_agent_run(agent_run), status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def get(self, request, slug, project_id, issue_id, pk):
        agent_run = _get_agent_run(slug, project_id, issue_id, pk)
        if agent_run is None:
            return Response({"error": "Agent run not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(_serialize_agent_run(agent_run), status=status.HTTP_200_OK)


class AgentRunCancelEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id, issue_id, pk):
        agent_run = _get_agent_run(slug, project_id, issue_id, pk)
        if agent_run is None:
            return Response({"error": "Agent run not found"}, status=status.HTTP_404_NOT_FOUND)
        if agent_run.status in _TERMINAL_STATUSES:
            return Response(
                {"error": "agent_run_not_cancellable", "status": agent_run.status},
                status=status.HTTP_409_CONFLICT,
            )
        agent_run.status = AgentRun.Status.CANCELLED
        agent_run.save(update_fields=["status", "updated_at"])
        _log_agent_run_activity(agent_run.issue, request.user, agent_run, comment="cancelled an agent run")
        return Response(_serialize_agent_run(agent_run), status=status.HTTP_200_OK)


def _get_agent_run(slug, project_id, issue_id, pk):
    return (
        AgentRun.objects.filter(workspace__slug=slug, project_id=project_id, issue_id=issue_id, pk=pk)
        .select_related("issue", "project", "workspace")
        .first()
    )


def _serialize_agent_run(agent_run):
    return {
        "id": str(agent_run.id),
        "issue_id": str(agent_run.issue_id),
        "agent_key": agent_run.agent_key,
        "requested_by": str(agent_run.requested_by_id) if agent_run.requested_by_id else None,
        "status": agent_run.status,
        "input": agent_run.input,
        "result": agent_run.result,
        "error": agent_run.error,
        "created_at": agent_run.created_at,
        "updated_at": agent_run.updated_at,
    }


def _log_agent_run_activity(issue, actor, agent_run, comment):
    IssueActivity.objects.create(
        issue=issue,
        actor=actor,
        verb="updated",
        field="agent_run",
        project=issue.project,
        workspace=issue.workspace,
        old_value="",
        new_value=agent_run.status,
        comment=comment,
        new_identifier=agent_run.id,
        epoch=timezone.now().timestamp(),
    )
