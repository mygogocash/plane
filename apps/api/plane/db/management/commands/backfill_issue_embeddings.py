# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import json

from django.core.management.base import BaseCommand

from plane.bgtasks.issue_embedding_task import backfill_issue_embeddings


class Command(BaseCommand):
    help = "Backfill issue embeddings for semantic similar-issue retrieval."

    def add_arguments(self, parser):
        parser.add_argument("--project-id", dest="project_id", default=None)
        parser.add_argument("--workspace-id", dest="workspace_id", default=None)
        parser.add_argument("--limit", dest="limit", type=int, default=100)
        parser.add_argument(
            "--queue",
            action="store_true",
            help="Queue the backfill on Celery instead of running it inline.",
        )

    def handle(self, *args, **options):
        task_kwargs = {
            "project_id": options.get("project_id"),
            "workspace_id": options.get("workspace_id"),
            "limit": options.get("limit"),
        }

        if options.get("queue"):
            task = backfill_issue_embeddings.delay(**task_kwargs)
            result = {"status": "queued", "task_id": task.id}
        else:
            result = backfill_issue_embeddings.run(**task_kwargs)

        self.stdout.write(json.dumps(result, sort_keys=True))
