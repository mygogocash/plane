# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db.models import Q, Count, Case, CharField, Value, When
from django.utils import timezone

# Third party modules
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.views.base import BaseAPIView
from plane.db.models import Cycle
from plane.app.permissions import WorkspaceViewerPermission
from plane.app.serializers.cycle import CycleSerializer


class WorkspaceCyclesEndpoint(BaseAPIView):
    permission_classes = [WorkspaceViewerPermission]

    def get(self, request, slug):
        now = timezone.now()
        cycles = (
            Cycle.objects.filter(workspace__slug=slug)
            .select_related("project")
            .select_related("workspace")
            .select_related("owned_by")
            .filter(archived_at__isnull=True)
            .annotate(
                total_issues=Count(
                    "issue_cycle",
                    filter=Q(
                        issue_cycle__issue__archived_at__isnull=True,
                        issue_cycle__issue__is_draft=False,
                        issue_cycle__deleted_at__isnull=True,
                        issue_cycle__issue__deleted_at__isnull=True,
                    ),
                )
            )
            .annotate(
                completed_issues=Count(
                    "issue_cycle__issue__state__group",
                    filter=Q(
                        issue_cycle__issue__state__group="completed",
                        issue_cycle__issue__archived_at__isnull=True,
                        issue_cycle__issue__is_draft=False,
                        issue_cycle__issue__deleted_at__isnull=True,
                        issue_cycle__deleted_at__isnull=True,
                    ),
                )
            )
            .annotate(
                cancelled_issues=Count(
                    "issue_cycle__issue__state__group",
                    filter=Q(
                        issue_cycle__issue__state__group="cancelled",
                        issue_cycle__issue__archived_at__isnull=True,
                        issue_cycle__issue__is_draft=False,
                        issue_cycle__issue__deleted_at__isnull=True,
                        issue_cycle__deleted_at__isnull=True,
                    ),
                )
            )
            .annotate(
                started_issues=Count(
                    "issue_cycle__issue__state__group",
                    filter=Q(
                        issue_cycle__issue__state__group="started",
                        issue_cycle__issue__archived_at__isnull=True,
                        issue_cycle__issue__is_draft=False,
                        issue_cycle__issue__deleted_at__isnull=True,
                        issue_cycle__deleted_at__isnull=True,
                    ),
                )
            )
            .annotate(
                unstarted_issues=Count(
                    "issue_cycle__issue__state__group",
                    filter=Q(
                        issue_cycle__issue__state__group="unstarted",
                        issue_cycle__issue__archived_at__isnull=True,
                        issue_cycle__issue__is_draft=False,
                        issue_cycle__issue__deleted_at__isnull=True,
                        issue_cycle__deleted_at__isnull=True,
                    ),
                )
            )
            .annotate(
                backlog_issues=Count(
                    "issue_cycle__issue__state__group",
                    filter=Q(
                        issue_cycle__issue__state__group="backlog",
                        issue_cycle__issue__archived_at__isnull=True,
                        issue_cycle__issue__is_draft=False,
                        issue_cycle__issue__deleted_at__isnull=True,
                        issue_cycle__deleted_at__isnull=True,
                    ),
                )
            )
            .annotate(
                status=Case(
                    When(Q(start_date__lte=now) & Q(end_date__gte=now), then=Value("CURRENT")),
                    When(start_date__gt=now, then=Value("UPCOMING")),
                    When(end_date__lt=now, then=Value("COMPLETED")),
                    When(Q(start_date__isnull=True) & Q(end_date__isnull=True), then=Value("DRAFT")),
                    default=Value("DRAFT"),
                    output_field=CharField(),
                )
            )
            .order_by(self.kwargs.get("order_by", "-created_at"))
            .distinct()
        )

        cycle_view = request.GET.get("cycle_view", "all").lower()
        if cycle_view == "current":
            cycles = cycles.filter(start_date__lte=now, end_date__gte=now)
        elif cycle_view == "upcoming":
            cycles = cycles.filter(start_date__gt=now)
        elif cycle_view == "completed":
            cycles = cycles.filter(end_date__lt=now)
        elif cycle_view == "draft":
            cycles = cycles.filter(start_date__isnull=True, end_date__isnull=True)

        serializer = CycleSerializer(cycles, many=True).data
        return Response(serializer, status=status.HTTP_200_OK)
