# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Async intake-triage classifier (AI-T17).

Enqueued when a new ``IntakeIssue`` is created. Produces a pending
``TriageSuggestion``. When no LLM provider is configured the manual queue is
left unchanged (no suggestion written).
"""

from celery import shared_task

from plane.db.models import IntakeIssue
from plane.utils.exception_logger import log_exception
from plane.utils.intake_triage import create_triage_suggestion_for_intake


@shared_task
def intake_triage_task(intake_issue_id):
    intake_issue = (
        IntakeIssue.objects.filter(pk=intake_issue_id)
        .select_related("issue", "project", "workspace")
        .first()
    )
    if intake_issue is None:
        return {"status": "missing", "intake_issue_id": str(intake_issue_id)}

    try:
        suggestion = create_triage_suggestion_for_intake(intake_issue)
    except Exception as error:
        # Never leak provider payloads/secrets; log the exception type only.
        log_exception(error)
        return {"status": "error", "intake_issue_id": str(intake_issue_id)}

    if suggestion is None:
        return {"status": "no_provider", "intake_issue_id": str(intake_issue_id)}

    return {
        "status": "ready",
        "intake_issue_id": str(intake_issue_id),
        "suggestion_id": str(suggestion.id),
    }
