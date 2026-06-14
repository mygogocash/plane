# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import pytest

# Django imports
from django.db import IntegrityError, transaction
from django.db.models import ProtectedError
from django.utils import timezone

# Module imports
from plane.db.models import (
    Issue,
    IssueType,
    Project,
    ProjectMember,
    State,
    WorkItemApproval,
    WorkItemApprovalApprover,
    WorkflowTransition,
)


@pytest.fixture
def project(workspace, create_user):
    """Create a test project (workspace + owner-member come from the conftest fixture)."""
    return Project.objects.create(
        name="Workflow Project",
        identifier="WF",
        workspace=workspace,
        created_by=create_user,
    )


@pytest.fixture
def todo_state(project):
    return State.objects.create(name="Todo", project=project, group="unstarted", color="#60646C")


@pytest.fixture
def done_state(project):
    return State.objects.create(name="Done", project=project, group="completed", color="#46A758")


@pytest.fixture
def fallback_state(project):
    return State.objects.create(name="Triage", project=project, group="triage", color="#4E5355")


@pytest.fixture
def task_type(workspace):
    return IssueType.objects.create(workspace=workspace, name="Task")


@pytest.fixture
def project_member(project, create_user):
    return ProjectMember.objects.create(project=project, member=create_user, role=15)


@pytest.fixture
def issue(workspace, project, todo_state, create_user):
    return Issue.objects.create(
        name="Test Work Item",
        workspace=workspace,
        project=project,
        state=todo_state,
        created_by=create_user,
    )


@pytest.mark.unit
class TestWorkflowModels:
    """Schema-level behavior for the Workflows & Approvals models (WF-T1)."""

    @pytest.mark.django_db
    def test_create_transition__defaults_disabled_workflow_and_empty_roles(self, project, todo_state, done_state):
        # Arrange / Assert: a freshly created project is unrestricted by default
        assert project.workflow_status == "disabled"

        # Act
        transition = WorkflowTransition.objects.create(
            project=project,
            from_state=todo_state,
            to_state=done_state,
        )

        # Assert
        assert transition.id is not None
        assert transition.allowed_roles == []
        assert transition.approval_required is False
        # ProjectBaseModel.save() backfills workspace from the project
        assert transition.workspace_id == project.workspace_id

    @pytest.mark.django_db
    def test_duplicate_transition_not_soft_deleted__raises_integrity_then_allows_after_soft_delete(
        self, project, todo_state, done_state, task_type
    ):
        # Arrange: a non-null issue_type so the partial-unique constraint applies on Django 4.2 (no NULLS NOT DISTINCT)
        first = WorkflowTransition.objects.create(
            project=project,
            issue_type=task_type,
            from_state=todo_state,
            to_state=done_state,
        )

        # Act / Assert: an identical, non-deleted rule violates the partial-unique constraint
        with pytest.raises(IntegrityError):
            with transaction.atomic():
                WorkflowTransition.objects.create(
                    project=project,
                    issue_type=task_type,
                    from_state=todo_state,
                    to_state=done_state,
                )

        # Arrange: soft-delete the first rule (manual deleted_at avoids the Celery cascade task)
        first.deleted_at = timezone.now()
        first.save()

        # Act / Assert: an identical rule is now permitted because the index only covers deleted_at IS NULL
        recreated = WorkflowTransition.objects.create(
            project=project,
            issue_type=task_type,
            from_state=todo_state,
            to_state=done_state,
        )
        assert recreated.id is not None

    @pytest.mark.django_db
    def test_delete_referenced_from_state__raises_protected_error(self, project, todo_state, done_state):
        WorkflowTransition.objects.create(project=project, from_state=todo_state, to_state=done_state)

        # from_state uses on_delete=PROTECT; a hard delete must be blocked
        with pytest.raises(ProtectedError):
            todo_state.delete(soft=False)

    @pytest.mark.django_db
    def test_delete_referenced_fallback_state__nulls_fallback(self, project, todo_state, done_state, fallback_state):
        transition = WorkflowTransition.objects.create(
            project=project,
            from_state=todo_state,
            to_state=done_state,
            fallback_state=fallback_state,
        )

        # fallback_state uses on_delete=SET_NULL; a hard delete should null the reference
        fallback_state.delete(soft=False)

        transition.refresh_from_db()
        assert transition.fallback_state_id is None

    @pytest.mark.django_db
    def test_approval_defaults_pending_and_approvers_attachable(
        self, project, todo_state, done_state, issue, project_member, create_user
    ):
        transition = WorkflowTransition.objects.create(
            project=project,
            from_state=todo_state,
            to_state=done_state,
            approval_required=True,
        )

        approval = WorkItemApproval.objects.create(
            project=project,
            issue=issue,
            transition=transition,
            requested_by=create_user,
            target_state=done_state,
        )

        assert approval.status == "pending"

        approver = WorkItemApprovalApprover.objects.create(
            project=project,
            approval=approval,
            member=project_member,
        )

        assert approver.responded is False
        assert list(approval.approvers.all()) == [approver]
