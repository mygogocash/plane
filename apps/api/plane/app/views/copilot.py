# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import json
import re
from typing import Any

from django.db.models import Q
from rest_framework import serializers, status
from rest_framework.response import Response

from openai import OpenAI

from plane.app.permissions import ROLE, allow_permission
from plane.db.models import (
    Issue,
    IssueActivity,
    IssueComment,
    Page,
    Project,
    ProjectMember,
    WorkspaceMember,
)
from plane.utils.exception_logger import log_exception

from .base import BaseAPIView
from .external.base import get_llm_config, get_vertex_ai_config, is_llm_configured, is_vertex_provider


COPILOT_MODES = ("answer", "draft_subtasks", "auto")
EVIDENCE_LIMIT = 8
TEXT_LIMIT = 700


class CopilotMessageSerializer(serializers.Serializer):
    message = serializers.CharField(allow_blank=False, trim_whitespace=True)
    mode = serializers.ChoiceField(choices=COPILOT_MODES, default="auto")
    project_id = serializers.UUIDField(required=False, allow_null=True)
    issue_id = serializers.UUIDField(required=False, allow_null=True)


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

        if mode == "draft_subtasks" and workspace_role == ROLE.GUEST.value:
            return Response(
                {"error": "Guests cannot create Copilot subtask drafts."},
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

        return Response(
            {
                "mode": mode,
                "answer": llm_result.get("answer") or "",
                "citations": [_citation_from_evidence(item) for item in evidence],
                "subtask_draft": _normalize_subtask_draft(llm_result.get("subtask_draft"), mode),
            },
            status=status.HTTP_200_OK,
        )


def retrieve_copilot_evidence(slug, user, message, project_id=None, issue_id=None):
    project_ids = _readable_project_ids(slug, user, project_id)
    evidence = []

    if issue_id:
        issue = (
            Issue.issue_objects.filter(
                workspace__slug=slug,
                project_id__in=project_ids,
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
        "that a user must review before creation. Return JSON matching the requested response schema."
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
    return {
        "type": "object",
        "additionalProperties": False,
        "required": ["answer", "subtask_draft"],
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
    return {
        "type": "OBJECT",
        "required": ["answer", "subtask_draft"],
        "propertyOrdering": ["answer", "subtask_draft"],
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
