# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import json
import re
import secrets
from datetime import timedelta

from django.db.models import Count, Q
from django.utils import timezone

from plane.db.models import (
    AISummary,
    InitiativeEpic,
    InitiativeProject,
    Issue,
    IssueBlocker,
    StatusUpdate,
)
from plane.utils.content_validator import validate_html_content

NO_ACTIVITY_MARKDOWN = "No activity yet for this scope."
STATE_GROUPS = ["backlog", "unstarted", "started", "completed", "cancelled"]
DEFAULT_SHARE_TTL = timedelta(days=7)
SHARE_NOT_FOUND_ERROR = "Summary not found"
UUID_PATTERN = re.compile(
    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
    re.IGNORECASE,
)


def _empty_counts_by_group():
    return {state_group: 0 for state_group in STATE_GROUPS}


def _progress_from_queryset(queryset):
    progress = queryset.aggregate(
        total_count=Count("id", distinct=True),
        backlog=Count("id", filter=Q(state__group="backlog"), distinct=True),
        unstarted=Count("id", filter=Q(state__group="unstarted"), distinct=True),
        started=Count("id", filter=Q(state__group="started"), distinct=True),
        completed=Count("id", filter=Q(state__group="completed"), distinct=True),
        cancelled=Count("id", filter=Q(state__group="cancelled"), distinct=True),
    )
    counts_by_group = {state_group: progress[state_group] or 0 for state_group in STATE_GROUPS}
    total_count = progress["total_count"] or 0
    percent_complete = round((counts_by_group["completed"] / total_count) * 100, 2) if total_count else 0
    return {
        "counts_by_group": counts_by_group,
        "percent_complete": percent_complete,
        "total_count": total_count,
    }


def _initiative_progress(initiative):
    active_epic_memberships = InitiativeEpic.objects.filter(
        initiative=initiative,
        deleted_at__isnull=True,
    )
    epic_ids = list(
        active_epic_memberships.filter(
            epic__deleted_at__isnull=True,
            epic__type__is_epic=True,
        ).values_list("epic_id", flat=True)
    )
    project_ids = list(
        InitiativeProject.objects.filter(
            initiative=initiative,
            deleted_at__isnull=True,
            project__deleted_at__isnull=True,
        ).values_list("project_id", flat=True)
    )

    if not epic_ids and not project_ids:
        return {
            "counts_by_group": _empty_counts_by_group(),
            "percent_complete": 0,
            "total_count": 0,
        }

    work_items = (
        Issue.issue_objects.filter(workspace=initiative.workspace)
        .filter(Q(parent_id__in=epic_ids) | Q(project_id__in=project_ids))
        .exclude(type__is_epic=True)
        .distinct()
    )
    return _progress_from_queryset(work_items)


def empty_rollup():
    return {"percent_complete": 0, "blockers": [], "at_risk": []}


def issue_ref(issue):
    return {"issue_id": str(issue.id), "name": issue.name}


def sanitize_summary_markdown(content: str) -> str:
    if not content:
        return content

    is_valid, _error, clean_html = validate_html_content(content)
    return clean_html if clean_html is not None else content


def _rollup_from_issue_queryset(issues_qs, at_risk_queryset):
    progress = _progress_from_queryset(issues_qs)
    if progress["total_count"] == 0:
        return empty_rollup(), True

    issue_ids = list(issues_qs.values_list("id", flat=True))
    blocker_ids = IssueBlocker.objects.filter(
        block_id__in=issue_ids,
        deleted_at__isnull=True,
    ).values_list("block_id", flat=True).distinct()
    blockers = [issue_ref(issue) for issue in Issue.objects.filter(id__in=blocker_ids)]

    at_risk = []
    seen = set()
    for status_update in at_risk_queryset.filter(
        status=StatusUpdate.Status.AT_RISK,
        deleted_at__isnull=True,
    ).select_related("epic", "initiative"):
        if status_update.epic_id and status_update.epic_id not in seen:
            at_risk.append(issue_ref(status_update.epic))
            seen.add(status_update.epic_id)
        elif status_update.initiative_id and status_update.initiative_id not in seen:
            at_risk.append(
                {
                    "issue_id": str(status_update.initiative_id),
                    "name": status_update.initiative.name,
                }
            )
            seen.add(status_update.initiative_id)

    rollup = {
        "percent_complete": progress["percent_complete"],
        "blockers": blockers,
        "at_risk": at_risk,
    }
    return rollup, False


