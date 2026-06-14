# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Module imports
from .base import BaseSerializer
from plane.db.models import WorkItemTemplate


class WorkItemTemplateSerializer(BaseSerializer):
    class Meta:
        model = WorkItemTemplate
        fields = [
            "id",
            "project_id",
            "workspace_id",
            "name",
            "description_html",
            "template_data",
            "issue_type",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields
