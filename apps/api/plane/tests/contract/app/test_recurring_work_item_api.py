# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
from datetime import timedelta

# Third party imports
import pytest
from rest_framework import status
from rest_framework.test import APIClient

# Django imports
from django.utils import timezone

# Module imports
from plane.db.models import (
    Issue,
    Project,
    ProjectMember,
    RecurringWorkItem,
    RecurringWorkItemRun,
    User,
    WorkspaceMember,
    WorkItemTemplate,
)


def _recurrences_url(slug, project_id, pk=None):
    base = f"/api/workspaces/{slug}/projects/{project_id}/recurring-work-items/"
    return f"{base}{pk}/" if pk else base


def _runs_url(slug, project_id, pk):
    return f"{_recurrences_url(slug, project_id, pk)}runs/"


def _issues_url(slug, project_id):
    return f"/api/workspaces/{slug}/projects/{project_id}/issues/"


@pytest.fixture
def project(workspace, create_user):
    project = Project.objects.create(
        name="Recurring Project",
        identifier="REC",
        workspace=workspace,
        created_by=create_user,
    )
    ProjectMember.objects.create(project=project, member=create_user, role=20)
    return project


@pytest.fixture
def template(project):
    return WorkItemTemplate.objects.create(
        project=project,
        name="Daily checklist",
        template_data={"name": "Generated from template"},
    )


@pytest.fixture
def member_user(db, workspace, project):
    user = User.objects.create(email="recurring-member@plane.so", username="recurring_member")
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=15)
    ProjectMember.objects.create(project=project, member=user, role=15)
    return user


@pytest.fixture
def member_client(member_user):
    client = APIClient()
    client.force_authenticate(user=member_user)
    return client


@pytest.fixture
def guest_user(db, workspace, project):
    user = User.objects.create(email="recurring-guest@plane.so", username="recurring_guest")
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=5)
    ProjectMember.objects.create(project=project, member=user, role=5)
    return user


@pytest.fixture
def guest_client(guest_user):
    client = APIClient()
    client.force_authenticate(user=guest_user)
    return client


