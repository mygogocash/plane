# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import pytest

# Django imports
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction

# Module imports
from plane.db.models import Initiative, InitiativeEpic, Issue, IssueType, Project, State


@pytest.fixture
def project(workspace, create_user):
    return Project.objects.create(
        name="Initiative Project",
        identifier="INI",
        workspace=workspace,
        created_by=create_user,
    )


@pytest.fixture
def state(project):
    return State.objects.create(name="Todo", project=project, group="unstarted", color="#60646C")


@pytest.fixture
def epic_type(workspace):
    return IssueType.objects.create(workspace=workspace, name="Epic", is_epic=True)


@pytest.fixture
def task_type(workspace):
    return IssueType.objects.create(workspace=workspace, name="Task", is_epic=False)


@pytest.fixture
def epic(workspace, project, state, epic_type, create_user):
    return Issue.objects.create(
        name="Launch platform",
        workspace=workspace,
        project=project,
        state=state,
        type=epic_type,
        created_by=create_user,
    )


@pytest.fixture
def work_item(workspace, project, state, task_type, create_user):
    return Issue.objects.create(
        name="Build landing page",
        workspace=workspace,
        project=project,
        state=state,
        type=task_type,
        created_by=create_user,
    )


@pytest.mark.unit
class TestInitiativeModels:
    @pytest.mark.django_db
    def test_create_initiative_defaults_state_draft(self, workspace):
        initiative = Initiative.objects.create(workspace=workspace, name="Market expansion")

        assert initiative.state == Initiative.State.DRAFT
        assert initiative.progress_snapshot == {}

    @pytest.mark.django_db
    def test_initiative_state_choices_enforced(self, workspace):
        initiative = Initiative(workspace=workspace, name="Market expansion", state="INVALID")

        with pytest.raises(ValidationError):
            initiative.full_clean()

    @pytest.mark.django_db
    def test_duplicate_initiative_epic_join_rejected_by_partial_unique(self, workspace, epic):
        initiative = Initiative.objects.create(workspace=workspace, name="Market expansion")
        InitiativeEpic.objects.create(initiative=initiative, epic=epic)

        with pytest.raises(IntegrityError):
            with transaction.atomic():
                InitiativeEpic.objects.create(initiative=initiative, epic=epic)

    @pytest.mark.django_db
    def test_initiative_epic_join_rejects_non_epic_issue(self, workspace, work_item):
        initiative = Initiative.objects.create(workspace=workspace, name="Market expansion")

        with pytest.raises(ValidationError):
            InitiativeEpic.objects.create(initiative=initiative, epic=work_item)
