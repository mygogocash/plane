# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from plane.bgtasks.issue_embedding_task import issue_embedding_task
from plane.db.models import Issue
from plane.utils.issue_embeddings import issue_embeddings_enabled


@receiver(post_save, sender=Issue)
def enqueue_issue_embedding_refresh(sender, instance, raw=False, **kwargs):
    if raw or not issue_embeddings_enabled():
        return

    if getattr(instance, "archived_at", None):
        return

    transaction.on_commit(
        lambda: issue_embedding_task.delay(str(instance.id)),
        robust=True,
    )
