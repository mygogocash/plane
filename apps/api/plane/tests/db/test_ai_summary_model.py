# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from django.core.exceptions import ValidationError

from plane.db.models import AISummary, Project, Workspace


@pytest.fixture
def workspace(create_user):
    return Workspace.objects.create(
        name="AI Summary Workspace",
        owner=create_user,
        slug="ai-summary-workspace",
    )


@pytest.fixture
def project(workspace, create_user):
    return Project.objects.create(
        name="AI Summary Project",
        identifier="AISP",
        workspace=workspace,
        created_by=create_user,
    )


@pytest.mark.django_db
class TestAISummaryModel:
    def test_ai_summary_fields_and_entity_type_choices(self, workspace, project, create_user):
        summary = AISummary(
            workspace=workspace,
            project=project,
            entity_type=AISummary.EntityType.CYCLE,
            entity_id=project.id,
            markdown="## Digest",
            rollup={"percent_complete": 42, "blockers": [], "at_risk": []},
            share_token="share-token-123",
            generated_by=create_user,
            created_by=create_user,
        )
        summary.save(created_by_id=create_user.id, disable_auto_set_user=True)

        assert summary.entity_type in {
            AISummary.EntityType.CYCLE,
            AISummary.EntityType.PROJECT,
            AISummary.EntityType.INITIATIVE,
        }
        assert summary.entity_id == project.id
        assert summary.markdown == "## Digest"
        assert summary.rollup["percent_complete"] == 42
        assert summary.share_token == "share-token-123"
        assert summary.generated_by_id == create_user.id
        assert summary.project_id == project.id
        assert summary.workspace_id == workspace.id

        initiative_summary = AISummary(
            workspace=workspace,
            project=None,
            entity_type=AISummary.EntityType.INITIATIVE,
            entity_id=project.id,
            markdown="Initiative digest",
            generated_by=create_user,
            created_by=create_user,
        )
        initiative_summary.save(created_by_id=create_user.id, disable_auto_set_user=True)
        assert initiative_summary.project_id is None
        assert initiative_summary.workspace_id == workspace.id

    def test_invalid_entity_type_rejected(self, workspace, project, create_user):
        summary = AISummary(
            workspace=workspace,
            project=project,
            entity_type="invalid",
            entity_id=project.id,
            markdown="Bad type",
            generated_by=create_user,
            created_by=create_user,
        )
        with pytest.raises(ValidationError):
            summary.full_clean()

    def test_share_token_index_exists(self):
        field = AISummary._meta.get_field("share_token")
        assert field.db_index is True
