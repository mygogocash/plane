# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
from datetime import timedelta
from unittest.mock import patch

# Third party imports
import pytest

# Django imports
from django.utils import timezone

# Module imports
from plane.bgtasks.issue_automation_task import generate_recurring_work_items
from plane.db.models import (
    Issue,
    IssueAssignee,
    IssueLabel,
    Label,
    Project,
    ProjectMember,
    RecurringWorkItem,
    RecurringWorkItemRun,
    State,
)
from plane.tests.factories import (
    ProjectFactory,
    RecurringWorkItemFactory,
    UserFactory,
    WorkItemTemplateFactory,
)


@pytest.fixture
def project():
    return ProjectFactory()


@pytest.fixture
def owner(project):
    user = UserFactory(email="recurring-worker-owner@plane.so", username="recurring_worker_owner")
    ProjectMember.objects.create(project=project, member=user, role=20)
    return user


@pytest.mark.unit
@pytest.mark.django_db
class TestRecurringGeneration:
    def test_due_recurrence_generates_one_issue_and_run(self, project, owner):
        now = timezone.now()
        run_at = now - timedelta(minutes=10)
        recurring = RecurringWorkItemFactory(
            project=project,
            owned_by=owner,
            template=None,
            payload={"name": "Daily check", "priority": "high"},
            frequency=RecurringWorkItem.Frequency.DAILY,
            start_date=run_at - timedelta(days=7),
            next_run_at=run_at,
        )

        with patch("plane.bgtasks.issue_automation_task.timezone.now", return_value=now):
            result = generate_recurring_work_items()

        issue = Issue.objects.get(project=project, name="Daily check")
        run = RecurringWorkItemRun.objects.get(recurring_work_item=recurring, run_at=run_at)
        recurring.refresh_from_db()

        assert issue.priority == "high"
        assert issue.created_by_id == owner.id
        assert run.generated_issue_id == issue.id
        assert recurring.next_run_at > now
        assert recurring.is_active is True
        assert result["generated"] == 1

    def test_downtime_backfills_at_most_one_instance(self, project, owner):
        now = timezone.now()
        first_missed_run = now - timedelta(days=28)
        recurring = RecurringWorkItemFactory(
            project=project,
            owned_by=owner,
            template=None,
            payload={"name": "Weekly report"},
            frequency=RecurringWorkItem.Frequency.WEEKLY,
            start_date=first_missed_run,
            next_run_at=first_missed_run,
        )

        with patch("plane.bgtasks.issue_automation_task.timezone.now", return_value=now):
            generate_recurring_work_items()

        recurring.refresh_from_db()

        assert Issue.objects.filter(project=project, name="Weekly report").count() == 1
        assert RecurringWorkItemRun.objects.filter(recurring_work_item=recurring).count() == 1
        assert recurring.next_run_at > now

    def test_idempotent_no_duplicate_for_same_window(self, project, owner):
        now = timezone.now()
        run_at = now - timedelta(minutes=5)
        recurring = RecurringWorkItemFactory(
            project=project,
            owned_by=owner,
            template=None,
            payload={"name": "Already generated"},
            frequency=RecurringWorkItem.Frequency.DAILY,
            start_date=run_at - timedelta(days=1),
            next_run_at=run_at,
        )
        RecurringWorkItemRun.objects.create(project=project, recurring_work_item=recurring, run_at=run_at)

        with patch("plane.bgtasks.issue_automation_task.timezone.now", return_value=now):
            generate_recurring_work_items()

        assert Issue.objects.filter(project=project, name="Already generated").count() == 0
        assert RecurringWorkItemRun.objects.filter(recurring_work_item=recurring, run_at=run_at).count() == 1

    def test_owner_without_project_membership_skips_generation(self, project):
        now = timezone.now()
        outsider = UserFactory(email="recurring-outsider@plane.so", username="recurring_outsider")
        recurring = RecurringWorkItemFactory(
            project=project,
            owned_by=outsider,
            template=None,
            payload={"name": "Unauthorized recurrence"},
            frequency=RecurringWorkItem.Frequency.DAILY,
            start_date=now - timedelta(days=1),
            next_run_at=now,
        )

        with patch("plane.bgtasks.issue_automation_task.timezone.now", return_value=now):
            result = generate_recurring_work_items()

        assert Issue.objects.filter(project=project, name="Unauthorized recurrence").count() == 0
        assert RecurringWorkItemRun.objects.filter(recurring_work_item=recurring).count() == 0
        assert result["skipped"] == 1

    def test_recurrence_past_end_does_not_generate(self, project, owner):
        now = timezone.now()
        recurring = RecurringWorkItemFactory(
            project=project,
            owned_by=owner,
            template=None,
            payload={"name": "Ended recurrence"},
            frequency=RecurringWorkItem.Frequency.DAILY,
            start_date=now - timedelta(days=3),
            end_date=now - timedelta(minutes=1),
            next_run_at=now,
        )

        with patch("plane.bgtasks.issue_automation_task.timezone.now", return_value=now):
            result = generate_recurring_work_items()

        recurring.refresh_from_db()

        assert Issue.objects.filter(project=project, name="Ended recurrence").count() == 0
        assert RecurringWorkItemRun.objects.filter(recurring_work_item=recurring).count() == 0
        assert recurring.is_active is False
        assert recurring.next_run_at == now
        assert result["deactivated"] == 1

    def test_recurrence_at_max_iterations_does_not_generate(self, project, owner):
        now = timezone.now()
        recurring = RecurringWorkItemFactory(
            project=project,
            owned_by=owner,
            template=None,
            payload={"name": "Maxed recurrence"},
            frequency=RecurringWorkItem.Frequency.DAILY,
            start_date=now - timedelta(days=2),
            max_iterations=1,
            next_run_at=now,
        )
        previous_issue = Issue.objects.create(project=project, name="Previous generated issue")
        RecurringWorkItemRun.objects.create(
            project=project,
            recurring_work_item=recurring,
            generated_issue=previous_issue,
            run_at=now - timedelta(days=1),
        )

        with patch("plane.bgtasks.issue_automation_task.timezone.now", return_value=now):
            result = generate_recurring_work_items()

        recurring.refresh_from_db()

        assert Issue.objects.filter(project=project, name="Maxed recurrence").count() == 0
        assert RecurringWorkItemRun.objects.filter(recurring_work_item=recurring).count() == 1
        assert recurring.is_active is False
        assert result["deactivated"] == 1

    def test_generation_from_template_skips_missing_refs(self, project, owner):
        now = timezone.now()
        other_project = Project.objects.create(
            name="Other Recurring Project",
            identifier="ORP",
            workspace=project.workspace,
            created_by=owner,
        )
        other_state = State.objects.create(name="Other", project=other_project, group="unstarted", color="#60646C")
        other_label = Label.objects.create(project=other_project, name="other", color="#46A758")
        other_user = UserFactory(email="recurring-other@plane.so", username="recurring_other")
        template = WorkItemTemplateFactory(
            project=project,
            issue_type=None,
            template_data={
                "name": "Template issue",
                "state_id": str(other_state.id),
                "label_ids": [str(other_label.id)],
                "assignee_ids": [str(other_user.id)],
            },
        )
        recurring = RecurringWorkItemFactory(
            project=project,
            owned_by=owner,
            template=template,
            payload={},
            frequency=RecurringWorkItem.Frequency.DAILY,
            start_date=now - timedelta(days=1),
            next_run_at=now,
        )

        with patch("plane.bgtasks.issue_automation_task.timezone.now", return_value=now):
            result = generate_recurring_work_items()

        issue = Issue.objects.get(project=project, name="Template issue")
        warning_fields = {warning["field"] for warning in result["warnings"]}

        assert issue.state_id != other_state.id
        assert not IssueLabel.objects.filter(issue=issue).exists()
        assert not IssueAssignee.objects.filter(issue=issue).exists()
        assert RecurringWorkItemRun.objects.get(recurring_work_item=recurring).generated_issue_id == issue.id
        assert {"state_id", "label_ids", "assignee_ids"}.issubset(warning_fields)
