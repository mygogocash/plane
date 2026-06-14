# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""WF-T9 — transition auto-assignment.

A matched rule may carry ``auto_assign_member``; when a transition completes, that member
is assigned to the work item and notified. An invalid (non-member) target is skipped without
corrupting the transition. For approval-gated transitions, assignment fires only on the
applied move *after* final approval — never on the pending request.
"""

# Python imports
import pytest

# Module imports
from plane.db.models import (
    Issue,
    IssueAssignee,
    Notification,
    ProjectMember,
    State,
    User,
    WorkflowTransition,
)
from plane.utils.workflow import (
    apply_auto_assignment,
    apply_approval_decision,
    create_approval,
)


@pytest.fixture
def project(workspace, create_user):
    from plane.db.models import Project

    project = Project.objects.create(
        name="Workflow Project", identifier="WF", workspace=workspace, created_by=create_user
    )
    project.workflow_status = "enabled"
    project.save()
    ProjectMember.objects.create(project=project, member=create_user, role=20)
    return project


@pytest.fixture
def state_a(project):
    return State.objects.create(name="Todo", project=project, group="unstarted", color="#60646C")


@pytest.fixture
def state_b(project):
    return State.objects.create(name="Done", project=project, group="completed", color="#46A758")


@pytest.fixture
def assignee_user(db):
    return User.objects.create(email="assignee@plane.so", username="assignee_user", first_name="As", last_name="Ee")


@pytest.fixture
def assignee_member(project, assignee_user):
    return ProjectMember.objects.create(project=project, member=assignee_user, role=15)


@pytest.fixture
def issue_a(workspace, project, state_a):
    return Issue.objects.create(
        name="WI", workspace=workspace, project=project, state=state_a, created_by=project.created_by
    )


# NOTE: Plane's BaseModel.save() nulls created_by when there is no request-bound current
# user (the case in unit tests), so ``project.created_by`` is None here. Pass the persisted
# ``create_user`` fixture as the actor — ``requested_by``/notification triggered_by are plain
# FKs untouched by that auto-set logic.
@pytest.mark.unit
class TestAutoAssign:
    @pytest.mark.django_db
    def test_auto_assign_member_assigned_and_notified(
        self, create_user, project, state_a, state_b, issue_a, assignee_user, assignee_member
    ):
        rule = WorkflowTransition.objects.create(
            project=project, from_state=state_a, to_state=state_b, auto_assign_member=assignee_user
        )

        apply_auto_assignment(issue_a, rule, create_user)

        assert IssueAssignee.objects.filter(
            issue=issue_a, assignee=assignee_user, deleted_at__isnull=True
        ).exists()
        assert Notification.objects.filter(
            receiver=assignee_user, entity_identifier=issue_a.id
        ).exists()

    @pytest.mark.django_db
    def test_auto_assign_invalid_member_skipped(
        self, create_user, project, state_a, state_b, issue_a, assignee_user
    ):
        # assignee_user is NOT a ProjectMember of this project (no assignee_member fixture).
        rule = WorkflowTransition.objects.create(
            project=project, from_state=state_a, to_state=state_b, auto_assign_member=assignee_user
        )

        # Must be a no-op, never raise.
        apply_auto_assignment(issue_a, rule, create_user)

        assert not IssueAssignee.objects.filter(issue=issue_a, assignee=assignee_user).exists()

    @pytest.mark.django_db
    def test_no_auto_assign_member_is_noop(self, create_user, project, state_a, state_b, issue_a):
        rule = WorkflowTransition.objects.create(project=project, from_state=state_a, to_state=state_b)

        apply_auto_assignment(issue_a, rule, create_user)

        assert not IssueAssignee.objects.filter(issue=issue_a).exists()

    @pytest.mark.django_db
    def test_approval_gated_auto_assign_fires_post_approval_only(
        self, create_user, project, state_a, state_b, issue_a, assignee_user, assignee_member
    ):
        # Approval-required rule whose sole approver (role 15) is also the auto-assign target.
        rule = WorkflowTransition.objects.create(
            project=project,
            from_state=state_a,
            to_state=state_b,
            allowed_roles=[15],
            approval_required=True,
            auto_assign_member=assignee_user,
        )

        approval = create_approval(issue_a, rule, state_b.id, create_user)

        # Pending: no assignment yet.
        assert not IssueAssignee.objects.filter(issue=issue_a, assignee=assignee_user).exists()

        # The approver approves -> final -> item advances AND auto-assign fires.
        apply_approval_decision(approval, assignee_user, approved=True)

        issue_a.refresh_from_db()
        assert issue_a.state_id == state_b.id
        assert IssueAssignee.objects.filter(
            issue=issue_a, assignee=assignee_user, deleted_at__isnull=True
        ).exists()
