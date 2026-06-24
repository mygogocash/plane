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
    User,
    WorkflowTransition,
    WorkflowTransitionActor,
)
from plane.utils.workflow import (
    ActorNotAllowed,
    IllegalTransition,
    enforce_state_transition,
)


@pytest.fixture
def project(workspace, create_user):
    return Project.objects.create(
        name="Workflow Project", identifier="WF", workspace=workspace, created_by=create_user
    )


@pytest.fixture
def state_a(project):
    return State.objects.create(name="Todo", project=project, group="unstarted", color="#60646C")


@pytest.fixture
def state_b(project):
    return State.objects.create(name="Done", project=project, group="completed", color="#46A758")


@pytest.fixture
def state_c(project):
    return State.objects.create(name="In Progress", project=project, group="started", color="#F59E0B")


@pytest.fixture
def admin_member(project, create_user):
    return ProjectMember.objects.create(project=project, member=create_user, role=20)


@pytest.fixture
def member_user(db):
    return User.objects.create(email="member@plane.so", username="member_user", first_name="Mem", last_name="Ber")


@pytest.fixture
def member(project, member_user):
    return ProjectMember.objects.create(project=project, member=member_user, role=15)


@pytest.fixture
def guest_user(db):
    return User.objects.create(email="guest@plane.so", username="guest_user", first_name="Gue", last_name="St")


@pytest.fixture
def guest(project, guest_user):
    return ProjectMember.objects.create(project=project, member=guest_user, role=5)


@pytest.fixture
def issue_a(workspace, project, state_a, create_user):
    return Issue.objects.create(
        name="WI", workspace=workspace, project=project, state=state_a, created_by=create_user
    )


def _enable(project):
    project.workflow_status = "enabled"
    project.save()


@pytest.mark.unit
class TestEnforceStateTransition:
    @pytest.mark.django_db
    def test_workflow_disabled__allows_regardless_of_rules(
        self, project, state_a, state_b, issue_a, member, member_user
    ):
        # workflow_status defaults to "disabled"
        WorkflowTransition.objects.create(project=project, from_state=state_a, to_state=state_b, allowed_roles=[15])

        decision = enforce_state_transition(issue_a, state_b.id, member_user)

        assert decision.allowed is True

    @pytest.mark.django_db
    def test_enabled_no_rules__allows_unrestricted(self, project, state_a, state_b, issue_a, member, member_user):
        _enable(project)

        decision = enforce_state_transition(issue_a, state_b.id, member_user)

        assert decision.allowed is True

    @pytest.mark.django_db
    def test_enabled_rule_allows_member_role__allows(self, project, state_a, state_b, issue_a, member, member_user):
        _enable(project)
        WorkflowTransition.objects.create(project=project, from_state=state_a, to_state=state_b, allowed_roles=[15])

        decision = enforce_state_transition(issue_a, state_b.id, member_user)

        assert decision.allowed is True

    @pytest.mark.django_db
    def test_enabled_no_rule_for_target__raises_illegal_transition(
        self, project, state_a, state_b, state_c, issue_a, member, member_user
    ):
        _enable(project)
        WorkflowTransition.objects.create(project=project, from_state=state_a, to_state=state_b, allowed_roles=[15])

        # issue is in state_a which HAS an outgoing rule (A->B); A->C is not allowed
        with pytest.raises(IllegalTransition):
            enforce_state_transition(issue_a, state_c.id, member_user)

    @pytest.mark.django_db
    def test_enabled_rule_excludes_guest__raises_actor_not_allowed(
        self, project, state_a, state_b, issue_a, guest, guest_user
    ):
        _enable(project)
        WorkflowTransition.objects.create(project=project, from_state=state_a, to_state=state_b, allowed_roles=[15])

        with pytest.raises(ActorNotAllowed):
            enforce_state_transition(issue_a, state_b.id, guest_user)

    @pytest.mark.django_db
    def test_enabled_member_granted_by_role_and_explicit_actor__allows(
        self, project, state_a, state_b, issue_a, member, member_user
    ):
        _enable(project)
        rule = WorkflowTransition.objects.create(
            project=project, from_state=state_a, to_state=state_b, allowed_roles=[15]
        )
        WorkflowTransitionActor.objects.create(project=project, transition=rule, member=member)

        decision = enforce_state_transition(issue_a, state_b.id, member_user)

        assert decision.allowed is True

    @pytest.mark.django_db
    def test_enabled_empty_allowed_roles_no_grants__any_member_allowed(
        self, project, state_a, state_b, issue_a, member, member_user
    ):
        _enable(project)
        WorkflowTransition.objects.create(project=project, from_state=state_a, to_state=state_b, allowed_roles=[])

        decision = enforce_state_transition(issue_a, state_b.id, member_user)

        assert decision.allowed is True

    @pytest.mark.django_db
    def test_rule_in_other_project__invisible_for_this_issue(
        self, workspace, project, state_a, state_b, issue_a, member, member_user, create_user
    ):
        # A rule in a DIFFERENT project must not govern this issue
        other = Project.objects.create(
            name="Other Project", identifier="OTH", workspace=workspace, created_by=create_user
        )
        other_from = State.objects.create(name="OA", project=other, group="unstarted", color="#fff")
        other_to = State.objects.create(name="OB", project=other, group="completed", color="#000")
        WorkflowTransition.objects.create(project=other, from_state=other_from, to_state=other_to, allowed_roles=[20])

        _enable(project)  # this project is enabled but has no rules of its own

        decision = enforce_state_transition(issue_a, state_b.id, member_user)

        assert decision.allowed is True
