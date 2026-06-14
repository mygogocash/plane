# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Module imports
from .base import BaseSerializer

from plane.db.models import (
    WorkflowTransition,
    WorkflowTransitionActor,
    WorkItemApproval,
    WorkItemApprovalApprover,
)


class WorkflowTransitionSerializer(BaseSerializer):
    class Meta:
        model = WorkflowTransition
        fields = [
            "id",
            "project_id",
            "workspace_id",
            "from_state",
            "to_state",
            "issue_type",
            "allowed_roles",
            "approval_required",
            "fallback_state",
            "auto_assign_member",
            "auto_assign_role",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["workspace", "project"]


class WorkflowTransitionActorSerializer(BaseSerializer):
    class Meta:
        model = WorkflowTransitionActor
        fields = [
            "id",
            "project_id",
            "workspace_id",
            "transition",
            "member",
            "created_at",
        ]
        read_only_fields = ["workspace", "project"]


class WorkItemApprovalApproverSerializer(BaseSerializer):
    class Meta:
        model = WorkItemApprovalApprover
        fields = ["id", "member", "responded"]
        read_only_fields = ["workspace", "project"]


class WorkItemApprovalSerializer(BaseSerializer):
    approvers = WorkItemApprovalApproverSerializer(many=True, read_only=True)

    class Meta:
        model = WorkItemApproval
        fields = [
            "id",
            "project_id",
            "workspace_id",
            "issue",
            "transition",
            "requested_by",
            "status",
            "decided_by",
            "decided_at",
            "comment",
            "target_state",
            "fallback_state",
            "approvers",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["workspace", "project"]
