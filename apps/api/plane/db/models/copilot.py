# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.conf import settings
from django.db import models

from .base import BaseModel


def empty_list():
    return []


class CopilotConversation(BaseModel):
    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="workspace_copilot_conversations",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="copilot_conversations",
    )
    title = models.CharField(max_length=255, blank=True, default="")
    last_message_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "Copilot Conversation"
        verbose_name_plural = "Copilot Conversations"
        db_table = "copilot_conversations"
        ordering = ("-last_message_at", "-created_at")
        indexes = [
            models.Index(fields=["workspace", "user", "-last_message_at"], name="copilot_conv_workspace_user_idx"),
        ]

    def __str__(self):
        return self.title or str(self.id)


class CopilotMessage(BaseModel):
    conversation = models.ForeignKey(
        CopilotConversation,
        on_delete=models.CASCADE,
        related_name="messages",
    )
    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="workspace_copilot_messages",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="copilot_messages",
    )
    project = models.ForeignKey(
        "db.Project",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="project_copilot_messages",
    )
    issue = models.ForeignKey(
        "db.Issue",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="issue_copilot_messages",
    )
    mode = models.CharField(max_length=30)
    prompt = models.TextField()
    answer = models.TextField(blank=True, default="")
    citations = models.JSONField(default=empty_list, blank=True)
    actions = models.JSONField(default=empty_list, blank=True)
    action_results = models.JSONField(default=empty_list, blank=True)

    class Meta:
        verbose_name = "Copilot Message"
        verbose_name_plural = "Copilot Messages"
        db_table = "copilot_messages"
        ordering = ("created_at",)
        indexes = [
            models.Index(fields=["conversation", "created_at"], name="copilot_msg_conversation_idx"),
            models.Index(fields=["workspace", "user", "created_at"], name="copilot_msg_workspace_user_idx"),
        ]

    def __str__(self):
        return f"{self.mode}: {self.prompt[:80]}"
