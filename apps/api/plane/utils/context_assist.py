# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import json

from plane.db.models import Issue, IssueActivity, IssueBlocker, StatusUpdate

RECENT_CHANGES_LIMIT = 10


def empty_context_assist_payload():
    return {
        "blockers": [],
        "at_risk": [],
        "recent_changes": [],
        "suggested_follow_ups": [],
    }


def _issue_ref(issue):
    return {"issue_id": str(issue.id), "name": issue.name}


def _blocker_item(blocker):
    return {
        "issue_id": str(blocker.block_id),
        "name": blocker.block.name,
        "blocked_by": {
            "issue_id": str(blocker.blocked_by_id),
            "name": blocker.blocked_by.name,
        },
    }


def _recent_change_item(activity):
    summary = " ".join(
        filter(
            None,
            [activity.verb, activity.field, activity.new_value, activity.comment],
        )
    ).strip()
    return {
        "issue_id": str(activity.issue_id) if activity.issue_id else None,
        "name": activity.issue.name if activity.issue_id else "",
        "summary": summary,
        "created_at": activity.created_at.isoformat(),
    }


def _gather_blockers(issue_ids):
    if not issue_ids:
        return []

    blockers = (
        IssueBlocker.objects.filter(
            block_id__in=issue_ids,
            deleted_at__isnull=True,
        )
        .select_related("block", "blocked_by")
        .order_by("-created_at")
    )
    return [_blocker_item(blocker) for blocker in blockers]


def _gather_at_risk(*, workspace_id, project_id=None, initiative_id=None):
    queryset = StatusUpdate.objects.filter(
        workspace_id=workspace_id,
        status=StatusUpdate.Status.AT_RISK,
        deleted_at__isnull=True,
    )
    if initiative_id:
        queryset = queryset.filter(initiative_id=initiative_id)
    elif project_id:
        queryset = queryset.filter(epic__project_id=project_id)

    at_risk = []
    seen = set()
    for status_update in queryset.select_related("epic", "initiative"):
        if status_update.epic_id and status_update.epic_id not in seen:
            at_risk.append(_issue_ref(status_update.epic))
            seen.add(status_update.epic_id)
        elif status_update.initiative_id and status_update.initiative_id not in seen:
            at_risk.append(
                {
                    "issue_id": str(status_update.initiative_id),
                    "name": status_update.initiative.name,
                }
            )
            seen.add(status_update.initiative_id)
    return at_risk


def _gather_recent_changes(*, slug, issue_ids):
    if not issue_ids:
        return []

    activities = (
        IssueActivity.objects.filter(
            workspace__slug=slug,
            issue_id__in=issue_ids,
            issue__archived_at__isnull=True,
            issue__is_draft=False,
        )
        .select_related("issue")
        .order_by("-created_at")[:RECENT_CHANGES_LIMIT]
    )
    return [_recent_change_item(activity) for activity in activities]


def _issue_ids_for_project(project):
    return list(
        Issue.issue_objects.filter(
            project_id=project.id,
            workspace_id=project.workspace_id,
        ).values_list("id", flat=True)
    )


def _issue_ids_for_cycle(cycle):
    return list(
        Issue.issue_objects.filter(
            issue_cycle__cycle_id=cycle.id,
            issue_cycle__deleted_at__isnull=True,
            project_id=cycle.project_id,
            workspace_id=cycle.workspace_id,
        )
        .distinct()
        .values_list("id", flat=True)
    )


def _issue_ids_for_initiative(initiative):
    from plane.utils.ai_summaries import _initiative_issue_queryset

    return list(_initiative_issue_queryset(initiative).values_list("id", flat=True))


def gather_context_for_issue(*, slug, issue):
    issue_ids = [issue.id]
    return {
        "blockers": _gather_blockers(issue_ids),
        "at_risk": _gather_at_risk(workspace_id=issue.workspace_id, project_id=issue.project_id),
        "recent_changes": _gather_recent_changes(slug=slug, issue_ids=issue_ids),
    }


def gather_context_for_project(*, slug, project):
    issue_ids = _issue_ids_for_project(project)
    return {
        "blockers": _gather_blockers(issue_ids),
        "at_risk": _gather_at_risk(workspace_id=project.workspace_id, project_id=project.id),
        "recent_changes": _gather_recent_changes(slug=slug, issue_ids=issue_ids),
    }


def gather_context_for_cycle(*, slug, cycle):
    issue_ids = _issue_ids_for_cycle(cycle)
    return {
        "blockers": _gather_blockers(issue_ids),
        "at_risk": _gather_at_risk(workspace_id=cycle.workspace_id, project_id=cycle.project_id),
        "recent_changes": _gather_recent_changes(slug=slug, issue_ids=issue_ids),
    }


def gather_context_for_initiative(*, slug, initiative):
    issue_ids = _issue_ids_for_initiative(initiative)
    return {
        "blockers": _gather_blockers(issue_ids),
        "at_risk": _gather_at_risk(workspace_id=initiative.workspace_id, initiative_id=initiative.id),
        "recent_changes": _gather_recent_changes(slug=slug, issue_ids=issue_ids),
    }


def generate_suggested_follow_ups(blockers, at_risk, recent_changes, api_key, model, provider):
    if not blockers and not at_risk and not recent_changes:
        return []

    from plane.app.views.external.base import get_llm_response

    prompt = (
        "Suggest up to 3 concise follow-up actions as a JSON array of strings based on this context.\n"
        f"Context: {json.dumps({'blockers': blockers, 'at_risk': at_risk, 'recent_changes': recent_changes})}"
    )
    text, error = get_llm_response("context_assist_followups", prompt, api_key, model, provider)
    if error or not text:
        return []

    try:
        parsed = json.loads(text)
        if isinstance(parsed, list):
            return [str(item) for item in parsed[:5] if str(item).strip()]
    except json.JSONDecodeError:
        return [line.strip("- ").strip() for line in text.splitlines() if line.strip()][:5]

    return []
