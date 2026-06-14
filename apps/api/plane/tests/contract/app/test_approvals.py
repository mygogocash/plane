# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import pytest
from rest_framework import status
from rest_framework.test import APIClient

# Module imports
from plane.db.models import (
    Issue,
    IssueActivity,
    IssueAssignee,
    Notification,
    Project,
    ProjectMember,
    State,
    User,
    WorkflowTransition,
    WorkflowTransitionActor,
    WorkItemApproval,
    WorkItemApprovalApprover,
    WorkspaceMember,
)


def _transition_url(slug, project_id, issue_id):
    return f"/api/workspaces/{slug}/projects/{project_id}/issues/{issue_id}/state-transition/"


def _approvals_url(slug, project_id, issue_id):
    return f"/api/workspaces/{slug}/projects/{project_id}/issues/{issue_id}/approvals/"


def _decision_url(slug, project_id, approval_id):
    return f"/api/workspaces/{slug}/projects/{project_id}/approvals/{approval_id}/decision/"


@pytest.fixture
def project(workspace, create_user):
    project = Project.objects.create(
        name="Approval Project", identifier="AP", workspace=workspace, created_by=create_user
    )
    # create_user is workspace admin (role 20) and project admin.
    ProjectMember.objects.create(project=project, member=create_user, role=20)
    project.workflow_status = "enabled"
    project.save()
    return project


@pytest.fixture
def state_a(project):
    return State.objects.create(name="Todo", project=project, group="unstarted", color="#60646C")


@pytest.fixture
def state_done(project):
    return State.objects.create(name="Done", project=project, group="completed", color="#46A758")


@pytest.fixture
def state_backlog(project):
    return State.objects.create(name="Backlog", project=project, group="backlog", color="#8B8D98")


@pytest.fixture
def issue(workspace, project, state_a, create_user):
    return Issue.objects.create(
        name="WI", workspace=workspace, project=project, state=state_a, created_by=create_user
    )


@pytest.fixture
def approver_one(db, workspace, project):
    user = User.objects.create(
        email="approver1@plane.so", username="approver_one", first_name="App", last_name="One"
    )
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=15)
    ProjectMember.objects.create(project=project, member=user, role=15)
    return user


@pytest.fixture
def approver_two(db, workspace, project):
    user = User.objects.create(
        email="approver2@plane.so", username="approver_two", first_name="App", last_name="Two"
    )
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=15)
    ProjectMember.objects.create(project=project, member=user, role=15)
    return user


@pytest.fixture
def requester(db, workspace, project):
    """A plain member who initiates the (approval-gated) move."""
    user = User.objects.create(
        email="requester@plane.so", username="requester_user", first_name="Req", last_name="Ster"
    )
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=15)
    ProjectMember.objects.create(project=project, member=user, role=15)
    return user


@pytest.fixture
def bystander(db, workspace, project):
    """A project member who is NOT an approver."""
    user = User.objects.create(
        email="bystander@plane.so", username="bystander_user", first_name="By", last_name="Stander"
    )
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=15)
    ProjectMember.objects.create(project=project, member=user, role=15)
    return user


def _client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _grant_actor(rule, project, user):
    """Make ``user`` an explicit allowed actor AND an assigned approver for ``rule``."""
    pm = ProjectMember.objects.get(project=project, member=user)
    WorkflowTransitionActor.objects.create(project=project, transition=rule, member=pm)


def _make_gated_rule(project, from_state, to_state, fallback_state, *approvers):
    """A→to rule requiring approval, with explicit approver/actor grants."""
    rule = WorkflowTransition.objects.create(
        project=project,
        from_state=from_state,
        to_state=to_state,
        fallback_state=fallback_state,
        allowed_roles=[],
        approval_required=True,
    )
    for user in approvers:
        _grant_actor(rule, project, user)
    return rule


