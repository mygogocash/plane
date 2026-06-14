# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import pytest

# Module imports
from plane.db.models import (
    Issue,
    Project,
    ProjectMember,
    State,
    WorkflowTransition,
    WorkItemApproval,
    WorkItemApprovalApprover,
)
from plane.app.serializers import (
    WorkflowTransitionSerializer,
    WorkItemApprovalSerializer,
)


@pytest.fixture
def project(workspace, create_user):
    return Project.objects.create(
        name="Workflow Project", identifier="WF", workspace=workspace, created_by=create_user
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
def project_member(project, create_user):
    return ProjectMember.objects.create(project=project, member=create_user, role=15)


@pytest.fixture
def issue(workspace, project, todo_state, create_user):
    return Issue.objects.create(
        name="Test Work Item", workspace=workspace, project=project, state=todo_state, created_by=create_user
    )


@pytest.mark.unit
class TestWorkflowSerializers:
    @pytest.mark.django_db
    def test_transition_serializer__exposes_expected_fields(self, project, todo_state, done_state, fallback_state):
        transition = WorkflowTransition.objects.create(
            project=project,
            from_state=todo_state,
            to_state=done_state,
            fallback_state=fallback_state,
            allowed_roles=[15],
            approval_required=True,
            auto_assign_role=20,
        )

        data = WorkflowTransitionSerializer(transition).data

        for key in [
            "from_state",
            "to_state",
            "issue_type",
            "allowed_roles",
            "approval_required",
            "fallback_state",
            "auto_assign_member",
            "auto_assign_role",
        ]:
            assert key in data, f"missing field {key}"
        assert isinstance(data["allowed_roles"], list)
        assert data["allowed_roles"] == [15]
        assert data["approval_required"] is True

    @pytest.mark.django_db
    def test_transition_serializer__deserializes_allowed_roles_and_saves(self, project, todo_state, done_state):
        serializer = WorkflowTransitionSerializer(
            data={
                "from_state": str(todo_state.id),
                "to_state": str(done_state.id),
                "allowed_roles": [15],
                "approval_required": False,
            }
        )

        assert serializer.is_valid(), serializer.errors
        instance = serializer.save(project=project)

        assert instance.id is not None
        assert instance.allowed_roles == [15]
        assert instance.from_state_id == todo_state.id
        assert instance.workspace_id == project.workspace_id

    @pytest.mark.django_db
    def test_approval_serializer__serializes_with_nested_approvers(
        self, project, todo_state, done_state, fallback_state, issue, project_member, create_user
    ):
        transition = WorkflowTransition.objects.create(
            project=project, from_state=todo_state, to_state=done_state, approval_required=True
        )
        approval = WorkItemApproval.objects.create(
            project=project,
            issue=issue,
            transition=transition,
            requested_by=create_user,
            target_state=done_state,
            fallback_state=fallback_state,
        )
        approver = WorkItemApprovalApprover.objects.create(
            project=project, approval=approval, member=project_member
        )

        data = WorkItemApprovalSerializer(approval).data

        assert data["status"] == "pending"
        assert data["target_state"] == done_state.id
        assert data["fallback_state"] == fallback_state.id
        assert isinstance(data["approvers"], list)
        assert len(data["approvers"]) == 1
        assert data["approvers"][0]["id"] == approver.id

    @pytest.mark.django_db
    def test_approval_serializer__script_comment_does_not_crash(
        self, project, todo_state, done_state, issue, create_user
    ):
        transition = WorkflowTransition.objects.create(
            project=project, from_state=todo_state, to_state=done_state, approval_required=True
        )
        approval = WorkItemApproval.objects.create(
            project=project,
            issue=issue,
            transition=transition,
            requested_by=create_user,
            comment="<script>alert(1)</script>",
        )

        # Serializer is thin: it must not crash and preserves the raw value.
        # Sanitization is enforced at the write path (WF-T6), not here.
        data = WorkItemApprovalSerializer(approval).data
        assert data["comment"] == "<script>alert(1)</script>"
