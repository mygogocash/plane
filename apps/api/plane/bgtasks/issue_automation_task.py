# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import copy
import json
from datetime import timedelta

# Third party imports
from celery import shared_task
from django.db import transaction
from django.db.models import Q

# Django imports
from django.utils import timezone
from django.utils.html import strip_tags

# Module imports
from plane.app.serializers import IssueCreateSerializer
from plane.bgtasks.issue_activities_task import issue_activity
from plane.db.models import Issue, Label, Project, ProjectMember, RecurringWorkItem, RecurringWorkItemRun, State
from plane.utils.exception_logger import log_exception
from plane.utils.recurrence import compute_next_run_at


@shared_task
def archive_and_close_old_issues():
    archive_old_issues()
    close_old_issues()


@shared_task
def generate_recurring_work_items():
    now = timezone.now()
    stats = {
        "processed": 0,
        "generated": 0,
        "skipped": 0,
        "deactivated": 0,
        "warnings": [],
    }

    recurring_ids = list(
        RecurringWorkItem.objects.filter(is_active=True, next_run_at__lte=now).values_list("id", flat=True)
    )

    for recurring_id in recurring_ids:
        try:
            _generate_recurring_work_item(recurring_id, now, stats)
        except Exception as e:
            stats["skipped"] += 1
            log_exception(e)

    return stats


def _generate_recurring_work_item(recurring_id, now, stats):
    with transaction.atomic():
        recurring = (
            RecurringWorkItem.objects.select_for_update()
            .select_related("project", "project__workspace", "owned_by")
            .get(pk=recurring_id)
        )

        if not recurring.is_active or recurring.next_run_at > now:
            stats["skipped"] += 1
            return

        stats["processed"] += 1
        run_at = recurring.next_run_at

        if not _owned_by_can_generate(recurring):
            stats["skipped"] += 1
            return

        if _should_deactivate_before_generation(recurring, run_at):
            _deactivate_recurring_work_item(recurring)
            stats["deactivated"] += 1
            return

        run, created = RecurringWorkItemRun.objects.get_or_create(
            project=recurring.project,
            recurring_work_item=recurring,
            run_at=run_at,
        )
        if not created:
            _advance_recurring_work_item(recurring, now)
            stats["skipped"] += 1
            return

        issue, warnings = _create_recurring_issue(recurring)
        run.generated_issue = issue
        run.save(update_fields=["generated_issue", "updated_at"])

        _advance_recurring_work_item(recurring, now)
        stats["generated"] += 1
        stats["warnings"].extend(warnings)


def _owned_by_can_generate(recurring):
    return ProjectMember.objects.filter(
        project=recurring.project,
        member=recurring.owned_by,
        role__gte=15,
        is_active=True,
    ).exists()


def _should_deactivate_before_generation(recurring, run_at):
    if recurring.end_date is not None and run_at > recurring.end_date:
        return True

    if recurring.max_iterations is None:
        return False

    return RecurringWorkItemRun.objects.filter(
        recurring_work_item=recurring, generated_issue__isnull=False
    ).count() >= (recurring.max_iterations)


def _deactivate_recurring_work_item(recurring):
    recurring.is_active = False
    recurring.save(update_fields=["is_active", "updated_at"])


def _advance_recurring_work_item(recurring, now):
    iterations_done = RecurringWorkItemRun.objects.filter(
        recurring_work_item=recurring,
        generated_issue__isnull=False,
    ).count()
    next_run_at = compute_next_run_at(
        frequency=recurring.frequency,
        rrule_value=recurring.rrule,
        timezone_name=recurring.timezone,
        start_date=recurring.start_date,
        last_run_at=now,
        end_date=recurring.end_date,
        max_iterations=recurring.max_iterations,
        iterations_done=iterations_done,
    )

    if next_run_at is None:
        recurring.is_active = False
    else:
        recurring.next_run_at = next_run_at

    recurring.save(update_fields=["next_run_at", "is_active", "updated_at"])