@pytest.mark.contract
class TestApprovalGates:
    @pytest.mark.django_db
    def test_request_gated_move__returns_202_state_unchanged_approval_and_notifications_created(
        self, project, workspace, state_a, state_done, issue, approver_one, approver_two
    ):
        # approver_one + approver_two are the allowed actors AND the deciders. An allowed
        # actor (approver_one) initiates the gated move.
        _make_gated_rule(project, state_a, state_done, None, approver_one, approver_two)

        resp = _client(approver_one).post(
            _transition_url(workspace.slug, project.id, issue.id),
            {"to_state": str(state_done.id)},
            format="json",
        )

        assert resp.status_code == status.HTTP_202_ACCEPTED
        assert "approval_id" in resp.data

        issue.refresh_from_db()
        assert issue.state_id == state_a.id  # state did NOT change

        approval = WorkItemApproval.objects.get(id=resp.data["approval_id"])
        assert approval.status == "pending"
        assert approval.issue_id == issue.id
        assert approval.target_state_id == state_done.id

        # one approver row per approver derived from the rule's actor grants
        approver_users = set(
            WorkItemApprovalApprover.objects.filter(approval=approval).values_list(
                "member__member_id", flat=True
            )
        )
        assert approver_users == {approver_one.id, approver_two.id}

        # each approver receives a notification
        assert Notification.objects.filter(receiver=approver_one, entity_identifier=issue.id).exists()
        assert Notification.objects.filter(receiver=approver_two, entity_identifier=issue.id).exists()

    @pytest.mark.django_db
    def test_decision_approve__advances_only_when_all_approved_and_logs_activity(
        self, project, workspace, state_a, state_done, issue, approver_one, approver_two
    ):
        _make_gated_rule(project, state_a, state_done, None, approver_one, approver_two)

        request_resp = _client(approver_one).post(
            _transition_url(workspace.slug, project.id, issue.id),
            {"to_state": str(state_done.id)},
            format="json",
        )
        approval_id = request_resp.data["approval_id"]

        # first approver approves -> still pending, state unchanged
        resp1 = _client(approver_one).post(
            _decision_url(workspace.slug, project.id, approval_id),
            {"approved": True},
            format="json",
        )
        assert resp1.status_code == status.HTTP_200_OK
        issue.refresh_from_db()
        assert issue.state_id == state_a.id
        assert WorkItemApproval.objects.get(id=approval_id).status == "pending"

        # second approver approves -> advances to Done
        resp2 = _client(approver_two).post(
            _decision_url(workspace.slug, project.id, approval_id),
            {"approved": True},
            format="json",
        )
        assert resp2.status_code == status.HTTP_200_OK
        issue.refresh_from_db()
        assert issue.state_id == state_done.id
        assert WorkItemApproval.objects.get(id=approval_id).status == "approved"

        # an activity entry records the approval
        assert IssueActivity.objects.filter(issue=issue, field="approval", verb="approved").exists()

    @pytest.mark.django_db
    def test_decision_reject_with_fallback__routes_to_fallback_and_notifies_assignee_and_creator(
        self,
        project,
        workspace,
        state_a,
        state_done,
        state_backlog,
        create_user,
        requester,
        approver_one,
    ):
        # issue created_by create_user; assignee is requester.
        # BaseModel.save() nulls created_by when no request user is bound, so set it via
        # update() to bypass the auto-set and make the creator deterministic.
        issue = Issue.objects.create(
            name="WI-reject", workspace=workspace, project=project, state=state_a
        )
        Issue.objects.filter(pk=issue.pk).update(created_by=create_user)
        issue.refresh_from_db()
        IssueAssignee.objects.create(project=project, issue=issue, assignee=requester)

        rule = _make_gated_rule(project, state_a, state_done, state_backlog, approver_one)
        _grant_actor(rule, project, requester)

        request_resp = _client(requester).post(
            _transition_url(workspace.slug, project.id, issue.id),
            {"to_state": str(state_done.id)},
            format="json",
        )
        approval_id = request_resp.data["approval_id"]

        resp = _client(approver_one).post(
            _decision_url(workspace.slug, project.id, approval_id),
            {"approved": False},
            format="json",
        )
        assert resp.status_code == status.HTTP_200_OK

        issue.refresh_from_db()
        assert issue.state_id == state_backlog.id
        assert WorkItemApproval.objects.get(id=approval_id).status == "rejected"

        # assignee + creator notified about rejection
        assert Notification.objects.filter(receiver=requester, entity_identifier=issue.id).exists()
        assert Notification.objects.filter(receiver=create_user, entity_identifier=issue.id).exists()
        # rejection activity recorded
        assert IssueActivity.objects.filter(issue=issue, field="approval", verb="rejected").exists()

    @pytest.mark.django_db
    def test_decision_reject_without_fallback__stays_and_returns_validation_error(
        self, project, workspace, state_a, state_done, issue, requester, approver_one
    ):
        rule = _make_gated_rule(project, state_a, state_done, None, approver_one)
        _grant_actor(rule, project, requester)

        request_resp = _client(requester).post(
            _transition_url(workspace.slug, project.id, issue.id),
            {"to_state": str(state_done.id)},
            format="json",
        )
        approval_id = request_resp.data["approval_id"]

        resp = _client(approver_one).post(
            _decision_url(workspace.slug, project.id, approval_id),
            {"approved": False},
            format="json",
        )

        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert resp.data["error"] == "Approval request could not be completed"
        issue.refresh_from_db()
        assert issue.state_id == state_a.id  # no silent move

    @pytest.mark.django_db
    def test_non_approver_forbidden_but_workspace_admin_override_allowed_and_logged(
        self, project, workspace, state_a, state_done, issue, create_user, requester, approver_one, bystander
    ):
        rule = _make_gated_rule(project, state_a, state_done, None, approver_one)
        _grant_actor(rule, project, requester)

        request_resp = _client(requester).post(
            _transition_url(workspace.slug, project.id, issue.id),
            {"to_state": str(state_done.id)},
            format="json",
        )
        approval_id = request_resp.data["approval_id"]

        # a non-approver project member is forbidden
        forbidden = _client(bystander).post(
            _decision_url(workspace.slug, project.id, approval_id),
            {"approved": True},
            format="json",
        )
        assert forbidden.status_code == status.HTTP_403_FORBIDDEN
        assert forbidden.data["error"] == "You are not permitted to decide on this approval"

        # workspace admin (create_user) is not an assigned approver but may override
        override = _client(create_user).post(
            _decision_url(workspace.slug, project.id, approval_id),
            {"approved": True},
            format="json",
        )
        assert override.status_code == status.HTTP_200_OK
        issue.refresh_from_db()
        assert issue.state_id == state_done.id
        # override is logged in activity
        assert IssueActivity.objects.filter(
            issue=issue, field="approval", verb="approved", new_value__icontains="override"
        ).exists()

    @pytest.mark.django_db
    def test_in_flight_approval_resolves_on_snapshot_after_rule_edit(
        self, project, workspace, state_a, state_done, state_backlog, issue, requester, approver_one
    ):
        # rule created with fallback=Backlog; snapshot at request time
        rule = _make_gated_rule(project, state_a, state_done, state_backlog, approver_one)
        _grant_actor(rule, project, requester)

        request_resp = _client(requester).post(
            _transition_url(workspace.slug, project.id, issue.id),
            {"to_state": str(state_done.id)},
            format="json",
        )
        approval_id = request_resp.data["approval_id"]

        # admin edits the rule AFTER the request: clears the fallback
        rule.fallback_state = None
        rule.save()

        # reject resolves using snapshotted fallback (Backlog), not the edited rule (null)
        resp = _client(approver_one).post(
            _decision_url(workspace.slug, project.id, approval_id),
            {"approved": False},
            format="json",
        )
        assert resp.status_code == status.HTTP_200_OK
        issue.refresh_from_db()
        assert issue.state_id == state_backlog.id

    @pytest.mark.django_db
    def test_comment_with_script_markup_is_sanitized_on_persist_and_render(
        self, project, workspace, state_a, state_done, issue, requester, approver_one
    ):
        rule = _make_gated_rule(project, state_a, state_done, None, approver_one)
        _grant_actor(rule, project, requester)

        request_resp = _client(requester).post(
            _transition_url(workspace.slug, project.id, issue.id),
            {"to_state": str(state_done.id)},
            format="json",
        )
        approval_id = request_resp.data["approval_id"]

        malicious = "<p>looks good</p><script>alert('xss')</script>"
        resp = _client(approver_one).post(
            _decision_url(workspace.slug, project.id, approval_id),
            {"approved": True, "comment": malicious},
            format="json",
        )
        assert resp.status_code == status.HTTP_200_OK

        approval = WorkItemApproval.objects.get(id=approval_id)
        # persisted comment has the script stripped
        assert "<script>" not in approval.comment
        assert "looks good" in approval.comment

        # render path (GET list) also returns sanitized comment
        listing = _client(approver_one).get(_approvals_url(workspace.slug, project.id, issue.id))
        assert listing.status_code == status.HTTP_200_OK
        rendered = [a for a in listing.data if str(a["id"]) == str(approval_id)][0]
        assert "<script>" not in rendered["comment"]
