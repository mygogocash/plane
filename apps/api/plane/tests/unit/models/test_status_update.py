# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import pytest

# Django imports
from django.db import IntegrityError, transaction

# Module imports
from plane.db.models import Initiative, Issue, IssueType, Project, State, StatusUpdate, StatusUpdateReaction


@pytest.fixture
def project(workspace, create_user):
    return Project.objects.create(
        name="Status Update Project",
        identifier="SUP",
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
def initiative(workspace):
    return Initiative.objects.create(workspace=workspace, name="Market expansion")


@pytest.mark.unit
class TestStatusUpdateModels:
    @pytest.mark.django_db
    def test_status_update__given_epic_owner__then_persists_comment_text(self, workspace, epic, create_user):
        status_update = StatusUpdate.objects.create(
            workspace=workspace,
            epic=epic,
            status=StatusUpdate.Status.AT_RISK,
            comment_html="<p>Blocked by beta access</p>",
            comment_json={"type": "doc"},
            actor=create_user,
        )

        assert status_update.epic == epic
        assert status_update.initiative is None
        assert status_update.status == StatusUpdate.Status.AT_RISK
        assert status_update.comment_stripped == "Blocked by beta access"

    @pytest.mark.django_db
    def test_status_update__given_initiative_owner__then_persists_comment_text(
        self, workspace, initiative, create_user
    ):
        status_update = StatusUpdate.objects.create(
            workspace=workspace,
            initiative=initiative,
            status=StatusUpdate.Status.ON_TRACK,
            comment_html="<p>Ready for launch</p>",
            comment_json={"type": "doc"},
            actor=create_user,
        )

        assert status_update.epic is None
        assert status_update.initiative == initiative
        assert status_update.status == StatusUpdate.Status.ON_TRACK
        assert status_update.comment_stripped == "Ready for launch"

    @pytest.mark.django_db
    def test_status_update__given_epic_and_initiative__then_check_constraint_rejects(
        self, workspace, epic, initiative, create_user
    ):
        with pytest.raises(IntegrityError):
            with transaction.atomic():
                StatusUpdate.objects.create(
                    workspace=workspace,
                    epic=epic,
                    initiative=initiative,
                    status=StatusUpdate.Status.OFF_TRACK,
                    actor=create_user,
                )

    @pytest.mark.django_db
    def test_status_update__given_no_owner__then_check_constraint_rejects(self, workspace, create_user):
        with pytest.raises(IntegrityError):
            with transaction.atomic():
                StatusUpdate.objects.create(
                    workspace=workspace,
                    status=StatusUpdate.Status.OFF_TRACK,
                    actor=create_user,
                )

    @pytest.mark.django_db
    def test_status_update_reaction__given_duplicate_active_reaction__then_partial_unique_rejects(
        self, workspace, epic, create_user
    ):
        status_update = StatusUpdate.objects.create(
            workspace=workspace,
            epic=epic,
            status=StatusUpdate.Status.ON_TRACK,
            actor=create_user,
        )
        StatusUpdateReaction.objects.create(status_update=status_update, actor=create_user, reaction="plus-one")

        with pytest.raises(IntegrityError):
            with transaction.atomic():
                StatusUpdateReaction.objects.create(
                    status_update=status_update,
                    actor=create_user,
                    reaction="plus-one",
                )
