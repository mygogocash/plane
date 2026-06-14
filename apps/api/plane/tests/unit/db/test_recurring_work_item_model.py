# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import pytest

# Django imports
from django.db import IntegrityError, transaction
from django.utils import timezone

# Module imports
from plane.db.models import RecurringWorkItem, RecurringWorkItemRun
from plane.tests.factories import (
    IssueFactory,
    ProjectFactory,
    RecurringWorkItemFactory,
    UserFactory,
    WorkItemTemplateFactory,
)


@pytest.fixture
def project():
    return ProjectFactory()


@pytest.fixture
def owner():
    return UserFactory(email="recurring-owner@plane.so", username="recurring_owner")


@pytest.mark.unit
class TestRecurringWorkItemModel:
    @pytest.mark.django_db
    def test_recurring_work_item_persists(self, project, owner):
        template = WorkItemTemplateFactory(project=project)
        start_date = timezone.now()

        recurring = RecurringWorkItem.objects.create(
            project=project,
            name="Weekly bug scrub",
            template=template,
            payload={"name": "Bug scrub"},
            frequency=RecurringWorkItem.Frequency.WEEKLY,
            timezone="Asia/Bangkok",
            start_date=start_date,
            next_run_at=start_date,
            owned_by=owner,
        )

        assert recurring.id is not None
        assert recurring.project_id == project.id
        assert recurring.workspace_id == project.workspace_id
        assert recurring.template_id == template.id
        assert recurring.payload == {"name": "Bug scrub"}
        assert recurring.frequency == "weekly"
        assert recurring.timezone == "Asia/Bangkok"
        assert recurring.owned_by_id == owner.id
        assert recurring.is_active is True

    @pytest.mark.django_db
    def test_run_unique_per_recurring_and_run_at(self, project, owner):
        recurring = RecurringWorkItemFactory(project=project, owned_by=owner)
        generated_issue = IssueFactory(project=project)
        run_at = timezone.now()

        RecurringWorkItemRun.objects.create(
            project=project,
            recurring_work_item=recurring,
            generated_issue=generated_issue,
            run_at=run_at,
        )

        with pytest.raises(IntegrityError):
            with transaction.atomic():
                RecurringWorkItemRun.objects.create(
                    project=project,
                    recurring_work_item=recurring,
                    run_at=run_at,
                )
