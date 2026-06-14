# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
import pytz
from dateutil.rrule import DAILY, MONTHLY, WEEKLY, rrule, rrulestr

# Django imports
from django.core.exceptions import ValidationError


FREQUENCY_MAP = {
    "daily": DAILY,
    "weekly": WEEKLY,
    "monthly": MONTHLY,
}


def validate_rrule(rrule_value):
    if not rrule_value:
        raise ValidationError("RRULE is required for custom recurrence.")

    try:
        rrulestr(rrule_value)
    except (TypeError, ValueError) as exc:
        raise ValidationError("Invalid RRULE.") from exc

    return rrule_value


def compute_next_run_at(
    frequency,
    rrule_value,
    timezone_name,
    start_date,
    last_run_at=None,
    end_date=None,
    max_iterations=None,
    iterations_done=0,
):
    if max_iterations is not None and iterations_done >= max_iterations:
        return None

    timezone = _get_timezone(timezone_name)
    local_start = _coerce_to_timezone(start_date, timezone)
    local_last_run_at = _coerce_to_timezone(last_run_at, timezone)

    recurrence = _build_recurrence(frequency, rrule_value, local_start)
    candidate = local_start if local_last_run_at is None else recurrence.after(local_last_run_at, inc=False)

    if candidate is None:
        return None

    next_run_at = _coerce_to_timezone(candidate, timezone).astimezone(pytz.UTC)
    local_end_date = _coerce_to_timezone(end_date, timezone)

    if local_end_date is not None and next_run_at > local_end_date.astimezone(pytz.UTC):
        return None

    return next_run_at


def _build_recurrence(frequency, rrule_value, start_date):
    if frequency == "custom":
        validate_rrule(rrule_value)
        return rrulestr(rrule_value, dtstart=start_date)

    try:
        recurrence_frequency = FREQUENCY_MAP[frequency]
    except KeyError as exc:
        raise ValidationError("Invalid recurrence frequency.") from exc

    return rrule(recurrence_frequency, dtstart=start_date)


def _coerce_to_timezone(value, timezone):
    if value is None:
        return None

    if value.tzinfo is None or value.utcoffset() is None:
        return timezone.localize(value)

    return value.astimezone(timezone)


def _get_timezone(timezone_name):
    try:
        return pytz.timezone(timezone_name)
    except pytz.UnknownTimeZoneError as exc:
        raise ValidationError("Invalid timezone.") from exc