def _create_recurring_issue(recurring):
    payload, sub_items, warnings = _recurring_issue_payload(recurring)
    project = recurring.project
    actor = recurring.owned_by

    serializer = IssueCreateSerializer(
        data=payload,
        context={
            "project_id": project.id,
            "workspace_id": project.workspace_id,
            "default_assignee_id": project.default_assignee_id,
            "actor": actor,
        },
    )
    serializer.is_valid(raise_exception=True)
    issue = serializer.save()
    Issue.objects.filter(pk=issue.pk).update(created_by=actor, updated_by=actor)
    issue.created_by = actor
    issue.updated_by = actor
    _create_recurring_sub_items(project, issue, sub_items, actor)
    return issue, warnings


def _recurring_issue_payload(recurring):
    payload = copy.deepcopy(recurring.payload or {})
    warnings = []

    if recurring.template_id and recurring.template and recurring.template.is_active:
        template_payload = copy.deepcopy(recurring.template.template_data or {})
        if recurring.template.issue_type_id and not template_payload.get("type"):
            template_payload["type"] = str(recurring.template.issue_type_id)
        template_payload.update(payload)
        payload = template_payload

    sub_items = payload.pop("sub_items", [])
    warnings.extend(_filter_template_refs(payload, recurring.project))
    return payload, sub_items if isinstance(sub_items, list) else [], warnings


def _template_warning(field, value, reason="missing"):
    return {"field": field, "value": str(value), "reason": reason}


def _filter_template_refs(payload, project):
    warnings = []

    state_id = payload.get("state_id")
    if state_id and not State.objects.filter(pk=state_id, project=project).exists():
        payload.pop("state_id", None)
        warnings.append(_template_warning("state_id", state_id))

    label_ids = payload.get("label_ids")
    if label_ids is not None:
        requested_label_ids = [str(label_id) for label_id in label_ids]
        valid_label_ids = {
            str(label_id)
            for label_id in Label.objects.filter(project=project, id__in=requested_label_ids).values_list(
                "id", flat=True
            )
        }
        payload["label_ids"] = [label_id for label_id in requested_label_ids if label_id in valid_label_ids]
        warnings.extend(
            _template_warning("label_ids", label_id)
            for label_id in requested_label_ids
            if label_id not in valid_label_ids
        )

    assignee_ids = payload.get("assignee_ids")
    if assignee_ids is not None:
        requested_assignee_ids = [str(assignee_id) for assignee_id in assignee_ids]
        valid_assignee_ids = {
            str(member_id)
            for member_id in ProjectMember.objects.filter(
                project=project,
                role__gte=15,
                is_active=True,
                member_id__in=requested_assignee_ids,
            ).values_list("member_id", flat=True)
        }
        payload["assignee_ids"] = [
            assignee_id for assignee_id in requested_assignee_ids if assignee_id in valid_assignee_ids
        ]
        warnings.extend(
            _template_warning("assignee_ids", assignee_id)
            for assignee_id in requested_assignee_ids
            if assignee_id not in valid_assignee_ids
        )

    return warnings


def _create_recurring_sub_items(project, parent, sub_items, actor):
    for sub_item in sub_items:
        if not isinstance(sub_item, dict) or not sub_item.get("name"):
            continue

        state_id = sub_item.get("state_id")
        if state_id and not State.objects.filter(pk=state_id, project=project).exists():
            state_id = None

        sub_issue = Issue.objects.create(
            project=project,
            workspace=project.workspace,
            parent=parent,
            type=parent.type,
            name=strip_tags(str(sub_item["name"])),
            state_id=state_id,
            priority=sub_item.get("priority", "none"),
            created_by=actor,
            updated_by=actor,
        )
        Issue.objects.filter(pk=sub_issue.pk).update(created_by=actor, updated_by=actor)


