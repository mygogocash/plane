# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Timing-safe webhook signature verification for inbound connectors.

Shared by the Slack (AI-T18) and Sentry (AI-T20) connectors. All comparisons
use :func:`hmac.compare_digest` to avoid timing side channels. Secrets are
never logged or returned by these helpers.
"""

# Python imports
import hashlib
import hmac
import time

# Slack rejects requests whose timestamp is older than this (replay window).
SLACK_REPLAY_WINDOW_SECONDS = 60 * 5


def _to_bytes(value):
    if isinstance(value, bytes):
        return value
    return str(value).encode("utf-8")


def compute_slack_signature(signing_secret, timestamp, raw_body):
    base = b"v0:" + _to_bytes(timestamp) + b":" + _to_bytes(raw_body)
    digest = hmac.new(_to_bytes(signing_secret), base, hashlib.sha256).hexdigest()
    return f"v0={digest}"


def verify_slack_signature(signing_secret, timestamp, raw_body, signature, *, now=None):
    """Verify a Slack request signature with replay protection.

    Returns ``True`` only when the signing secret is present, the timestamp is
    within the replay window, and the HMAC matches (timing-safe).
    """
    if not signing_secret or not signature or timestamp in (None, ""):
        return False

    try:
        ts = int(timestamp)
    except (TypeError, ValueError):
        return False

    current = int(now if now is not None else time.time())
    if abs(current - ts) > SLACK_REPLAY_WINDOW_SECONDS:
        return False

    expected = compute_slack_signature(signing_secret, timestamp, raw_body)
    return hmac.compare_digest(expected, signature)


def compute_hmac_sha256(secret, raw_body):
    return hmac.new(_to_bytes(secret), _to_bytes(raw_body), hashlib.sha256).hexdigest()


def verify_hmac_sha256(secret, raw_body, signature, *, prefix=""):
    """Verify a generic HMAC-SHA256 hex signature (Sentry). Timing-safe."""
    if not secret or not signature:
        return False
    candidate = signature[len(prefix):] if prefix and signature.startswith(prefix) else signature
    expected = compute_hmac_sha256(secret, raw_body)
    return hmac.compare_digest(expected, candidate)
