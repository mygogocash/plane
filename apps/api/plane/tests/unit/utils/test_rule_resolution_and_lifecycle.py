# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""WF-T8 — typed rule resolution + lifecycle (paused, maintenance bypass).

These layer on top of WF-T3's enforcement core (``enforce_state_transition`` /
``resolve_rule_set``). The mechanics of authorization are unchanged; only the
selection of *which* rule set governs an item, and the non-gating lifecycle
postures, are exercised here.
"""

# Python imports
import pytest

# Module imports
from plane.db.models import (
    Issue,
    IssueActivity,
    IssueType,
    Project,
    ProjectIssueType,
    ProjectMember,
    State,
    User,
    WorkflowTransition,
)
from plane.utils.workflow import (
    IllegalTransition,
    enforce_state_transition,
    resolve_rule_set,
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
def admin_user(create_user, project):
    # create_user is the workspace owner; make them a project admin too.
    ProjectMember.objects.create(project=project, member=create_user, role=20)
    return create_user


@pytest.fixture
def member_user(db):
    return User.objects.create(email="member@plane.so", username="member_user", first_name="Mem", last_name="Ber")


@pytest.fixture
def member(project, member_user):
    return ProjectMember.objects.create(project=project, member=member_user, role=15)


@pytest.fixture
def bug_type(workspace):
    return IssueType.objects.create(workspace=workspace, name="Bug")


@pytest.fixture
def bug_type_linked(project, bug_type):
    """A Bug type linked to the project via ProjectIssueType."""
    ProjectIssueType.objects.create(project=project, issue_type=bug_type)
    return bug_type


def _enable(project):
    project.workflow_status = "enabled"
    project.save()


def _issue(workspace, project, state, *, type=None):
    return Issue.objects.create(
        name="WI", workspace=workspace, project=project, state=state, type=type, created_by=project.created_by
    )


@pytest.mark.unit
class TestTypedRuleResolution:
    @pytest.mark.django_db
    def test_typed_item_uses_typed_rule_set__allows(
        self, workspace, project, state_a, state_b, state_c, member, member_user, bug_type_linked
    ):
        _enable(project)
        # Typed set: Bug allows A->B. Default set: A->C only.
        WorkflowTransition.objects.create(
            project=project, issue_type=bug_type_linked, from_state=state_a, to_state=state_b, allowed_roles=[15]
        )
        WorkflowTransition.objects.create(
            project=project, from_state=state_a, to_state=state_c, allowed_roles=[15]
        )
        bug_issue = _issue(workspace, project, state_a, type=bug_type_linked)

        decision = enforce_state_transition(bug_issue, state_b.id, member_user)

        assert decision.allowed is True

    @pytest.mark.django_db
    def test_typed_item_attempting_default_only_target__illegal(
        self, workspace, project, state_a, state_b, state_c, member, member_user, bug_type_linked
    ):
        _enable(project)
        WorkflowTransition.objects.create(
            project=project, issue_type=bug_type_linked, from_state=state_a, to_state=state_b, allowed_roles=[15]
        )
        WorkflowTransition.objects.create(
            project=project, from_state=state_a, to_state=state_c, allowed_roles=[15]
        )
        bug_issue = _issue(workspace, project, state_a, type=bug_type_linked)

        # A->C is only in the DEFAULT set; the typed set governs the Bug item, so it's illegal.
        with pytest.raises(IllegalTransition):
            enforce_state_transition(bug_issue, state_c.id, member_user)

    @pytest.mark.django_db
    def test_untyped_item_governed_by_default_set(
        self, workspace, project, state_a, state_b, state_c, member, member_user, bug_type_linked
    ):
        _enable(project)
        WorkflowTransition.objects.create(
            project=project, issue_type=bug_type_linked, from_state=state_a, to_state=state_b, allowed_roles=[15]
        )
        WorkflowTransition.objects.create(
            project=project, from_state=state_a, to_state=state_c, allowed_roles=[15]
        )
        untyped_issue = _issue(workspace, project, state_a, type=None)

        # The default set (A->C) governs an untyped item.
        decision = enforce_state_transition(untyped_issue, state_c.id, member_user)
        assert decision.allowed is True

        # And A->B (typed-only) is illegal for an untyped item.
        with pytest.raises(IllegalTransition):
            enforce_state_transition(untyped_issue, state_b.id, member_user)

    @pytest.mark.django_db
    def test_type_not_linked_to_project__type_rules_not_resolved(
        self, workspace, project, state_a, state_b, member, member_user, bug_type
    ):
        # bug_type exists on the workspace but is NOT linked to this project (no ProjectIssueType).
        _enable(project)
        WorkflowTransition.objects.create(
            project=project, issue_type=bug_type, from_state=state_a, to_state=state_b, allowed_roles=[20]
        )
        bug_issue = _issue(workspace, project, state_a, type=bug_type)

        rules = resolve_rule_set(bug_issue, project)

        # The unlinked type's rules must never be resolved; default set governs (and is empty here).
        assert not rules.filter(issue_type=bug_type).exists()
        # Empty default set => unrestricted move.
        decision = enforce_state_transition(bug_issue, state_b.id, member_user)
        assert decision.allowed is True


@pytest.mark.unit
class TestLifecycle:
    @pytest.mark.django_db
    def test_paused_not_gated__allows_even_with_restrictive_rule(
        self, workspace, project, state_a, state_b, member, member_user
    ):
        project.workflow_status = "paused"
        project.save()
        # A rule that would exclude this member if enforcing (admin-only).
        WorkflowTransition.objects.create(
            project=project, from_state=state_a, to_state=state_b, allowed_roles=[20]
        )
        issue = _issue(workspace, project, state_a)

        decision = enforce_state_transition(issue, state_b.id, member_user)

        assert decision.allowed is True

    @pytest.mark.django_db
    def test_admin_maintenance_bypass_on_illegal_move__allowed_and_logged(
        self, workspace, project, state_a, state_b, state_c, admin_user
    ):
        _enable(project)
        # Only A->B exists, so A->C is illegal under normal enforcement.
        WorkflowTransition.objects.create(
            project=project, from_state=state_a, to_state=state_b, allowed_roles=[20]
        )
        issue = _issue(workspace, project, state_a)

        decision = enforce_state_transition(issue, state_c.id, admin_user, maintenance_bypass=True)

        assert decision.allowed is True
        # An audit activity entry naming the bypass must be emitted.
        assert IssueActivity.objects.filter(issue=issue, verb="bypassed").exists()

    @pytest.mark.django_db
    def test_non_admin_cannot_bypass__still_enforced(
        self, workspace, project, state_a, state_b, state_c, member, member_user
    ):
        _enable(project)
        WorkflowTransition.objects.create(
            project=project, from_state=state_a, to_state=state_b, allowed_roles=[20]
        )
        issue = _issue(workspace, project, state_a)

        # A non-admin passing the kwarg must NOT escalate; enforcement still applies.
        with pytest.raises(IllegalTransition):
            enforce_state_transition(issue, state_c.id, member_user, maintenance_bypass=True)
        assert not IssueActivity.objects.filter(issue=issue, verb="bypassed").exists()
