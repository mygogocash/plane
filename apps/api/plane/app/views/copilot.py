# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import json
import re
from typing import Any

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.response import Response

from openai import OpenAI

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import IssueCreateSerializer, LabelSerializer
from plane.db.models import (
    CopilotConversation,
    CopilotMessage,
    Issue,
    IssueActivity,
    IssueComment,
    Page,
    Project,
    ProjectMember,
    Initiative,
    StatusUpdate,
    WorkspaceMember,
    Workspace,
)
from plane.utils.exception_logger import log_exception

from .base import BaseAPIView
from .external.base import get_llm_config, get_vertex_ai_config, is_llm_configured, is_vertex_provider


COPILOT_MODES = ("answer", "draft_subtasks", "command", "auto")
EVIDENCE_LIMIT = 8
TEXT_LIMIT = 700
ISSUE_ACTION_FIELDS = {
    "name",
    "description_html",
    "priority",
    "state_id",
    "parent_id",
    "assignee_ids",
    "label_ids",
    "start_date",
    "target_date",
}
ISSUE_PRIORITIES = {"urgent", "high", "medium", "low", "none"}
WRITE_MODES = {"command", "draft_subtasks"}


class CopilotMessageSerializer(serializers.Serializer):
    conversation_id = serializers.UUIDField(required=False, allow_null=True)
    message = serializers.CharField(allow_blank=False, trim_whitespace=True)
    mode = serializers.ChoiceField(choices=COPILOT_MODES, default="auto")
    project_id = serializers.UUIDField(required=False, allow_null=True)
    issue_id = serializers.UUIDField(required=False, allow_null=True)


class CopilotQuerySerializer(serializers.Serializer):
    scope = serializers.ChoiceField(choices=("epic", "initiative", "workspace"))
    object_id = serializers.UUIDField(required=False, allow_null=True)
    question = serializers.CharField(allow_blank=False, trim_whitespace=True)

    def validate(self, attrs):
        if attrs["scope"] in {"epic", "initiative"} and not attrs.get("object_id"):
            raise serializers.ValidationError({"object_id": "object_id is required for scoped Copilot queries."})
        return attrs


class CopilotMessagesEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def post(self, request, slug):
        serializer = CopilotMessageSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        payload = serializer.validated_data
        mode = _normalize_mode(payload["mode"], payload["message"])

        workspace_role = (
            WorkspaceMember.objects.filter(
                member=request.user,
                workspace__slug=slug,
                is_active=True,
            )
            .values_list("role", flat=True)
            .first()
        )

        if mode in WRITE_MODES and workspace_role == ROLE.GUEST.value:
            return Response(
                {"error": "Guests cannot run Copilot write commands."},
                status=status.HTTP_403_FORBIDDEN,
            )

        api_key, model, provider = get_llm_config()
        if not is_llm_configured(api_key, model, provider):
            return Response(
                {"error": "LLM provider API key and model are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        project_id = payload.get("project_id")
        issue_id = payload.get("issue_id")
        if not _has_project_context_permission(slug, request.user, project_id, issue_id):
            return Response(
                {"error": "You don't have the required permissions."},
                status=status.HTTP_403_FORBIDDEN,
            )

        conversation = _get_or_create_conversation(
            slug=slug,
            user=request.user,
            conversation_id=payload.get("conversation_id"),
            message=payload["message"],
        )
        if conversation is None:
            return Response(
                {"error": "Copilot conversation was not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        evidence = retrieve_copilot_evidence(
            slug=slug,
            user=request.user,
            message=payload["message"],
            project_id=project_id,
            issue_id=issue_id,
        )
        context = {
            "workspace_slug": slug,
            "project_id": str(project_id) if project_id else None,
            "issue_id": str(issue_id) if issue_id else None,
        }

        try:
            llm_result = call_copilot_llm(
                api_key=api_key,
                model=model,
                provider=provider,
                mode=mode,
                message=payload["message"],
                evidence=evidence,
                context=context,
            )
        except Exception as error:
            log_exception(error)
            return Response(
                {"error": "An internal error has occurred."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        citations = [_citation_from_evidence(item) for item in evidence]
        actions = _normalize_actions(llm_result.get("actions"), mode)
        try:
            actions, action_results = _execute_copilot_actions(
                slug=slug,
                user=request.user,
                actions=actions,
                context_project_id=project_id,
                context_issue_id=issue_id,
            )
        except serializers.ValidationError as error:
            return Response(
                {
                    "conversation_id": str(conversation.id),
                    "mode": mode,
                    "answer": llm_result.get("answer") or "",
                    "citations": citations,
                    "subtask_draft": _normalize_subtask_draft(llm_result.get("subtask_draft"), mode),
                    "actions": _rejected_actions(actions, error.detail),
                    "action_results": [],
                    "error": error.detail,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        _persist_copilot_message(
            conversation=conversation,
            user=request.user,
            project_id=project_id,
            issue_id=issue_id,
            mode=mode,
            prompt=payload["message"],
            answer=llm_result.get("answer") or "",
            citations=citations,
            actions=actions,
            action_results=action_results,
        )

        return Response(
            {
                "conversation_id": str(conversation.id),
                "mode": mode,
                "answer": llm_result.get("answer") or "",
                "citations": citations,
                "subtask_draft": _normalize_subtask_draft(llm_result.get("subtask_draft"), mode),
                "actions": actions,
                "action_results": action_results,
            },
            status=status.HTTP_200_OK,
        )


class CopilotQueryEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def post(self, request, slug):
        serializer = CopilotQuerySerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        payload = serializer.validated_data
        api_key, model, provider = get_llm_config()
        if not is_llm_configured(api_key, model, provider):
            return Response(
                {
                    "error": "ai_provider_not_configured",
                    "message": "AI provider is not configured.",
                },
                status=status.HTTP_409_CONFLICT,
            )

        scope = payload["scope"]
        object_id = payload.get("object_id")
        question = payload["question"]
        evidence_result = retrieve_copilot_query_evidence(
            slug=slug,
            user=request.user,
            question=question,
            scope=scope,
            object_id=object_id,
        )
        if isinstance(evidence_result, Response):
            return evidence_result

        context = {
            "workspace_slug": slug,
            "scope": scope,
            "object_id": str(object_id) if object_id else None,
        }

        try:
            llm_result = call_copilot_llm(
                api_key=api_key,
                model=model,
                provider=provider,
                mode="answer",
                message=question,
                evidence=evidence_result,
                context=context,
            )
        except Exception:
            return Response(
                {
                    "error": "ai_unavailable",
                    "message": "AI is temporarily unavailable.",
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        answer = llm_result.get("answer") if isinstance(llm_result, dict) else ""
        summary = llm_result.get("summary") if isinstance(llm_result, dict) else ""
        return Response(
            {
                "answer": answer or "",
                "summary": summary or answer or "",
                "evidence": evidence_result,
            },
            status=status.HTTP_200_OK,
        )


class CopilotConversationsEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug):
        conversations = (
            CopilotConversation.objects.filter(workspace__slug=slug, user=request.user)
            .prefetch_related("messages")
            .order_by("-last_message_at", "-created_at")[:20]
        )
        return Response(
            [
                {
                    "id": str(conversation.id),
                    "title": conversation.title,
                    "last_message_at": conversation.last_message_at,
                    "messages": [
                        {
                            "id": str(message.id),
                            "mode": message.mode,
                            "prompt": message.prompt,
                            "answer": message.answer,
                            "citations": message.citations,
                            "actions": message.actions,
                            "action_results": message.action_results,
                            "created_at": message.created_at,
                        }
                        for message in conversation.messages.all()
                    ],
                }
                for conversation in conversations
            ],
            status=status.HTTP_200_OK,
        )


def _get_or_create_conversation(slug, user, conversation_id=None, message=""):
    if conversation_id:
        return CopilotConversation.objects.filter(
            id=conversation_id,
            workspace__slug=slug,
            user=user,
        ).first()

    workspace = Workspace.objects.get(slug=slug)
    title = _strip_text(message)[:80]
    return CopilotConversation.objects.create(
        workspace=workspace,
        user=user,
        title=title,
        last_message_at=timezone.now(),
    )


def _persist_copilot_message(
    conversation,
    user,
    project_id,
    issue_id,
    mode,
    prompt,
    answer,
    citations,
    actions,
    action_results,
):
    CopilotMessage.objects.create(
        conversation=conversation,
        workspace=conversation.workspace,
        user=user,
        project_id=project_id,
        issue_id=issue_id,
        mode=mode,
        prompt=prompt,
        answer=answer,
        citations=citations,
        actions=actions,
        action_results=action_results,
    )
    conversation.last_message_at = timezone.now()
    if not conversation.title:
        conversation.title = _strip_text(prompt)[:80]
    conversation.save(update_fields=["last_message_at", "title", "updated_at"])


def retrieve_copilot_evidence(slug, user, message, project_id=None, issue_id=None):
    project_ids = _readable_project_ids(slug, user, None)
    context_project_ids = _readable_project_ids(slug, user, project_id)
    evidence = []

    if issue_id:
        issue = (
            Issue.issue_objects.filter(
                workspace__slug=slug,
                project_id__in=context_project_ids,
                id=issue_id,
            )
            .select_related("project", "state")
            .first()
        )
        if issue:
            evidence.append(_issue_evidence(issue, slug))

    remaining = EVIDENCE_LIMIT - len(evidence)
    if remaining <= 0:
        return evidence

    search_filter = _search_filter(message, ["name", "description_stripped", "description_html"])
    issues = (
        Issue.issue_objects.filter(workspace__slug=slug, project_id__in=project_ids)
        .filter(search_filter)
        .exclude(id=issue_id)
        .select_related("project", "state")
        .order_by("-updated_at")[:remaining]
    )
    for issue in issues:
        evidence.append(_issue_evidence(issue, slug))

    remaining = EVIDENCE_LIMIT - len(evidence)
    if remaining <= 0:
        return evidence

    sub_issues = (
        Issue.issue_objects.filter(
            workspace__slug=slug,
            project_id__in=project_ids,
            parent_id=issue_id,
        )
        .select_related("project")
        .order_by("-updated_at")[:remaining]
        if issue_id
        else []
    )
    for issue in sub_issues:
        evidence.append(_issue_evidence(issue, slug, entity_type="sub_issue"))

    remaining = EVIDENCE_LIMIT - len(evidence)
    if remaining <= 0:
        return evidence

    projects = (
        Project.objects.filter(workspace__slug=slug, id__in=project_ids, archived_at__isnull=True)
        .filter(_search_filter(message, ["name", "description"]))
        .order_by("-updated_at")[:remaining]
    )
    for project in projects:
        evidence.append(
            _evidence(
                entity_type="project",
                entity_id=project.id,
                title=project.name,
                url=f"/{slug}/projects/{project.id}/issues",
                source_text=project.description,
            )
        )

    remaining = EVIDENCE_LIMIT - len(evidence)
    if remaining <= 0:
        return evidence

    comments = (
        IssueComment.objects.filter(
            workspace__slug=slug,
            project_id__in=project_ids,
            issue__archived_at__isnull=True,
            issue__is_draft=False,
            issue__project__archived_at__isnull=True,
        )
        .filter(_search_filter(message, ["comment_stripped", "comment_html"]))
        .select_related("issue", "project")
        .order_by("-updated_at")[:remaining]
    )
    for comment in comments:
        evidence.append(
            _evidence(
                entity_type="comment",
                entity_id=comment.id,
                title=comment.issue.name,
                url=f"/{slug}/projects/{comment.project_id}/issues/{comment.issue_id}",
                source_text=comment.comment_stripped or comment.comment_html,
            )
        )

    remaining = EVIDENCE_LIMIT - len(evidence)
    if remaining <= 0:
        return evidence

    activities = (
        IssueActivity.objects.filter(
            workspace__slug=slug,
            project_id__in=project_ids,
            issue__archived_at__isnull=True,
            issue__is_draft=False,
            issue__project__archived_at__isnull=True,
        )
        .filter(_search_filter(message, ["verb", "field", "old_value", "new_value", "comment"]))
        .select_related("issue", "project")
        .order_by("-created_at")[:remaining]
    )
    for activity in activities:
        activity_text = " ".join(
            filter(
                None,
                [activity.verb, activity.field, activity.old_value, activity.new_value, activity.comment],
            )
        )
        evidence.append(
            _evidence(
                entity_type="activity",
                entity_id=activity.id,
                title=activity.issue.name if activity.issue_id else "Issue activity",
                url=f"/{slug}/projects/{activity.project_id}/issues/{activity.issue_id}"
                if activity.issue_id
                else f"/{slug}/projects/{activity.project_id}/issues",
                source_text=activity_text,
            )
        )

    remaining = EVIDENCE_LIMIT - len(evidence)
    if remaining <= 0:
        return evidence

    pages = (
        Page.objects.filter(
            workspace__slug=slug,
            archived_at__isnull=True,
        )
        .filter(Q(projects__id__in=project_ids) | Q(owned_by=user))
        .filter(_search_filter(message, ["name", "description_stripped", "description_html"]))
        .distinct()
        .order_by("-updated_at")[:remaining]
    )
    for page in pages:
        evidence.append(
            _evidence(
                entity_type="page",
                entity_id=page.id,
                title=page.name,
                url=f"/{slug}/pages/{page.id}",
                source_text=page.description_stripped or page.description_html,
            )
        )

    return evidence


def retrieve_copilot_query_evidence(slug, user, question, scope, object_id=None):
    if scope == "workspace":
        return retrieve_copilot_evidence(slug=slug, user=user, message=question)
    if scope == "epic":
        return _epic_query_evidence(slug=slug, user=user, epic_id=object_id)
    if scope == "initiative":
        return _initiative_query_evidence(slug=slug, user=user, initiative_id=object_id)
    return Response({"error": "Unsupported Copilot query scope."}, status=status.HTTP_400_BAD_REQUEST)


def _epic_query_evidence(slug, user, epic_id):
    project_ids = _readable_project_ids(slug, user)
    epic = (
        Issue.issue_objects.filter(
            workspace__slug=slug,
            project_id__in=project_ids,
            id=epic_id,
            type__is_epic=True,
        )
        .select_related("project", "state")
        .first()
    )
    if epic is None:
        if Issue.issue_objects.filter(workspace__slug=slug, id=epic_id, type__is_epic=True).exists():
            return Response(
                {"error": "You don't have the required permissions."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return Response({"error": "Epic not found"}, status=status.HTTP_404_NOT_FOUND)

    evidence = [_issue_evidence(epic, slug, entity_type="epic")]
    evidence.extend(_status_update_evidence(slug=slug, user=user, epic=epic, initiative=None))
    return evidence[:EVIDENCE_LIMIT]


def _initiative_query_evidence(slug, user, initiative_id):
    initiative = Initiative.objects.filter(workspace__slug=slug, id=initiative_id).select_related("lead").first()
    if initiative is None:
        return Response({"error": "Initiative not found"}, status=status.HTTP_404_NOT_FOUND)

    evidence = [_initiative_evidence(initiative, slug)]
    evidence.extend(_status_update_evidence(slug=slug, user=user, epic=None, initiative=initiative))

    remaining = EVIDENCE_LIMIT - len(evidence)
    if remaining <= 0:
        return evidence[:EVIDENCE_LIMIT]

    project_ids = _readable_project_ids(slug, user)
    epics = (
        Issue.issue_objects.filter(
            workspace__slug=slug,
            initiative_memberships__initiative=initiative,
            initiative_memberships__deleted_at__isnull=True,
            project_id__in=project_ids,
            type__is_epic=True,
        )
        .select_related("project", "state")
        .order_by("-updated_at")
        .distinct()[:remaining]
    )
    for epic in epics:
        evidence.append(_issue_evidence(epic, slug, entity_type="epic"))

    return evidence[:EVIDENCE_LIMIT]


def _initiative_evidence(initiative, slug):
    lead_name = initiative.lead.display_name if initiative.lead_id else None
    source_text = " ".join(
        filter(
            None,
            [
                initiative.description_stripped or initiative.description_html,
                f"State: {initiative.state}" if initiative.state else None,
                f"Lead: {lead_name}" if lead_name else None,
            ],
        )
    )
    return _evidence(
        entity_type="initiative",
        entity_id=initiative.id,
        title=initiative.name,
        url=f"/{slug}/initiatives/{initiative.id}",
        source_text=source_text,
        extra={
            "state": initiative.state,
            "lead_id": str(initiative.lead_id) if initiative.lead_id else None,
        },
    )


def _status_update_evidence(slug, user, epic=None, initiative=None):
    queryset = StatusUpdate.objects.filter(workspace__slug=slug)
    if epic is not None:
        queryset = queryset.filter(epic=epic, epic__project_id__in=_readable_project_ids(slug, user))
    elif initiative is not None:
        queryset = queryset.filter(initiative=initiative)
    else:
        return []

    return [
        _evidence(
            entity_type="status_update",
            entity_id=status_update.id,
            title=status_update.epic.name if status_update.epic_id else status_update.initiative.name,
            url=_status_update_url(slug, status_update),
            source_text=status_update.comment_stripped or status_update.comment_html,
            extra={
                "status": status_update.status,
                "owner_type": "epic" if status_update.epic_id else "initiative",
                "owner_id": str(status_update.epic_id or status_update.initiative_id),
            },
        )
        for status_update in queryset.select_related("epic", "initiative", "actor").order_by("-created_at")[
            : EVIDENCE_LIMIT - 1
        ]
    ]


def _status_update_url(slug, status_update):
    if status_update.epic_id:
        return f"/{slug}/projects/{status_update.epic.project_id}/epics/{status_update.epic_id}"
    return f"/{slug}/initiatives/{status_update.initiative_id}"


def call_copilot_llm(api_key, model, provider, mode, message, evidence, context):
    if is_vertex_provider(provider):
        return call_vertex_copilot_llm(
            model=model,
            mode=mode,
            message=message,
            evidence=evidence,
            context=context,
        )

    client = OpenAI(api_key=api_key)
    system_prompt = _copilot_system_prompt()
    user_prompt = _copilot_user_prompt(mode, message, evidence, context)

    if provider.lower() == "gemini":
        model = f"gemini/{model}"

    schema = _copilot_response_schema()
    if hasattr(client, "responses"):
        response = client.responses.create(
            model=model,
            input=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            text={
                "format": {
                    "type": "json_schema",
                    "name": "copilot_response",
                    "strict": True,
                    "schema": schema,
                }
            },
        )
        return _parse_openai_json_response(response)

    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        response_format={"type": "json_object"},
    )
    return json.loads(response.choices[0].message.content)


def call_vertex_copilot_llm(model, mode, message, evidence, context):
    project, location = get_vertex_ai_config()
    if not project or not location:
        raise ValueError("Missing Google Vertex AI project or location")

    from google import genai
    from google.genai.types import HttpOptions

    client = genai.Client(
        vertexai=True,
        project=project,
        location=location,
        http_options=HttpOptions(api_version="v1"),
    )
    response = client.models.generate_content(
        model=model,
        contents=f"{_copilot_system_prompt()}\n\n{_copilot_user_prompt(mode, message, evidence, context)}",
        config={
            "response_mime_type": "application/json",
            "response_schema": _vertex_copilot_response_schema(),
            "temperature": 0.2,
        },
    )
    output_text = getattr(response, "text", None)
    if not output_text:
        raise ValueError("Google Vertex AI response did not include JSON text")
    return json.loads(output_text)


def _copilot_system_prompt():
    return (
        "You are Plane Copilot. Answer only from the provided Plane workspace evidence. "
        "If evidence is insufficient, say what is missing. For subtask drafts, propose child work items "
        "that a user must review before creation. For command mode, return only allowlisted actions: "
        "create_issue, update_issue, set_priority, set_state, assign_user, unassign_user, and create_label. "
        "Never return delete, archive, permission, billing, admin, import, or external side-effect actions. "
        "Return JSON matching the requested response schema."
    )


def _copilot_user_prompt(mode, message, evidence, context):
    return json.dumps(
        {
            "mode": mode,
            "message": message,
            "context": context,
            "evidence": evidence,
        },
        default=str,
    )


def _normalize_mode(mode, message):
    if mode != "auto":
        return mode

    if re.search(r"\b(create|update|set|assign|unassign|change|add label|make|move)\b", message, re.IGNORECASE):
        return "command"
    if re.search(r"\b(sub-?tasks?|break down|split|child work|children)\b", message, re.IGNORECASE):
        return "draft_subtasks"
    return "answer"


def _has_project_context_permission(slug, user, project_id=None, issue_id=None):
    if not project_id and not issue_id:
        return True

    project_ids = _readable_project_ids(slug, user, project_id)
    if project_id and project_id not in project_ids:
        return False

    if not issue_id:
        return True

    return Issue.issue_objects.filter(workspace__slug=slug, project_id__in=project_ids, id=issue_id).exists()


def _readable_project_ids(slug, user, project_id=None):
    projects = ProjectMember.objects.filter(
        workspace__slug=slug,
        member=user,
        is_active=True,
        project__archived_at__isnull=True,
    )
    if project_id:
        projects = projects.filter(project_id=project_id)
    return list(projects.values_list("project_id", flat=True).distinct())


def _search_filter(message, fields):
    terms = _search_terms(message)
    query = Q()
    if not terms:
        return query

    for term in terms:
        for field in fields:
            query |= Q(**{f"{field}__icontains": term})
    return query


def _search_terms(message):
    terms = re.findall(r"[A-Za-z0-9_@.-]{3,}", message or "")
    return terms[:6]


def _issue_evidence(issue, slug, entity_type="issue"):
    return _evidence(
        entity_type=entity_type,
        entity_id=issue.id,
        title=issue.name,
        url=f"/{slug}/projects/{issue.project_id}/issues/{issue.id}",
        source_text=issue.description_stripped or issue.description_html,
        extra={
            "project_id": str(issue.project_id),
            "priority": issue.priority,
            "state": issue.state.name if issue.state_id else None,
            "parent_id": str(issue.parent_id) if issue.parent_id else None,
        },
    )


def _evidence(entity_type, entity_id, title, url, source_text, extra=None):
    item = {
        "entity_type": entity_type,
        "entity_id": str(entity_id),
        "title": str(title or ""),
        "url": url,
        "source_text": _strip_text(source_text),
    }
    if extra:
        item.update(extra)
    return item


def _citation_from_evidence(item):
    return {
        "entity_type": item["entity_type"],
        "entity_id": item["entity_id"],
        "title": item["title"],
        "url": item["url"],
        "excerpt": item["source_text"],
    }


def _strip_text(value):
    if value is None:
        return ""
    text = value if isinstance(value, str) else json.dumps(value, default=str)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:TEXT_LIMIT]


def _normalize_subtask_draft(draft, mode):
    if mode != "draft_subtasks":
        return None
    if not isinstance(draft, dict):
        return {"items": []}

    items = []
    for item in draft.get("items", []):
        if not isinstance(item, dict):
            continue
        name = _strip_text(item.get("name"))
        if not name:
            continue
        priority = (
            item.get("priority") if item.get("priority") in {"urgent", "high", "medium", "low", "none"} else "none"
        )
        items.append(
            {
                "name": name[:255],
                "description_html": item.get("description_html") or "<p></p>",
                "priority": priority,
                "assignee_ids": _uuid_string_list(item.get("assignee_ids")),
                "label_ids": _uuid_string_list(item.get("label_ids")),
                "rationale": _strip_text(item.get("rationale")),
            }
        )
    return {"items": items}


def _uuid_string_list(value):
    if not isinstance(value, list):
        return []
    return [str(item) for item in value]


def _normalize_actions(raw_actions, mode):
    if mode != "command":
        return []
    if isinstance(raw_actions, dict):
        raw_actions = raw_actions.get("items", [])
    if not isinstance(raw_actions, list):
        return []

    normalized_actions = []
    for action in raw_actions:
        if not isinstance(action, dict):
            continue
        normalized_action = {key: value for key, value in action.items() if key != "status" and value is not None}
        normalized_action["type"] = str(normalized_action.get("type", "")).strip()
        normalized_action["status"] = "validated"
        normalized_actions.append(normalized_action)
    return normalized_actions


def _rejected_actions(actions, detail):
    return [
        {
            **action,
            "status": "rejected",
            "error": detail,
        }
        for action in actions
    ]


def _execute_copilot_actions(slug, user, actions, context_project_id=None, context_issue_id=None):
    if not actions:
        return [], []

    plans = []
    errors = []
    for index, action in enumerate(actions):
        try:
            plans.append(
                _build_action_plan(
                    slug=slug,
                    user=user,
                    action=action,
                    context_project_id=context_project_id,
                    context_issue_id=context_issue_id,
                )
            )
        except serializers.ValidationError as error:
            errors.append({"index": index, "type": action.get("type"), "detail": error.detail})

    if errors:
        raise serializers.ValidationError({"actions": errors})

    applied_actions = []
    action_results = []
    with transaction.atomic():
        for action, executor in plans:
            result = executor()
            applied_actions.append({**action, "status": "applied", "entity_id": result.get("entity_id")})
            action_results.append(result)

    return applied_actions, action_results


def _build_action_plan(slug, user, action, context_project_id=None, context_issue_id=None):
    action_type = action.get("type")
    if action_type == "create_issue":
        return _build_create_issue_plan(slug, user, action, context_project_id, context_issue_id)
    if action_type in {"update_issue", "set_priority", "set_state", "assign_user", "unassign_user"}:
        return _build_update_issue_plan(slug, user, action, context_project_id, context_issue_id)
    if action_type == "create_label":
        return _build_create_label_plan(slug, user, action, context_project_id)
    raise serializers.ValidationError({"type": "Unsupported Copilot action type."})


def _build_create_issue_plan(slug, user, action, context_project_id=None, context_issue_id=None):
    project_id = _action_project_id(action, context_project_id)
    project = _require_project(slug, project_id)
    _require_project_role(slug, user, project_id, ROLE.MEMBER.value)

    payload = _issue_payload_from_action(action)
    if not payload.get("name"):
        raise serializers.ValidationError({"name": "Issue name is required."})
    if not payload.get("description_html"):
        payload["description_html"] = "<p></p>"
    if not payload.get("parent_id") and context_issue_id:
        payload["parent_id"] = str(context_issue_id)

    serializer = IssueCreateSerializer(
        data=payload,
        context={
            "project_id": project_id,
            "workspace_id": project.workspace_id,
            "default_assignee_id": project.default_assignee_id,
        },
    )
    if not serializer.is_valid():
        raise serializers.ValidationError(serializer.errors)

    def execute():
        issue = serializer.save()
        return {
            "type": "create_issue",
            "status": "applied",
            "entity_id": str(issue.id),
            "url": f"/{slug}/projects/{project_id}/issues/{issue.id}",
            "title": issue.name,
        }

    return action, execute


def _build_update_issue_plan(slug, user, action, context_project_id=None, context_issue_id=None):
    project_id = _action_project_id(action, context_project_id)
    issue_id = _action_issue_id(action, context_issue_id)
    _require_project(slug, project_id)
    _require_project_role(slug, user, project_id, ROLE.MEMBER.value)

    issue = Issue.issue_objects.filter(workspace__slug=slug, project_id=project_id, id=issue_id).first()
    if not issue:
        raise serializers.ValidationError({"issue_id": "Issue was not found."})

    payload = _issue_update_payload_from_action(action, issue)
    if not payload:
        raise serializers.ValidationError({"fields": "At least one supported issue field is required."})

    serializer = IssueCreateSerializer(issue, data=payload, partial=True, context={"project_id": project_id})
    if not serializer.is_valid():
        raise serializers.ValidationError(serializer.errors)

    def execute():
        updated_issue = serializer.save()
        return {
            "type": "update_issue",
            "status": "applied",
            "entity_id": str(updated_issue.id),
            "url": f"/{slug}/projects/{project_id}/issues/{updated_issue.id}",
            "title": updated_issue.name,
        }

    return action, execute


def _build_create_label_plan(slug, user, action, context_project_id=None):
    project_id = _action_project_id(action, context_project_id)
    _require_project(slug, project_id)
    _require_project_role(slug, user, project_id, ROLE.ADMIN.value)

    payload = {
        "name": _strip_text(action.get("name"))[:255],
        "color": action.get("color") or "#60646C",
    }
    if not payload["name"]:
        raise serializers.ValidationError({"name": "Label name is required."})

    serializer = LabelSerializer(data=payload, context={"project_id": project_id})
    if not serializer.is_valid():
        raise serializers.ValidationError(serializer.errors)

    def execute():
        label = serializer.save(project_id=project_id)
        return {
            "type": "create_label",
            "status": "applied",
            "entity_id": str(label.id),
            "url": f"/{slug}/projects/{project_id}/settings/labels",
            "title": label.name,
        }

    return action, execute


def _issue_payload_from_action(action):
    payload = {}
    for field in ISSUE_ACTION_FIELDS:
        if field in action:
            payload[field] = action[field]
    if "priority" in payload and payload["priority"] not in ISSUE_PRIORITIES:
        payload["priority"] = "none"
    return payload


def _issue_update_payload_from_action(action, issue):
    action_type = action.get("type")
    if action_type == "set_priority":
        return {"priority": action.get("priority") if action.get("priority") in ISSUE_PRIORITIES else "none"}
    if action_type == "set_state":
        return {"state_id": action.get("state_id")}
    if action_type == "assign_user":
        assignee_ids = set(str(user_id) for user_id in issue.assignees.values_list("id", flat=True))
        if action.get("assignee_id"):
            assignee_ids.add(str(action["assignee_id"]))
        for assignee_id in _list_value(action.get("assignee_ids")):
            assignee_ids.add(str(assignee_id))
        return {"assignee_ids": list(assignee_ids)}
    if action_type == "unassign_user":
        assignee_ids = set(str(user_id) for user_id in issue.assignees.values_list("id", flat=True))
        if action.get("assignee_id"):
            assignee_ids.discard(str(action["assignee_id"]))
        for assignee_id in _list_value(action.get("assignee_ids")):
            assignee_ids.discard(str(assignee_id))
        return {"assignee_ids": list(assignee_ids)}

    fields = action.get("fields") if isinstance(action.get("fields"), dict) else {}
    payload = {field: value for field, value in fields.items() if field in ISSUE_ACTION_FIELDS}
    payload.update({field: action[field] for field in ISSUE_ACTION_FIELDS if field in action})
    if "priority" in payload and payload["priority"] not in ISSUE_PRIORITIES:
        payload["priority"] = "none"
    return payload


def _action_project_id(action, context_project_id=None):
    project_id = action.get("project_id") or context_project_id
    if not project_id:
        raise serializers.ValidationError({"project_id": "Project id is required."})
    return project_id


def _action_issue_id(action, context_issue_id=None):
    issue_id = action.get("issue_id") or context_issue_id
    if not issue_id:
        raise serializers.ValidationError({"issue_id": "Issue id is required."})
    return issue_id


def _list_value(value):
    return value if isinstance(value, list) else []


def _require_project(slug, project_id):
    project = Project.objects.filter(id=project_id, workspace__slug=slug, archived_at__isnull=True).first()
    if not project:
        raise serializers.ValidationError({"project_id": "Project was not found."})
    return project


def _require_project_role(slug, user, project_id, minimum_role):
    role = (
        ProjectMember.objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            member=user,
            is_active=True,
        )
        .values_list("role", flat=True)
        .first()
    )
    if role is None or role < minimum_role:
        raise serializers.ValidationError({"permission": "You do not have permission to run this Copilot action."})
    return role


def _copilot_response_schema() -> dict[str, Any]:
    subtask_item = {
        "type": "object",
        "additionalProperties": False,
        "required": ["name", "description_html", "priority", "assignee_ids", "label_ids", "rationale"],
        "properties": {
            "name": {"type": "string"},
            "description_html": {"type": "string"},
            "priority": {"type": "string", "enum": ["urgent", "high", "medium", "low", "none"]},
            "assignee_ids": {"type": "array", "items": {"type": "string"}},
            "label_ids": {"type": "array", "items": {"type": "string"}},
            "rationale": {"type": "string"},
        },
    }
    action_item = {
        "type": "object",
        "additionalProperties": False,
        "required": [
            "type",
            "project_id",
            "issue_id",
            "name",
            "description_html",
            "priority",
            "state_id",
            "parent_id",
            "assignee_id",
            "assignee_ids",
            "label_ids",
            "color",
        ],
        "properties": {
            "type": {
                "type": "string",
                "enum": [
                    "create_issue",
                    "update_issue",
                    "set_priority",
                    "set_state",
                    "assign_user",
                    "unassign_user",
                    "create_label",
                ],
            },
            "project_id": {"type": ["string", "null"]},
            "issue_id": {"type": ["string", "null"]},
            "name": {"type": ["string", "null"]},
            "description_html": {"type": ["string", "null"]},
            "priority": {"type": ["string", "null"], "enum": ["urgent", "high", "medium", "low", "none", None]},
            "state_id": {"type": ["string", "null"]},
            "parent_id": {"type": ["string", "null"]},
            "assignee_id": {"type": ["string", "null"]},
            "assignee_ids": {
                "anyOf": [
                    {"type": "array", "items": {"type": "string"}},
                    {"type": "null"},
                ]
            },
            "label_ids": {
                "anyOf": [
                    {"type": "array", "items": {"type": "string"}},
                    {"type": "null"},
                ]
            },
            "color": {"type": ["string", "null"]},
        },
    }
    return {
        "type": "object",
        "additionalProperties": False,
        "required": ["answer", "subtask_draft", "actions"],
        "properties": {
            "answer": {"type": "string"},
            "subtask_draft": {
                "anyOf": [
                    {
                        "type": "object",
                        "additionalProperties": False,
                        "required": ["items"],
                        "properties": {
                            "items": {
                                "type": "array",
                                "items": subtask_item,
                            }
                        },
                    },
                    {"type": "null"},
                ]
            },
            "actions": {"type": "array", "items": action_item},
        },
    }


def _vertex_copilot_response_schema() -> dict[str, Any]:
    subtask_item = {
        "type": "OBJECT",
        "required": ["name", "description_html", "priority", "assignee_ids", "label_ids", "rationale"],
        "propertyOrdering": ["name", "description_html", "priority", "assignee_ids", "label_ids", "rationale"],
        "properties": {
            "name": {"type": "STRING", "description": "Short child work item title."},
            "description_html": {"type": "STRING", "description": "HTML description for the child work item."},
            "priority": {
                "type": "STRING",
                "enum": ["urgent", "high", "medium", "low", "none"],
                "description": "Plane priority value.",
            },
            "assignee_ids": {"type": "ARRAY", "items": {"type": "STRING"}},
            "label_ids": {"type": "ARRAY", "items": {"type": "STRING"}},
            "rationale": {"type": "STRING", "description": "Why this draft is relevant to the evidence."},
        },
    }
    action_item = {
        "type": "OBJECT",
        "required": ["type"],
        "propertyOrdering": ["type", "project_id", "issue_id", "name", "description_html", "priority"],
        "properties": {
            "type": {
                "type": "STRING",
                "enum": [
                    "create_issue",
                    "update_issue",
                    "set_priority",
                    "set_state",
                    "assign_user",
                    "unassign_user",
                    "create_label",
                ],
                "description": "Allowlisted Plane action type.",
            },
            "project_id": {"type": "STRING"},
            "issue_id": {"type": "STRING"},
            "name": {"type": "STRING"},
            "description_html": {"type": "STRING"},
            "priority": {"type": "STRING", "enum": ["urgent", "high", "medium", "low", "none"]},
            "state_id": {"type": "STRING"},
            "parent_id": {"type": "STRING"},
            "assignee_id": {"type": "STRING"},
            "assignee_ids": {"type": "ARRAY", "items": {"type": "STRING"}},
            "label_ids": {"type": "ARRAY", "items": {"type": "STRING"}},
            "color": {"type": "STRING"},
        },
    }
    return {
        "type": "OBJECT",
        "required": ["answer", "subtask_draft", "actions"],
        "propertyOrdering": ["answer", "subtask_draft", "actions"],
        "properties": {
            "answer": {"type": "STRING", "description": "Grounded answer for the user."},
            "subtask_draft": {
                "type": "OBJECT",
                "nullable": True,
                "required": ["items"],
                "propertyOrdering": ["items"],
                "properties": {
                    "items": {
                        "type": "ARRAY",
                        "items": subtask_item,
                    }
                },
            },
            "actions": {"type": "ARRAY", "items": action_item},
        },
    }


def _parse_openai_json_response(response):
    output_text = getattr(response, "output_text", None)
    if output_text:
        return json.loads(output_text)

    for output in getattr(response, "output", []) or []:
        for content in getattr(output, "content", []) or []:
            text = getattr(content, "text", None)
            if text:
                return json.loads(text)

    raise ValueError("Copilot LLM response did not include JSON text")