def _initiative_issue_queryset(initiative):
    epic_ids = list(
        InitiativeEpic.objects.filter(
            initiative=initiative,
            deleted_at__isnull=True,
            epic__deleted_at__isnull=True,
            epic__type__is_epic=True,
        ).values_list("epic_id", flat=True)
    )
    project_ids = list(
        InitiativeProject.objects.filter(
            initiative=initiative,
            deleted_at__isnull=True,
            project__deleted_at__isnull=True,
        ).values_list("project_id", flat=True)
    )
    if not epic_ids and not project_ids:
        return Issue.issue_objects.none()

    return (
        Issue.issue_objects.filter(workspace=initiative.workspace)
        .filter(Q(parent_id__in=epic_ids) | Q(project_id__in=project_ids))
        .exclude(type__is_epic=True)
        .distinct()
    )


def compute_cycle_rollup(cycle):
    issues_qs = Issue.issue_objects.filter(
        issue_cycle__cycle_id=cycle.id,
        issue_cycle__deleted_at__isnull=True,
        project_id=cycle.project_id,
        workspace_id=cycle.workspace_id,
    ).distinct()
    at_risk_qs = StatusUpdate.objects.filter(
        workspace_id=cycle.workspace_id,
        epic__project_id=cycle.project_id,
    )
    return _rollup_from_issue_queryset(issues_qs, at_risk_queryset=at_risk_qs)


def compute_project_rollup(project):
    issues_qs = Issue.issue_objects.filter(
        project_id=project.id,
        workspace_id=project.workspace_id,
    )
    at_risk_qs = StatusUpdate.objects.filter(
        workspace_id=project.workspace_id,
        epic__project_id=project.id,
    )
    return _rollup_from_issue_queryset(issues_qs, at_risk_queryset=at_risk_qs)


def compute_initiative_rollup(initiative):
    progress = _initiative_progress(initiative)
    if progress["total_count"] == 0:
        return empty_rollup(), True

    issues_qs = _initiative_issue_queryset(initiative)
    at_risk_qs = StatusUpdate.objects.filter(
        workspace_id=initiative.workspace_id,
        initiative_id=initiative.id,
    )
    return _rollup_from_issue_queryset(issues_qs, at_risk_queryset=at_risk_qs)


def generate_summary_markdown(entity_label, rollup, api_key, model, provider):
    from plane.app.views.external.base import get_llm_response

    prompt = (
        "Write a concise markdown status digest. "
        "Use only the provided rollup facts and do not invent work items.\n"
        f"Entity: {entity_label}\n"
        f"Rollup: {json.dumps(rollup)}"
    )
    return get_llm_response("summarize_entity", prompt, api_key, model, provider)


def build_summary_payload(*, entity_label, rollup, is_empty, api_key, model, provider):
    if is_empty:
        return {"markdown": NO_ACTIVITY_MARKDOWN, "rollup": empty_rollup()}, None

    raw_markdown, error = generate_summary_markdown(entity_label, rollup, api_key, model, provider)
    if error or not raw_markdown:
        return None, error or "Failed to generate summary"

    markdown = sanitize_summary_markdown(raw_markdown)
    return {"markdown": markdown, "rollup": rollup}, None


def generate_share_token() -> str:
    return secrets.token_urlsafe(32)


def create_share_expires_at():
    return timezone.now() + DEFAULT_SHARE_TTL


def build_share_url(slug: str, share_token: str) -> str:
    return f"/api/workspaces/{slug}/summaries/shared/{share_token}/"


def is_share_active(summary: AISummary) -> bool:
    if summary.deleted_at is not None:
        return False
    if not summary.share_token:
        return False
    if summary.share_expires_at and summary.share_expires_at <= timezone.now():
        return False
    return True


def persist_shared_summary(
    *,
    workspace,
    project,
    entity_type,
    entity_id,
    markdown,
    rollup,
    generated_by,
):
    summary = AISummary(
        workspace=workspace,
        project=project,
        entity_type=entity_type,
        entity_id=entity_id,
        markdown=markdown,
        rollup=rollup,
        share_token=generate_share_token(),
        share_expires_at=create_share_expires_at(),
        generated_by=generated_by,
        created_by=generated_by,
    )
    summary.save(disable_auto_set_user=True)
    return summary


def get_active_shared_summary(*, slug: str, share_token: str):
    summary = AISummary.objects.filter(
        workspace__slug=slug,
        share_token=share_token,
        deleted_at__isnull=True,
    ).first()
    if summary is None or not is_share_active(summary):
        return None
    return summary


def build_public_shared_summary_payload(summary: AISummary):
    markdown = sanitize_summary_markdown(summary.markdown or "")
    markdown = UUID_PATTERN.sub("", markdown)
    return {"markdown": markdown.strip()}


def build_shared_summary_response(*, slug: str, payload: dict, summary: AISummary):
    return {
        **payload,
        "share_token": summary.share_token,
        "share_url": build_share_url(slug, summary.share_token),
        "expires_at": summary.share_expires_at.isoformat() if summary.share_expires_at else None,
    }
