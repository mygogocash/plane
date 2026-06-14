# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
import pytz
from rest_framework import serializers

# Module imports
from .base import BaseSerializer
from plane.db.models import RecurringWorkItem, RecurringWorkItemRun, WorkItemTemplate
from plane.utils.recurrence import compute_next_run_at, validate_rrule


class RecurringWorkItemSerializer(BaseSerializer):
    class Meta:
        model = RecurringWorkItem
        fields = [
            "id",
            "project_id",
            "workspace_id",
            "name",
            "template",
            "payload",
            "frequency",
            "rrule",
            "timezone",
            "start_date",
            "end_date",
            "max_iterations",
            "next_run_at",
            "owned_by",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["workspace_id", "project_id", "next_run_at", "owned_by"]

    def validate_name(self, value):
        if value is None or not value.strip():
            raise serializers.ValidationError("required")
        return value.strip()

    def validate_payload(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("must_be_object")
        return value

    def validate_template(self, value):
        project_id = self.context.get("project_id")
        if value is not None and project_id is not None:
            if not WorkItemTemplate.objects.filter(pk=value.id, project_id=project_id, is_active=True).exists():
                raise serializers.ValidationError("template_not_for_project")
        return value

    def validate_timezone(self, value):
        try:
            pytz.timezone(value)
        except pytz.UnknownTimeZoneError as exc:
            raise serializers.ValidationError("invalid_timezone") from exc
        return value

    def validate(self, attrs):
        frequency = attrs.get("frequency", self.instance.frequency if self.instance else None)
        rrule_value = attrs.get("rrule", self.instance.rrule if self.instance else None)
        timezone_name = attrs.get("timezone", self.instance.timezone if self.instance else None)
        start_date = attrs.get("start_date", self.instance.start_date if self.instance else None)
        end_date = attrs.get("end_date", self.instance.end_date if self.instance else None)
        max_iterations = attrs.get("max_iterations", self.instance.max_iterations if self.instance else None)

        if end_date is None and max_iterations is None:
            raise serializers.ValidationError({"end_condition": "required"})

        if start_date is not None and end_date is not None and start_date > end_date:
            raise serializers.ValidationError({"end_date": "must_be_after_start_date"})

        if frequency == RecurringWorkItem.Frequency.CUSTOM:
            try:
                validate_rrule(rrule_value)
            except Exception as exc:
                raise serializers.ValidationError({"rrule": "invalid_rrule"}) from exc

        schedule_fields = {"frequency", "rrule", "timezone", "start_date", "end_date", "max_iterations"}
        should_compute_next_run_at = self.instance is None or any(field in attrs for field in schedule_fields)

        if should_compute_next_run_at and start_date is not None and timezone_name is not None:
            try:
                next_run_at = compute_next_run_at(
                    frequency=frequency,
                    rrule_value=rrule_value,
                    timezone_name=timezone_name,
                    start_date=start_date,
                    last_run_at=None,
                    end_date=end_date,
                    max_iterations=max_iterations,
                    iterations_done=0,
                )
            except Exception as exc:
                raise serializers.ValidationError({"recurrence": "invalid"}) from exc

            if next_run_at is None:
                raise serializers.ValidationError({"next_run_at": "not_schedulable"})
            attrs["next_run_at"] = next_run_at

        return attrs


class RecurringWorkItemRunSerializer(BaseSerializer):
    generated_issue = serializers.UUIDField(source="generated_issue_id", read_only=True)

    class Meta:
        model = RecurringWorkItemRun
        fields = ["id", "run_at", "generated_issue"]
        read_only_fields = fields
