# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""WF-T9 — suggested-transition endpoint.

Returns ``{to_state, confidence, source}`` for a work item: the highest-ranked legal next
state from the resolved rule set (``source="rules"``), optionally refined by the copilot
(``source="ai"``). Copilot enrichment is strictly best-effort and fail-safe — any failure
(unconfigured, error, timeout) degrades to the rules-only result with HTTP 200, never 500,
and never leaks the prompt or model id. The AI prompt carries only state names, the issue
type, and recent state history — never emails, API keys, or descriptions.
"""

# Python imports
import json
import re

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from .. import BaseAPIView
from plane.app.permissions import ROLE, allow_permission
from plane.db.models import Issue, IssueActivity, State
from plane.utils.exception_logger import log_exception
from plane.utils.workflow import rank_legal_transitions

from ..external.base import get_llm_config, get_llm_response

_HISTORY_LIMIT = 5
_RULES_CONFIDENCE = 0.5
_JSON_RE = re.compile(r"\{.*\}", re.DOTALL)


def _ai_suggest(issue, ranked_ids):
    """Best-effort copilot refinement; returns ``(to_state_id, confidence)`` or ``None``.

    Returns ``None`` (so the caller falls back to rules) when the copilot is not configured,
    errors, returns nothing parseable, or picks a state outside the legal candidate set.
    """
    api_key, model, provider = get_llm_config()
    if not api_key or not model or not provider:
        return None

    states = {sid: name for sid, name in State.objects.filter(id__in=ranked_ids).values_list("id", "name")}
    candidate_names = [states[sid] for sid in ranked_ids if sid in states]

    history = list(
        IssueActivity.objects.filter(issue=issue, field="state")
        .order_by("-created_at")
        .values_list("new_value", flat=True)[:_HISTORY_LIMIT]
    )

    task = (
        "You recommend the single best next workflow state for a work item. "
        'Respond ONLY with compact JSON: {"to_state": <one of the candidate names>, '
        '"confidence": <number between 0 and 1>}.'
    )
    # Minimal, PII-free context: names only.
    prompt = json.dumps(
        {
            "current_state": issue.state.name if issue.state_id else None,
            "issue_type": issue.type.name if issue.type_id else None,
            "candidates": candidate_names,
            "recent_state_history": history,
        }
    )

    text, error = get_llm_response(task, prompt, api_key, model, provider)
    if error or not text:
        return None

    match = _JSON_RE.search(text)
    if match is None:
        return None
    try:
        data = json.loads(match.group(0))
        chosen_name = data.get("to_state")
        confidence = float(data.get("confidence", 0.0))
    except (ValueError, TypeError):
        return None

    name_to_id = {name: sid for sid, name in states.items()}
    chosen_id = name_to_id.get(chosen_name)
    if chosen_id is None:
        return None

    return chosen_id, max(0.0, min(1.0, confidence))


class SuggestedTransitionEndpoint(BaseAPIView):
    """Suggest the best next state for a work item (rules-first, copilot-optional)."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, issue_id):
        issue = (
            Issue.objects.filter(pk=issue_id, project_id=project_id, workspace__slug=slug)
            .select_related("state", "type", "project", "workspace")
            .first()
        )
        if issue is None:
            return Response({"error": "Issue not found"}, status=status.HTTP_404_NOT_FOUND)

        ranked = rank_legal_transitions(issue, issue.project)
        if not ranked:
            return Response(
                {"to_state": None, "confidence": 0.0, "source": "rules"}, status=status.HTTP_200_OK
            )

        # Rules-only baseline is always available.
        result = {"to_state": str(ranked[0]), "confidence": _RULES_CONFIDENCE, "source": "rules"}

        # Optional copilot refinement — fail-safe, never 500, never leaks prompt/model.
        try:
            ai = _ai_suggest(issue, ranked)
            if ai is not None:
                to_state, confidence = ai
                result = {"to_state": str(to_state), "confidence": confidence, "source": "ai"}
        except Exception as exc:
            log_exception(exc)

        return Response(result, status=status.HTTP_200_OK)