def archive_old_issues():
    try:
        # Get all the projects whose archive_in is greater than 0
        projects = Project.objects.filter(archive_in__gt=0)

        for project in projects:
            project_id = project.id
            archive_in = project.archive_in

            # Get all the issues whose updated_at in less that the archive_in month
            issues = Issue.issue_objects.filter(
                Q(
                    project=project_id,
                    archived_at__isnull=True,
                    updated_at__lte=(timezone.now() - timedelta(days=archive_in * 30)),
                    state__group__in=["completed", "cancelled"],
                ),
                Q(issue_cycle__isnull=True)
                | (Q(issue_cycle__cycle__end_date__lt=timezone.now()) & Q(issue_cycle__isnull=False)),
                Q(issue_module__isnull=True)
                | (Q(issue_module__module__target_date__lt=timezone.now()) & Q(issue_module__isnull=False)),
            ).filter(
                Q(issue_intake__status=1)
                | Q(issue_intake__status=-1)
                | Q(issue_intake__status=2)
                | Q(issue_intake__isnull=True)
            )

            # Check if Issues
            if issues:
                # Set the archive time to current time
                archive_at = timezone.now().date()

                issues_to_update = []
                for issue in issues:
                    issue.archived_at = archive_at
                    issues_to_update.append(issue)

                # Bulk Update the issues and log the activity
                if issues_to_update:
                    Issue.objects.bulk_update(issues_to_update, ["archived_at"], batch_size=100)
                    _ = [
                        issue_activity.delay(
                            type="issue.activity.updated",
                            requested_data=json.dumps({"archived_at": str(archive_at), "automation": True}),
                            actor_id=str(project.created_by_id),
                            issue_id=issue.id,
                            project_id=project_id,
                            current_instance=json.dumps({"archived_at": None}),
                            subscriber=False,
                            epoch=int(timezone.now().timestamp()),
                            notification=True,
                        )
                        for issue in issues_to_update
                    ]
        return
    except Exception as e:
        log_exception(e)
        return


def close_old_issues():
    try:
        # Get all the projects whose close_in is greater than 0
        projects = Project.objects.filter(close_in__gt=0).select_related("default_state")

        for project in projects:
            project_id = project.id
            close_in = project.close_in

            # Get all the issues whose updated_at in less that the close_in month
            issues = Issue.issue_objects.filter(
                Q(
                    project=project_id,
                    archived_at__isnull=True,
                    updated_at__lte=(timezone.now() - timedelta(days=close_in * 30)),
                    state__group__in=["backlog", "unstarted", "started"],
                ),
                Q(issue_cycle__isnull=True)
                | (Q(issue_cycle__cycle__end_date__lt=timezone.now()) & Q(issue_cycle__isnull=False)),
                Q(issue_module__isnull=True)
                | (Q(issue_module__module__target_date__lt=timezone.now()) & Q(issue_module__isnull=False)),
            ).filter(
                Q(issue_intake__status=1)
                | Q(issue_intake__status=-1)
                | Q(issue_intake__status=2)
                | Q(issue_intake__isnull=True)
            )

            # Check if Issues
            if issues:
                if project.default_state is None:
                    close_state = State.objects.filter(group="cancelled").first()
                else:
                    close_state = project.default_state

                issues_to_update = []
                for issue in issues:
                    issue.state = close_state
                    issues_to_update.append(issue)

                # Bulk Update the issues and log the activity
                if issues_to_update:
                    Issue.objects.bulk_update(issues_to_update, ["state"], batch_size=100)
                    [
                        issue_activity.delay(
                            type="issue.activity.updated",
                            requested_data=json.dumps({"closed_to": str(issue.state_id)}),
                            actor_id=str(project.created_by_id),
                            issue_id=issue.id,
                            project_id=project_id,
                            current_instance=None,
                            subscriber=False,
                            epoch=int(timezone.now().timestamp()),
                            notification=True,
                        )
                        for issue in issues_to_update
                    ]
        return
    except Exception as e:
        log_exception(e)
        return
