# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from datetime import datetime

import jwt
import pytest
from django.conf import settings
from django.utils import timezone
from rest_framework import status

from plane.db.models import WorkspaceMemberInvite


@pytest.mark.contract
class TestWorkspaceInvitationAppAPI:
    @pytest.mark.django_db
    def test_resend_workspace_invitation__given_pending_invite__then_sends_existing_invite_email(
        self, mocker, session_client, workspace, create_user
    ):
        token = jwt.encode(
            {"email": "teammate@example.com", "timestamp": datetime.now().timestamp()},
            settings.SECRET_KEY,
            algorithm="HS256",
        )
        invite = WorkspaceMemberInvite.objects.create(
            email="teammate@example.com",
            workspace=workspace,
            token=token,
            role=15,
            created_by=create_user,
        )
        mocked_invitation_task = mocker.patch("plane.app.views.workspace.invite.workspace_invitation.delay")
        url = f"/api/workspaces/{workspace.slug}/invitations/{invite.id}/resend/"

        response = session_client.post(url, {}, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert response.data == {"message": "Invitation resent successfully"}
        mocked_invitation_task.assert_called_once_with(
            invite.email,
            workspace.id,
            invite.token,
            settings.APP_BASE_URL,
            create_user.email,
        )

    @pytest.mark.django_db
    def test_resend_workspace_invitation__given_responded_invite__then_rejects_without_sending(
        self, mocker, session_client, workspace, create_user
    ):
        invite = WorkspaceMemberInvite.objects.create(
            email="teammate@example.com",
            workspace=workspace,
            token="accepted-token",
            role=15,
            accepted=True,
            responded_at=timezone.now(),
            created_by=create_user,
        )
        mocked_invitation_task = mocker.patch("plane.app.views.workspace.invite.workspace_invitation.delay")
        url = f"/api/workspaces/{workspace.slug}/invitations/{invite.id}/resend/"

        response = session_client.post(url, {}, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data == {"error": "Invite already responded", "code": "INVITE_ALREADY_RESPONDED"}
        mocked_invitation_task.assert_not_called()
