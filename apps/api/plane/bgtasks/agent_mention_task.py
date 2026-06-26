# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Agent assignment + @mention run worker (AI-T16).

Resolves ``@AgentName`` mentions to active agents, runs a single scope-honoring
Copilot action on behalf of the agent, threads the response inline as an issue
comment, and audits every action. Defense-in-depth:

  - Read-only agents physically cannot write (enforced in the shared executor).
  - The acting user must have MEMBER+ on the issue's project.
  - A deactivated agent aborts gracefully ("agent unavailable").
  - ``MAX_AGENT_RUN_DEPTH`` bounds any runaway re-trigger chain (loop guard).
"""

# Python imports
import re

# Django imports
from django.db import transaction

# Third party imports
from celery import shared_task
from rest_framework.serializers import ValidationError

# Module imports
from plane.app.permissions import ROLE
from plane.db.models import (
    AgentMention,
    AuditLog,
    AutomationAgent,
    IssueComment,
    ProjectMember,
)
from plane.utils.automation_actions import (
    AgentGuardrailError,
    execute_agent_action,
    write_audit_log,
)
from plane.utils.exception_logger import log_exception

MAX_AGENT_RUN_DEPTH = 3

_MENTION_PATTERN = re.compile(r"@([A-Za-z0-9_\-]+)")


def parse_agent_mentions(text, workspace):
    """Return active agents referenced by ``@name`` in ``text`` (case-insensitive).

    Order follows first appearance. Inactive agents are skipped.
    """
    if not text:
        return []

    seen = []
    for raw in _MENTION_PATTERN.findall(text):
        lowered = raw.lower()
        if lowered not in seen:
            seen.append(lowered)

    if not seen:
        return []

    agents_by_name = {
        agent.name.lower(): agent
        for agent in AutomationAgent.objects.filter(
            workspace=workspace, is_active=True, deleted_at__isnull=True
        )
    }
    return [agents_by_name[name] for name in seen if name in agents_by_name]


def create_agent_mention(*, agent, issue, source_type, workspace, source_id=None):
    """Persist a pending :class:`AgentMention` for an agent run."""
    return AgentMention.objects.create(
        agent=agent,
        issue=issue,
        project=issue.project if issue is not None else None,
        workspace=workspace,
        source_type=source_type,
        source_id=source_id,
        status=AgentMention.Status.PENDING,
    )


def _abort(mention, response):
    mention.status = AgentMention.Status.ABORTED
    mention.response = response
    mention.save(update_fields=["status", "response", "updated_at"])


def _fail(mention, response):
    mention.status = AgentMention.Status.FAILED
    mention.response = response
    mention.save(update_fields=["status", "response", "updated_at"])


def process_agent_mention(mention, action, actor, depth=0):
    """Execute one agent action for a mention, honoring scope + permissions.

    Returns the refreshed mention. Never raises for expected guardrail,
    permission, deactivation, or loop-guard outcomes; those set a terminal
    mention status instead.
    """
    if depth > MAX_AGENT_RUN_DEPTH:
        _abort(mention, "aborted by loop guard")
        return mention

    # Re-read the agent so a mid-run deactivation is observed.
    agent = AutomationAgent.objects.filter(pk=mention.agent_id).first()
    if agent is None or not agent.is_active:
        _abort(mention, "agent unavailable")
        write_audit_log(
            workspace=mention.workspace,
            user=actor,
            action="agent.aborted",
            entity_type="agent_mention",
            entity_id=mention.id,
            changes={"reason": "agent unavailable", "agent_id": str(mention.agent_id)},
            actor_type=AuditLog.ActorType.AGENT,
        )
        return mention

    issue = mention.issue
    if issue is None:
        _fail(mention, "no target issue")
        return mention

    role = (
        ProjectMember.objects.filter(
            project_id=issue.project_id, member=actor, is_active=True
        )
        .values_list("role", flat=True)
        .first()
    )
    if role is None or role < ROLE.MEMBER.value:
        _fail(mention, "insufficient permissions")
        return mention

    mention.status = AgentMention.Status.RUNNING
    mention.save(update_fields=["status", "updated_at"])

    try:
        execute_agent_action(
            slug=mention.workspace.slug,
            user=actor,
            agent=agent,
            action=action,
            context_project_id=issue.project_id,
            context_issue_id=issue.id,
        )
    except AgentGuardrailError as exc:
        _fail(mention, exc.message)
        return mention
    except ValidationError as exc:
        _fail(mention, "action could not be applied")
        log_exception(exc)
        return mention

    response_text = f"Applied {(action or {}).get('type')} via @{agent.name}."
    with transaction.atomic():
        IssueComment.objects.create(
            issue=issue,
            project=issue.project,
            workspace=mention.workspace,
            actor=actor,
            comment_html=f"<p>{response_text}</p>",
        )
        mention.status = AgentMention.Status.COMPLETED
        mention.response = response_text
        mention.save(update_fields=["status", "response", "updated_at"])

    return mention


@shared_task
def agent_mention_task(mention_id, action, actor_user_id, depth=0):
    from plane.db.models import User

    mention = (
        AgentMention.objects.filter(pk=mention_id)
        .select_related("agent", "issue", "workspace")
        .first()
    )
    if mention is None:
        return {"status": "missing", "mention_id": str(mention_id)}

    actor = User.objects.filter(pk=actor_user_id).first()
    if actor is None:
        _fail(mention, "actor not found")
        return {"status": "failed", "mention_id": str(mention_id)}

    try:
        process_agent_mention(mention, action=action, actor=actor, depth=depth)
    except Exception as error:
        log_exception(error)
        _fail(mention, "agent run error")

    return {"status": mention.status, "mention_id": str(mention_id)}
