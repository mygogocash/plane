# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
from datetime import datetime

import pytest
import pytz

# Django imports
from django.core.exceptions import ValidationError

# Module imports
from plane.utils.recurrence import compute_next_run_at, validate_rrule


@pytest.mark.unit
class TestRecurrenceUtils:
    def test_next_run_at_computed_from_start_in_timezone(self):
        timezone = pytz.timezone("Asia/Bangkok")
        start_date = timezone.localize(datetime(2026, 6, 14, 9, 30))

        next_run_at = compute_next_run_at(
            frequency="weekly",
            rrule_value=None,
            timezone_name="Asia/Bangkok",
            start_date=start_date,
            last_run_at=None,
            end_date=None,
            max_iterations=None,
            iterations_done=0,
        )

        assert next_run_at == start_date.astimezone(pytz.UTC)
        assert next_run_at.tzinfo is not None

    def test_invalid_rrule_rejected(self):
        with pytest.raises(ValidationError):
            validate_rrule("not-an-rrule")

    def test_next_run_respects_end_date(self):
        timezone = pytz.timezone("Asia/Bangkok")
        start_date = timezone.localize(datetime(2026, 6, 14, 9, 30))
        end_date = timezone.localize(datetime(2026, 6, 13, 9, 30))

        next_run_at = compute_next_run_at(
            frequency="weekly",
            rrule_value=None,
            timezone_name="Asia/Bangkok",
            start_date=start_date,
            last_run_at=None,
            end_date=end_date,
            max_iterations=None,
            iterations_done=0,
        )

        assert next_run_at is None

    def test_next_run_respects_max_iterations(self):
        timezone = pytz.timezone("Asia/Bangkok")
        start_date = timezone.localize(datetime(2026, 6, 14, 9, 30))

        next_run_at = compute_next_run_at(
            frequency="weekly",
            rrule_value=None,
            timezone_name="Asia/Bangkok",
            start_date=start_date,
            last_run_at=start_date,
            end_date=None,
            max_iterations=3,
            iterations_done=3,
        )

        assert next_run_at is None
