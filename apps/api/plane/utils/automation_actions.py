# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Shared, guardrail-aware action executor and audit helper.

This module is the single server-side enforcement point for AI agent and
automation-rule actions. The ``read_only`` write-guardrail lives here (not in
the UI) so an agent physically cannot invoke a write action regardless of the
request payload. Every applied action writes an immutable :class:`AuditLog`.

The actual mutation logic is reused from ``plane.app.views.copilot`` so agents
and automation rules share the exact allowlist and validation the Copilot
command mode already enforces. Copilot itself is never modified by this module.
"""

# Django imports
from django.db import transaction

# Third party imports
from rest_framework import serializers

# Module imports
from plane.app.views.copilot import _build_action_plan
from plane.db.models import AuditLog, AutomationAgent

# The set of action types that mutate workspace data. A read_only agent may
# never execute any of these. Mirrors the Copilot command allowlist.
WRITE_ACTION_TYPES = frozenset(
    {
        "create_issue",
        "update_issue",
        "set_priority",
        "set_state",
        "assign_user",
        "unassign_user",
        "create_label",
    }
)


class AgentGuardrailError(Exception):
    """Raised when an agent attempts an action its scope/allowlist forbids."""

    def __init__(self, message):
        self.message = message
        super().__init__(message)


def action_is_write(action_type):
    return action_type in WRITE_ACTION_TYPES


def enforce_agent_scope(agent, action_type):
    """Server-side guardrail. Raises :class:`AgentGuardrailError` when the agent
    is not allowed to perform ``action_type``.

    Two independent checks:
    1. A ``read_only`` agent can never perform a write action.
    2. When an agent declares an ``allowed_actions`` allowlist, the action must
       be a member of it.
    """
    if action_is_write(action_type) and agent.scope == AutomationAgent.Scope.READ_ONLY:
        raise AgentGuardrailError("Read-only agents cannot perform write actions.")

    allowed = agent.allowed_actions or []
    if allowed and action_type not in allowed:
        raise AgentGuardrailError(f"Action '{action_type}' is not allowed for this agent.")


def write_audit_log(
    *,
    workspace,
    user,
    action,
    entity_type,
    entity_id=None,
    changes=None,
    actor_type=AuditLog.ActorType.USER,
):
    """Append an immutable audit entry. Never include secrets in ``changes``."""
    return AuditLog.objects.create(
        workspace=workspace,
        user=user,
        actor_type=actor_type,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        changes=changes or {},
    )


def execute_agent_action(
    *,
    slug,
    user,
    agent,
    action,
    context_project_id=None,
    context_issue_id=None,
    write_audit=True,
):
    """Execute a single allowlisted action on behalf of an agent.

    Enforces the agent scope guardrail BEFORE building or applying anything, so
    a read_only agent never reaches a mutation. Raises:
      - :class:`AgentGuardrailError` on a scope/allowlist violation
      - ``rest_framework.serializers.ValidationError`` on an invalid payload
    """
    action_type = (action or {}).get("type")
    enforce_agent_scope(agent, action_type)

    _action, executor = _build_action_plan(
        slug=slug,
        user=user,
        action=action,
        context_project_id=context_project_id,
        context_issue_id=context_issue_id,
    )

    with transaction.atomic():
        result = executor()

    if write_audit and agent.workspace_id:
        write_audit_log(
            workspace=agent.workspace,
            user=user,
            action=f"agent.{action_type}",
            entity_type="agent_action",
            entity_id=result.get("entity_id") if isinstance(result, dict) else None,
            changes={"agent_id": str(agent.id), "action_type": action_type},
            actor_type=AuditLog.ActorType.AGENT,
        )

    return result


def validate_actions_payload(actions):
    """Validate an actions list for rule/agent creation.

    Rejects empty action lists and any action whose ``type`` is not allowlisted.
    Returns the cleaned actions list. Raises ``serializers.ValidationError``.
    """
    if not isinstance(actions, list) or not actions:
        raise serializers.ValidationError({"actions": "At least one action is required."})

    cleaned = []
    for action in actions:
        if not isinstance(action, dict):
            raise serializers.ValidationError({"actions": "Each action must be an object."})
        action_type = str(action.get("type", "")).strip()
        if action_type not in WRITE_ACTION_TYPES:
            raise serializers.ValidationError({"actions": f"Action '{action_type}' is not allowed."})
        cleaned.append({**action, "type": action_type})
    return cleaned
