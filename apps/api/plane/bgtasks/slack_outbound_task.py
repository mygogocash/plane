# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Slack outbound: scheduled summaries + risk/overdue alerts (AI-T19).

``summary`` outbound bindings post a generated digest to the bound channel on
a schedule; ``alert`` outbound bindings post when an issue becomes
overdue/at-risk. Behaviour is fail-closed: integrations off (missing Slack
token) or no LLM provider → skip + log, never post. Each post is wrapped so a
single failure (e.g. a deleted channel) never aborts the batch. The bot token
is read from the stored ``SlackProjectSync`` and never logged.
"""

# Python imports
import logging

# Django imports
from django.utils import timezone

# Third party imports
import requests
from celery import shared_task

# Module imports
from plane.app.views.external.base import get_llm_config, is_llm_configured
from plane.db.models import Issue, SlackChannelBinding
from plane.utils.ai_summaries import build_summary_payload, compute_project_rollup

logger = logging.getLogger(__name__)

SLACK_POST_MESSAGE_URL = "https://slack.com/api/chat.postMessage"


def post_slack_message(token, channel_id, text):
    """Post a message to Slack. Seam — mocked in tests."""
    response = requests.post(
        SLACK_POST_MESSAGE_URL,
        headers={"Authorization": f"Bearer {token}"},
        json={"channel": channel_id, "text": text},
        timeout=10,
    )
    response.raise_for_status()
    return response


def build_summary_text(binding, api_key, model, provider):
    """Generate a digest string for an outbound summary binding, or ``None``."""
    rollup = compute_project_rollup(binding.project)
    is_empty = not rollup or rollup.get("total_count", 0) == 0
    payload, error = build_summary_payload(
        entity_label=f"Project {binding.project.name}",
        rollup=rollup,
        is_empty=is_empty,
        api_key=api_key,
        model=model,
        provider=provider,
    )
    if error or not payload:
        return None
    return payload.get("markdown")


def run_scheduled_summaries():
    """Post digests for all due outbound ``summary`` bindings. Fail-closed."""
    api_key, model, provider = get_llm_config()
    if not is_llm_configured(api_key, model, provider):
        logger.info("Slack outbound summaries skipped: no LLM provider configured")
        return {"status": "skipped_no_provider", "posted": 0}

    bindings = SlackChannelBinding.objects.filter(
        direction=SlackChannelBinding.Direction.OUTBOUND,
        kind=SlackChannelBinding.Kind.SUMMARY,
    ).select_related("slack_project_sync", "project")

    posted = 0
    skipped = 0
    for binding in bindings:
        sync = binding.slack_project_sync
        if sync is None or not sync.access_token:
            logger.info("Slack summary skipped: integration not connected (binding=%s)", binding.id)
            skipped += 1
            continue
        try:
            text = build_summary_text(binding, api_key, model, provider)
            if not text:
                skipped += 1
                continue
            post_slack_message(sync.access_token, binding.channel_id, text)
            posted += 1
        except Exception as error:
            # One bad binding (e.g. deleted channel) must not abort the batch.
            logger.info("Slack summary post failed (binding=%s): %s", binding.id, type(error).__name__)
            skipped += 1

    return {"status": "ok", "posted": posted, "skipped": skipped}


def _overdue_issue_ids(now):
    today = now.date()
    return (
        Issue.issue_objects.filter(target_date__lt=today)
        .exclude(state__group="completed")
        .exclude(state__group="cancelled")
    )


def run_overdue_alerts(now=None):
    """Post alerts for overdue issues to outbound ``alert`` bindings. Fail-closed."""
    now = now or timezone.now()
    alert_bindings = SlackChannelBinding.objects.filter(
        direction=SlackChannelBinding.Direction.OUTBOUND,
        kind=SlackChannelBinding.Kind.ALERT,
    ).select_related("slack_project_sync", "project")

    bindings_by_project = {}
    for binding in alert_bindings:
        bindings_by_project.setdefault(binding.project_id, []).append(binding)

    if not bindings_by_project:
        return {"status": "ok", "posted": 0}

    posted = 0
    skipped = 0
    overdue = _overdue_issue_ids(now).filter(project_id__in=bindings_by_project.keys())
    for issue in overdue:
        for binding in bindings_by_project.get(issue.project_id, []):
            sync = binding.slack_project_sync
            if sync is None or not sync.access_token:
                skipped += 1
                continue
            try:
                post_slack_message(
                    sync.access_token,
                    binding.channel_id,
                    f":warning: Overdue: {issue.name} (due {issue.target_date})",
                )
                posted += 1
            except Exception as error:
                logger.info("Slack alert post failed (binding=%s): %s", binding.id, type(error).__name__)
                skipped += 1

    return {"status": "ok", "posted": posted, "skipped": skipped}


@shared_task
def slack_scheduled_summaries_task():
    return run_scheduled_summaries()


@shared_task
def slack_overdue_alerts_task():
    return run_overdue_alerts()