@pytest.mark.contract
class TestRecurringWorkItemAPI:
    @pytest.mark.django_db
    def test_member_creates_recurrence_owned_by_set_and_next_run_computed(
        self, member_client, workspace, project, member_user, template
    ):
        start_date = timezone.now() + timedelta(hours=1)

        response = member_client.post(
            _recurrences_url(workspace.slug, project.id),
            {
                "name": "Daily triage",
                "template": str(template.id),
                "payload": {"name": "Inline name"},
                "frequency": "daily",
                "timezone": "Asia/Bangkok",
                "start_date": start_date.isoformat(),
                "max_iterations": 5,
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        recurring = RecurringWorkItem.objects.get(project=project, name="Daily triage")
        assert recurring.workspace_id == workspace.id
        assert recurring.owned_by_id == member_user.id
        assert recurring.template_id == template.id
        assert recurring.payload == {"name": "Inline name"}
        assert recurring.next_run_at == start_date
        assert response.data["next_run_at"] is not None

    @pytest.mark.django_db
    def test_invalid_rrule_rejected_400(self, member_client, workspace, project):
        response = member_client.post(
            _recurrences_url(workspace.slug, project.id),
            {
                "name": "Bad custom",
                "frequency": "custom",
                "rrule": "not-an-rrule",
                "timezone": "UTC",
                "start_date": timezone.now().isoformat(),
                "max_iterations": 3,
            },
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert not RecurringWorkItem.objects.filter(project=project, name="Bad custom").exists()

    @pytest.mark.django_db
    def test_invalid_timezone_rejected_400(self, member_client, workspace, project):
        response = member_client.post(
            _recurrences_url(workspace.slug, project.id),
            {
                "name": "Bad timezone",
                "frequency": "daily",
                "timezone": "Mars/Olympus",
                "start_date": timezone.now().isoformat(),
                "max_iterations": 3,
            },
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert not RecurringWorkItem.objects.filter(project=project, name="Bad timezone").exists()

    @pytest.mark.django_db
    def test_missing_end_condition_rejected_400(self, member_client, workspace, project):
        response = member_client.post(
            _recurrences_url(workspace.slug, project.id),
            {
                "name": "Forever daily",
                "frequency": "daily",
                "timezone": "UTC",
                "start_date": timezone.now().isoformat(),
            },
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert not RecurringWorkItem.objects.filter(project=project, name="Forever daily").exists()

    @pytest.mark.django_db
    def test_guest_cannot_create_recurrence_403(self, guest_client, workspace, project):
        response = guest_client.post(
            _recurrences_url(workspace.slug, project.id),
            {
                "name": "Guest recurrence",
                "frequency": "daily",
                "timezone": "UTC",
                "start_date": timezone.now().isoformat(),
                "max_iterations": 3,
            },
            format="json",
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert not RecurringWorkItem.objects.filter(project=project).exists()

    @pytest.mark.django_db
    def test_empty_recurrence_list_returns_200_empty(self, member_client, workspace, project):
        response = member_client.get(_recurrences_url(workspace.slug, project.id))

        assert response.status_code == status.HTTP_200_OK
        assert response.data == []

    @pytest.mark.django_db
    def test_member_updates_recurrence_name_without_resetting_next_run(
        self, member_client, workspace, project, member_user
    ):
        next_run_at = timezone.now() + timedelta(days=3)
        recurring = RecurringWorkItem.objects.create(
            project=project,
            name="Old recurrence name",
            payload={"name": "Generated"},
            frequency=RecurringWorkItem.Frequency.DAILY,
            timezone="UTC",
            start_date=timezone.now(),
            next_run_at=next_run_at,
            max_iterations=3,
            owned_by=member_user,
        )

        response = member_client.patch(
            _recurrences_url(workspace.slug, project.id, recurring.id),
            {"name": "Updated recurrence name"},
            format="json",
        )

        recurring.refresh_from_db()

        assert response.status_code == status.HTTP_200_OK
        assert recurring.name == "Updated recurrence name"
        assert recurring.next_run_at == next_run_at

    @pytest.mark.django_db
    def test_member_deletes_recurrence(self, member_client, workspace, project, member_user):
        recurring = RecurringWorkItem.objects.create(
            project=project,
            name="Delete recurrence",
            payload={"name": "Generated"},
            frequency=RecurringWorkItem.Frequency.DAILY,
            timezone="UTC",
            start_date=timezone.now(),
            next_run_at=timezone.now(),
            max_iterations=3,
            owned_by=member_user,
        )

        response = member_client.delete(_recurrences_url(workspace.slug, project.id, recurring.id))
        list_response = member_client.get(_recurrences_url(workspace.slug, project.id))

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert list_response.status_code == status.HTTP_200_OK
        assert list_response.data == []

    @pytest.mark.django_db
    def test_runs_history_read_only(self, member_client, workspace, project, member_user):
        recurring = RecurringWorkItem.objects.create(
            project=project,
            name="Runs history",
            payload={"name": "Generated"},
            frequency=RecurringWorkItem.Frequency.DAILY,
            timezone="UTC",
            start_date=timezone.now() - timedelta(days=1),
            next_run_at=timezone.now(),
            max_iterations=3,
            owned_by=member_user,
        )
        generated_issue = Issue.objects.create(project=project, name="Generated issue")
        run = RecurringWorkItemRun.objects.create(
            project=project,
            recurring_work_item=recurring,
            generated_issue=generated_issue,
            run_at=timezone.now() - timedelta(hours=1),
        )

        response = member_client.get(_runs_url(workspace.slug, project.id, recurring.id))
        post_response = member_client.post(_runs_url(workspace.slug, project.id, recurring.id), {}, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1
        assert str(response.data[0]["id"]) == str(run.id)
        assert response.data[0]["run_at"] is not None
        assert response.data[0]["generated_issue"] == str(generated_issue.id)
        assert post_response.status_code == status.HTTP_405_METHOD_NOT_ALLOWED

    @pytest.mark.django_db
    def test_generated_issue_list_marks_recurring_work_item(self, member_client, workspace, project, member_user):
        generated_issue = Issue.objects.create(project=project, name="Generated issue")
        normal_issue = Issue.objects.create(project=project, name="Manual issue")
        recurring = RecurringWorkItem.objects.create(
            project=project,
            name="Daily generated issue",
            payload={"name": "Generated issue"},
            frequency=RecurringWorkItem.Frequency.DAILY,
            timezone="UTC",
            start_date=timezone.now() - timedelta(days=1),
            next_run_at=timezone.now(),
            max_iterations=3,
            owned_by=member_user,
        )
        RecurringWorkItemRun.objects.create(
            project=project,
            recurring_work_item=recurring,
            generated_issue=generated_issue,
            run_at=timezone.now() - timedelta(hours=1),
        )

        response = member_client.get(_issues_url(workspace.slug, project.id))

        assert response.status_code == status.HTTP_200_OK
        issues_by_id = {str(row["id"]): row for row in response.data["results"]}
        assert issues_by_id[str(generated_issue.id)]["is_recurring"] is True
        assert issues_by_id[str(normal_issue.id)]["is_recurring"] is False
